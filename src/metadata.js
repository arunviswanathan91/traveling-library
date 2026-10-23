/* EndNote metadata coverage, independent of translators and online services. */
var TLMetadata = (() => {
  const children=n=>Array.from(n.childNodes || []).filter(x=>x.nodeType===1);
  function value(node,path) {
    for(const part of path.split('/')){node=children(node).find(n=>n.localName===part);if(!node)return '';}
    return node.textContent.trim();
  }
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function read(record) {
    const fields={};
    const map={abstractNote:'abstract',shortTitle:'titles/short-title',journalAbbreviation:'periodical/abbr-1',language:'language',libraryCatalog:'remote-database-name',callNumber:'call-num'};
    for(const [key,path] of Object.entries(map)){const v=value(record,path);if(v)fields[key]=v;}
    // Choose a bibliographic webpage, never a local attachment or PDF as item URL.
    const urls=children(record).find(n=>n.localName==='urls');
    if(urls)for(const category of ['web-urls','related-urls','text-urls']) {
      const group=children(urls).find(n=>n.localName===category);
      const url=group&&children(group).map(n=>n.textContent.trim()).find(u=>/^https?:\/\//i.test(u)&&! /\.pdf(?:[?#]|$)/i.test(u));
      if(url){fields.url=url;break;}
    }
    const type=value(record,'ref-type');
    const name=children(record).find(n=>n.localName==='ref-type')?.getAttribute('name');
    if(['17','19','23','43'].includes(type)||['Journal Article','Magazine Article','Newspaper Article','Electronic Article'].includes(name)) {
      const issns=[...new Set((value(record,'isbn').match(/\b\d{4}-\d{3}[\dX]\b/gi)||[]).map(x=>x.toUpperCase()))];
      if(issns.length)fields.ISSN=issns.join(', ');
    }
    const entries=[];
    function walk(node,path) {
      const kids=children(node);
      if(!kids.length || kids.every(n=>n.localName==='style')) {
        const v=node.textContent.trim();if(v)entries.push({path,value:v});
      } else for(const child of kids)walk(child,path+'/'+child.localName);
    }
    for(const node of children(record))walk(node,node.localName);
    return {fields,entries};
  }
  function note(records) {
    const seen=new Set(),entries=[];
    for(const record of records)for(const entry of read(record).entries){const key=JSON.stringify(entry);if(!seen.has(key)){seen.add(key);entries.push(entry);}}
    if(!entries.length)return '';
    return '<h2>EndNote source metadata — readable copy</h2><p>Original source labels and values. Custom fields, affiliations, keywords and date-like edition values have not been reinterpreted. File paths are recorded as text; files are not imported.</p>' + entries.map(e=>'<p><strong>'+escape(e.path)+'</strong></p><pre>'+escape(e.value)+'</pre>').join('');
  }
  function supplement(raw,record) {
    const out={...raw};
    for(const [key,val] of Object.entries(read(record).fields)) {
      if(!out[key] || key==='ISSN')out[key]=val;
    }
    return out;
  }
  return {read,note,supplement};
})();
if(typeof module!=='undefined')module.exports=TLMetadata;
