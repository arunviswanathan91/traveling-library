const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const Core = require('../src/core.js');
const env = { DOMParser: class extends DOMParser {
  constructor() { super({onError: level => { if (level !== 'warning') throw new Error('Malformed XML'); }}); }
}, XMLSerializer, TextDecoder, atob };
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const record = (title = 'Synthetic study', id = 1, db = 'test-library', extra = '') =>
  `<record><rec-number>${id}</rec-number><foreign-keys><key app="EN" db-id="${db}">${id}</key></foreign-keys><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Example, A.</author></authors></contributors><titles><title>${title}</title></titles><dates><year>2025</year></dates><electronic-resource-num>10.1234/example.${id}</electronic-resource-num>${extra}</record>`;
const payload = rec => Buffer.from(`<EndNote><Cite>${rec}</Cite></EndNote>\0`).toString('base64');
const field = (rec, code = ' ADDIN EN.CITE ', encoding) => `<w:r><w:fldChar w:fldCharType="begin"><w:fldData>${encoding || payload(rec)}</w:fldData></w:fldChar></w:r><w:r><w:instrText>${code}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>[1]</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const doc = body => `<w:document xmlns:w="${ns}"><w:body><w:p>${body}</w:p></w:body></w:document>`;
const extract = body => Core.extract({'word/document.xml':doc(body)},env);

test('extracts rich records and collapses repeated citation/data fields', () => {
  const r=extract(field(record()) + field(record(), 'ADDIN EN.CITE.DATA'));
  assert.equal(r.records.length,1); assert.equal(r.citationFields,1); assert.equal(r.dataFields,1);
  assert.equal(r.records[0].title,'Synthetic study'); assert.equal(r.records[0].DOI,'10.1234/example.1');
  assert.deepEqual(r.warnings,[]);
});
test('grouped references, Unicode, XML escaping and formatted text survive',()=>{
  const r=extract(field(record('T cell &amp; β-cell <style face="italic">immunity</style>') + record('Second',2)));
  assert.equal(r.records.length,2); assert.equal(r.records[0].title,'T cell & β-cell immunity');
  assert.match(r.records[0].xml, /face="italic"/);
});
test('decodes UTF-16 LE EndNote field payloads',()=>{
  const p=Buffer.from(`<EndNote><Cite>${record('β')}</Cite></EndNote>\0`,'utf16le').toString('base64');
  assert.equal(extract(field('', 'ADDIN EN.CITE', p)).records[0].title,'β');
});
test('record numbers are scoped to source library',()=>{
  assert.equal(extract(field(record('One',1,'a'))+field(record('Two',1,'b'))).records.length,2);
});
test('ignores deleted revisions and unrelated Word fields',()=>{
  const r=extract(`<w:del>${field(record('Deleted'))}</w:del>`+field(record('Ignored'),'ADDIN ZOTERO_ITEM'));
  assert.equal(r.records.length,0); assert.equal(r.deletedFields,1);
});
test('reads footnotes and header stories',()=>{
  const r=Core.extract({'word/document.xml':doc(''),'word/footnotes.xml':doc(field(record())), 'word/header1.xml':doc(field(record('Header',2)))},env);
  assert.equal(r.records.length,2);
});
test('joins split field instructions',()=>{
  const f=field(record()).replace(' ADDIN EN.CITE ',' ADDIN EN.</w:instrText></w:r><w:r><w:instrText>CITE ');
  assert.equal(extract(f).records.length,1);
});
test('supports nested EN.CITE.DATA field',()=>{
  const inner=field(record(),'ADDIN EN.CITE.DATA');
  const outer=field(record()).replace('<w:r><w:fldChar w:fldCharType="separate"/>',inner+'<w:r><w:fldChar w:fldCharType="separate"/>');
  const r=extract(outer); assert.equal(r.records.length,1); assert.equal(r.dataFields,1); assert.equal(r.citationFields,1);
});
test('flags malformed payloads and unbalanced fields',()=>{
  assert.ok(extract(field('', 'ADDIN EN.CITE','not-base64!')).warnings.length);
  assert.ok(extract('<w:fldChar w:fldCharType="begin"/>').warnings.length);
});
test('rejects entity declarations',()=>{
  assert.throws(()=>Core.parseXML('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',env), /entities/);
});
test('flags contradictory metadata for a source ID',()=>{
  assert.match(extract(field(record('One'))+field(record('Two'))).warnings[0],/Conflicting/);
});
test('retains metadata variants without losing original XML',()=>{
  const r=extract(field(record())+field(record('Synthetic study',1,'test-library','<abstract>Details</abstract>')));
  assert.equal(r.records[0].variants.length,2); assert.match(r.records[0].xml,/<abstract>/); assert.deepEqual(r.warnings,[]);
});
test('conservative matching is scoped by caller and never merges on title alone',()=>{
  const records=[{marker:'a',DOI:'10.1234/one'},{marker:'b',DOI:'10.1234/multiple'},{marker:'c',DOI:''}];
  const plan=Core.plan(records,[{id:1,DOI:'https://doi.org/10.1234/ONE'},{id:2,DOI:'10.1234/multiple'},{id:3,DOI:'10.1234/multiple'}]);
  assert.equal(plan[0].action,'reuse');assert.equal(plan[1].action,'ambiguous');assert.equal(plan[1].selected,false);assert.equal(plan[2].action,'new');
});
test('repeat import uses retained source ID even without DOI',()=>{
  assert.equal(Core.plan([{marker:'a',DOI:''}],[{id:1,extra:'Traveling Library ID: a'}])[0].action,'reuse');
});
test('exports well-formed EndNote XML and escapes raw-note content',()=>{
  const r=extract(field(record())); const xml=Core.asEndNoteXML(r.records);
  assert.equal(Core.parseXML(xml,env).getElementsByTagName('record').length,1);
  assert.equal(Core.escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;');
});

test('extracts inline XML from field instructions without fldData',()=>{
  const inline=`<EndNote><Cite>${record('Inline reference',2)}</Cite></EndNote>`;
  const xml=field(record()).replace(/<w:fldData>[\s\S]*?<\/w:fldData>/,'').replace(' ADDIN EN.CITE ', ' ADDIN EN.CITE ' + Core.escapeHTML(inline));
  const r=extract(xml);assert.equal(r.records[0].title,'Inline reference');assert.deepEqual(r.warnings,[]);
});
test('supports strict OOXML namespace',()=>{
  const parts={'word/document.xml':doc(field(record())).replaceAll(ns,'http://purl.oclc.org/ooxml/wordprocessingml/main')};
  assert.equal(Core.extract(parts,env).records.length,1);
});
