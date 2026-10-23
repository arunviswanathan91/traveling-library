/* Traveling Library — local document parsing, with no Zotero or network dependency. */
var TLCore = (() => {
  const WORD = new Set([
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'http://purl.oclc.org/ooxml/wordprocessingml/main'
  ]);
  const elements = node => Array.from(node.childNodes || []).filter(n => n.nodeType === 1);
  const text = (node, path) => {
    for (const name of path.split('/')) {
      node = elements(node).find(n => n.localName === name);
      if (!node) return '';
    }
    return node.textContent.trim();
  };
  function parseXML(xml, env) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML declarations with external entities are not supported.');
    const doc = new env.DOMParser().parseFromString(xml, 'application/xml');
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) {
      throw new Error('Malformed XML');
    }
    return doc;
  }
  function doi(value) {
    value = String(value || '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
    return /^10\.\d{4,9}\/\S+$/i.test(value) ? value.toLowerCase() : '';
  }
  function identifiers(node) {
    const urls = Array.from(node.getElementsByTagName('url')).map(n => n.textContent.trim());
    const ids = [...new Set(urls.map(url => url.match(/^https?:\/\/(?:www\.ncbi\.nlm\.nih\.gov\/pubmed|pubmed\.ncbi\.nlm\.nih\.gov)\/(\d+)(?:[/?#]|$)/i)?.[1]).filter(Boolean))];
    const accession = text(node, 'accession-num');
    // A numeric accession alone is not necessarily a PubMed identifier.
    const PMID = ids.length === 1 && (!/^\d+$/.test(accession) || accession === ids[0]) ? ids[0] : '';
    const pmcs = [...new Set((text(node,'custom2').match(/\bPMC\d+\b/gi) || []).map(x=>x.toUpperCase()))];
    return {PMID, PMCID:pmcs.length === 1 ? pmcs[0] : '', url:urls.find(u=>/^https?:\/\//i.test(u)) || ''};
  }
  function decodePayload(value, env) {
    if (value.trim().startsWith('<')) return value.trim();
    const binary = env.atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    let encoding = 'utf-8';
    if ((bytes[0] === 255 && bytes[1] === 254) || bytes[1] === 0) encoding = 'utf-16le';
    if ((bytes[0] === 254 && bytes[1] === 255) || bytes[0] === 0) encoding = 'utf-16be';
    return new env.TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/\0+$/, '').trim();
  }
  function extract(parts, env) {
    const records = new Map(), seenPayloads = new Set(), warnings = [];
    let citationFields = 0, dataFields = 0, deletedFields = 0;
    const serializer = new env.XMLSerializer();
    function readPayload(payload, location) {
      const normalized = payload.trim().startsWith('<') ? payload.trim() : payload.replace(/\s/g, '');
      if (seenPayloads.has(normalized)) return;
      seenPayloads.add(normalized);
      try {
        const decoded = decodePayload(payload, env);
        const root = parseXML(decoded, env);
        if (root.documentElement.localName !== 'EndNote') throw new Error('Unrecognized EndNote payload');
        const nodes = Array.from(root.getElementsByTagName('record'));
        if (!nodes.length) throw new Error('Citation has no embedded record');
        for (const node of nodes) {
          const title = text(node, 'titles/title');
          if (!title) throw new Error('Embedded reference has no title');
          const foreign = elements(node).find(n => n.localName === 'foreign-keys');
          const key = foreign && elements(foreign).find(n => n.localName === 'key' && n.getAttribute('app') === 'EN');
          const recNum = text(node, 'rec-number');
          const database = key?.getAttribute('db-id') || '';
          const DOI = doi(text(node, 'electronic-resource-num'));
          const xml = serializer.serializeToString(node);
          const identity = database && (key.textContent || recNum)
            ? `endnote:${encodeURIComponent(database)}:${encodeURIComponent(key.textContent.trim() || recNum)}`
            : `record:${xml}`;
          const record = { identity, title, DOI, ...identifiers(node), year: text(node, 'dates/year'),
            author: text(node, 'contributors/authors/author'), xml, locations: [location] };
          const prior = records.get(identity);
          if (!prior) records.set(identity, record);
          else {
            prior.locations.push(location);
            if (prior.xml !== xml) {
              // Different versions of one source record need review, not silent overwriting.
              prior.variants = prior.variants || [prior.xml];
              if (!prior.variants.includes(xml)) prior.variants.push(xml);
              if (prior.title !== title || (prior.DOI && DOI && prior.DOI !== DOI)) {
                throw new Error('Conflicting title or DOI for the same EndNote record ID');
              }
              if (xml.length > prior.xml.length) {
                Object.assign(prior, { xml, DOI: DOI || prior.DOI });
              }
            }
          }
        }
      } catch (e) { warnings.push(`${location}: ${e.message}`); }
    }
    for (const [name, xml] of Object.entries(parts)) {
      if (!/^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(name)) continue;
      const doc = parseXML(xml, env), stack = [];
      let fieldIndex = 0;
      function walk(node, deleted = false) {
        if (node.nodeType !== 1 && node.nodeType !== 9) return;
        deleted = deleted || (WORD.has(node.namespaceURI) && ['del', 'moveFrom'].includes(node.localName));
        if (WORD.has(node.namespaceURI) && node.localName === 'fldChar') {
          const type = node.getAttributeNS(node.namespaceURI, 'fldCharType');
          if (type === 'begin') {
            stack.push({ code: '', deleted, location: `${name} field ${++fieldIndex}`,
              data: elements(node).filter(n => WORD.has(n.namespaceURI) && n.localName === 'fldData').map(n => n.textContent) });
          } else if (type === 'end') {
            const f = stack.pop();
            if (f && /\bADDIN\s+EN\.CITE(?:\.DATA)?\b/i.test(f.code)) {
              if (f.deleted) deletedFields++;
              else {
                if (/EN\.CITE\.DATA/i.test(f.code)) dataFields++; else citationFields++;
                const inline = f.code.indexOf('<EndNote');
                if (inline >= 0) f.data.push(f.code.slice(inline));
                if (!f.data.length) warnings.push(`${f.location}: EndNote field has no embedded data`);
                for (const payload of f.data) readPayload(payload, f.location);
              }
            }
          }
        } else if (WORD.has(node.namespaceURI) && node.localName === 'instrText' && stack.length) {
          stack[stack.length - 1].code += node.textContent;
        } else if (WORD.has(node.namespaceURI) && node.localName === 'fldSimple') {
          const code = node.getAttributeNS(node.namespaceURI, 'instr') || '';
          if (/\bADDIN\s+EN\.CITE\b/i.test(code) && !deleted) {
            const i = code.indexOf('<EndNote');
            if (i >= 0) readPayload(code.slice(i), `${name} simple field`);
            else warnings.push(`${name}: simple EndNote field without embedded metadata`);
          }
        }
        for (const child of Array.from(node.childNodes || [])) walk(child, deleted);
      }
      walk(doc);
      if (stack.length) warnings.push(`${name}: unbalanced Word field boundaries`);
    }
    return { records: [...records.values()], warnings, citationFields, dataFields, deletedFields };
  }
  function asEndNoteXML(records) {
    return '<?xml version="1.0" encoding="UTF-8"?><xml><records>' + records.map(r => r.xml).join('') + '</records></xml>';
  }
  function plan(records, existing) {
    const byDOI = new Map(), bySource = new Map();
    function add(map, key, item) {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key).some(x => x.id === item.id)) map.get(key).push(item);
    }
    for (const item of existing) {
      add(byDOI, doi(item.DOI), item);
      for (const match of (item.extra || '').matchAll(/^Traveling Library ID: (.+)$/gm)) add(bySource, match[1], item);
    }
    const pending = new Map();
    return records.map((record, index) => {
      let matches = bySource.get(record.marker) || (record.DOI ? byDOI.get(record.DOI) : null) || [];
      const row = { record, index, action: 'new', selected: true };
      if (matches.length > 1) return { ...row, action: 'ambiguous', selected: false };
      if (matches.length === 1) return { ...row, action: 'reuse', itemID: matches[0].id };
      // Preserve distinct EndNote records even if a DOI was accidentally shared between them.
      const key = record.marker;
      if (pending.has(key)) return { ...row, action: 'duplicate', selected: false };
      pending.set(key, index);
      return row;
    });
  }
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return { decodePayload, identifiers, extract, doi, parseXML, asEndNoteXML, plan, escapeHTML };
})();
if (typeof module !== 'undefined') module.exports = TLCore;
