/* DOCX field conversion. No I/O; all preflight checks finish before a copy is saved. */
var TLConversion = (() => {
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids=n=>Array.from(n?.childNodes || []).filter(c=>c.nodeType===1);
  const child=(n,name)=>kids(n).find(c=>c.localName===name);
  const text=(n,name)=>child(n,name)?.textContent || '';
  const norm=s=>String(s||'').replace(/<[^>]*>/g,'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  function identity(record,env) {
    const key=kids(child(record,'foreign-keys')).find(n=>n.localName==='key'&&n.getAttribute('app')==='EN');
    const db=key?.getAttribute('db-id'),num=key?.textContent.trim()||text(record,'rec-number').trim();
    return db&&num?`endnote:${encodeURIComponent(db)}:${encodeURIComponent(num)}`:`record:${new env.XMLSerializer().serializeToString(record)}`;
  }
  function match(record,items,env,core,hash) {
    const marker=hash(identity(record,env));
    let matches=items.filter(i=>(i.extra||'').split(/\r?\n/).includes('Traveling Library ID: '+marker));
    if(!matches.length){const doi=core.doi(text(record,'electronic-resource-num'));matches=doi?items.filter(i=>core.doi(i.DOI)===doi&&norm(i.title)===norm(text(child(record,'titles'),'title'))):[];}
    if(matches.length!==1)throw new Error(matches.length?'Ambiguous Zotero match: '+text(child(record,'titles'),'title'):'Import this reference first: '+text(child(record,'titles'),'title'));
    const item=matches[0];
    if(!item.uri||!item.itemData)throw new Error('Zotero item link or CSL metadata unavailable');
    return {id:item.id,uris:[item.uri],itemData:item.itemData};
  }
  function citeItems(payload,items,env,core,hash) {
    const root=core.parseXML(core.decodePayload(payload,env),env).documentElement;
    if(root.localName!=='EndNote'||root.attributes.length)throw new Error('Unsupported EndNote citation payload');
    if(kids(root).some(n=>n.localName!=='Cite'))throw new Error('Unsupported EndNote group settings');
    return kids(root).map(c=>{
      for(const attr of Array.from(c.attributes))if(attr.name!=='ExcludeAuth'||!['0','1'].includes(attr.value))throw new Error('Unsupported citation attribute: '+attr.name);
      const record=child(c,'record');if(!record)throw new Error('Citation lacks its embedded reference');
      const out=match(record,items,env,core,hash);
      if(c.getAttribute('ExcludeAuth')==='1')out['suppress-author']=true;
      const seen=new Set();
      for(const n of kids(c)) {
        if(seen.has(n.localName))throw new Error('Repeated citation setting: '+n.localName);seen.add(n.localName);
        switch(n.localName) {
          case 'record':case 'Author':case 'Year':case 'RecNum':case 'DisplayText':break;
          case 'Prefix':out.prefix=n.textContent;break;
          case 'Suffix':out.suffix=n.textContent;break;
          case 'Pages':if(n.textContent.trim()){out.locator=n.textContent.trim();out.label='page';}break;
          // Unverified encodings and modes (e.g. exclude-year/narrative) must not
          // be guessed. Report them before writing a document.
          default:throw new Error('Unsupported citation setting: '+n.localName);
        }
      }
      return out;
    });
  }
  function scan(doc,name) {
    const stack=[],fields=[];let ordinal=0;
    function walk(n,revision=false,unsupported=false) {
      revision=revision||(n.namespaceURI===W&&['ins','del','moveFrom','moveTo'].includes(n.localName));
      unsupported=unsupported||(n.namespaceURI===W&&['txbxContent','sdt'].includes(n.localName));
      if(n.namespaceURI===W) {
        if(n.localName==='fldSimple')throw new Error(name+': simple Word fields are not supported; resave using Word complex fields');
        if(n.localName==='fldChar') {
          const type=n.getAttributeNS(W,'fldCharType');
          if(type==='begin') {
            const f={begin:n,instructions:[],data:kids(n).filter(x=>x.localName==='fldData').map(x=>x.textContent),code:'',children:[],revision,unsupported,visible:'',location:name+' field '+(++ordinal)};
            if(stack.length)stack[stack.length-1].children.push(f);stack.push(f);fields.push(f);
          } else if(type==='separate') {if(!stack.length)throw new Error(name+': unbalanced field');stack[stack.length-1].separator=n;}
          else if(type==='end'){if(!stack.length)throw new Error(name+': unbalanced field');stack.pop().end=n;}
        } else if(n.localName==='instrText'&&stack.length){const f=stack[stack.length-1];f.code+=n.textContent;f.instructions.push(n);}
        if(stack.length)for(const f of stack){f.revision ||= revision;f.unsupported ||= unsupported;if(n.localName==='t'&&f.separator)f.visible+=n.textContent;}
      }
      for(const c of kids(n))walk(c,revision,unsupported);
    }
    walk(doc);if(stack.length)throw new Error(name+': unclosed Word field');return fields;
  }
  function writeCode(field,code) {
    if(!field.instructions.length||!field.separator||!field.end)throw new Error(field.location+': incomplete field boundaries');
    field.instructions[0].textContent=' '+code+' ';
    field.instructions[0].setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');
    for(const n of field.instructions.slice(1))n.parentNode.removeChild(n);
    for(const n of kids(field.begin).filter(n=>n.localName==='fldData'))field.begin.removeChild(n);
    field.begin.removeAttributeNS(W,'fldLock');field.begin.removeAttributeNS(W,'dirty');
  }
  function convert(parts,items,env,core,hash,random) {
    const changes={},errors=[],plans=[];let citations=0,bibliographies=0,itemOccurrences=0;
    for(const [name,xml] of Object.entries(parts)) {
      if(!/^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(name)){if(/^word\//.test(name)&&/ADDIN\s+EN\./i.test(xml))errors.push(name+': EndNote fields in this document part are unsupported');continue;}
      const doc=core.parseXML(xml,env);
      if(doc.documentElement.namespaceURI!==W)throw new Error('Strict OOXML documents must first be saved by Word as a standard DOCX.');
      const fields=scan(doc,name);let changed=false;
      for(const f of fields) {
        if(/\bZOTERO_(ITEM|BIBL)\b/i.test(f.code))errors.push(name+': document already contains Zotero fields; mixed conversion is not supported');
        if(!/\bADDIN\s+EN\./i.test(f.code))continue;
        if(f.revision||f.unsupported){errors.push(f.location+': citation is in tracked changes, a text box or a content control');continue;}
        if(/^\s*ADDIN\s+EN\.CITE\.DATA\b/i.test(f.code)) {
          if(!fields.some(p=>p.children.includes(f)&&/^\s*ADDIN\s+EN\.CITE\s*$/i.test(p.code.split('<')[0])))errors.push(f.location+': orphan EndNote data field');
          continue;
        }
        try {
          let code;
          if(/^\s*ADDIN\s+EN\.REFLIST\s*$/i.test(f.code)) {
            if(f.children.length)throw new Error('Nested bibliography fields need manual review');
            code='ADDIN ZOTERO_BIBL '+JSON.stringify({uncited:[],omitted:[],custom:[]})+' CSL_BIBLIOGRAPHY';bibliographies++;
          } else if(/^\s*ADDIN\s+EN\.CITE\s*(?:<|$)/i.test(f.code)) {
            if(/header|footer/.test(name))throw new Error('Citations in headers or footers need manual conversion');
            if(f.children.some(c=>!/^\s*ADDIN\s+EN\.CITE\.DATA\s*$/i.test(c.code)||c.children.length))throw new Error('Unsupported nested citation field');
            const payloads=[...f.data,...f.children.flatMap(c=>c.data)];
            if(f.code.includes('<EndNote'))payloads.push(f.code.slice(f.code.indexOf('<EndNote')));
            if(!payloads.length)throw new Error('No traveling-library data in citation');
            const variants=payloads.map(p=>citeItems(p,items,env,core,hash));
            if(variants.some(v=>JSON.stringify(v)!==JSON.stringify(variants[0])))throw new Error('Conflicting citation payloads');
            const citationItems=variants[0];if(!citationItems.length)throw new Error('Empty citation group');
            code='ADDIN ZOTERO_ITEM CSL_CITATION '+JSON.stringify({citationID:random(),citationItems,properties:{unsorted:true,plainCitation:f.visible,noteIndex:0},schema:'https://github.com/citation-style-language/schema/raw/master/csl-citation.json'});
            citations++;itemOccurrences+=citationItems.length;
          } else throw new Error('Unsupported EndNote field type');
          if(!f.instructions.length||!f.separator||!f.end)throw new Error('Incomplete field boundaries');
          plans.push(()=>{
            writeCode(f,code);
            for(const c of f.children)for(const n of [...c.instructions,c.begin,c.separator,c.end].filter(Boolean))n.parentNode?.removeChild(n);
          });changed=true;
        } catch(e){errors.push(f.location+': '+e.message);}
      }
      if(changed)changes[name]=doc;
    }
    if(bibliographies>1)errors.push('Multiple EndNote bibliographies require manual review');
    if(!citations)errors.push('No convertible EndNote citations found');
    if(errors.length)throw new Error('Conversion stopped. No document was saved.\n\n'+errors.slice(0,20).join('\n')+(errors.length>20?'\n… '+(errors.length-20)+' more issues':''));
    for(const apply of plans)apply();
    const serialized={};for(const [name,doc] of Object.entries(changes))serialized[name]=new env.XMLSerializer().serializeToString(doc);
    return {changes:serialized,citations,bibliographies,itemOccurrences};
  }
  function documentSettings(parts,env,core,data) {
    const CP='http://schemas.openxmlformats.org/officeDocument/2006/custom-properties',VT='http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
    const REL='http://schemas.openxmlformats.org/package/2006/relationships',CT='http://schemas.openxmlformats.org/package/2006/content-types';
    const type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
    const props=core.parseXML(parts['docProps/custom.xml']||'<Properties xmlns="'+CP+'" xmlns:vt="'+VT+'"/>',env);
    if(kids(props.documentElement).some(n=>/^ZOTERO_PREF_/.test(n.getAttribute('name'))))throw new Error('Document already has Zotero preferences; mixed conversion is not supported.');
    const p=props.createElementNS(CP,'property');p.setAttribute('fmtid','{D5CDD505-2E9C-101B-9397-08002B2CF9AE}');
    p.setAttribute('pid',String(Math.max(1,...kids(props.documentElement).map(n=>Number(n.getAttribute('pid'))||0))+1));p.setAttribute('name','ZOTERO_PREF_1');
    const v=props.createElementNS(VT,'vt:lpwstr');v.textContent=data;p.appendChild(v);props.documentElement.appendChild(p);
    const rels=core.parseXML(parts['_rels/.rels'],env),types=core.parseXML(parts['[Content_Types].xml'],env);
    const existing=kids(rels.documentElement).find(n=>n.getAttribute('Type')===type);
    if(existing && !['docProps/custom.xml','/docProps/custom.xml'].includes(existing.getAttribute('Target')))throw new Error('Nonstandard custom-properties location');
    if(!existing){const r=rels.createElementNS(REL,'Relationship');let id=1;const ids=new Set(kids(rels.documentElement).map(n=>n.getAttribute('Id')));while(ids.has('rId'+id))id++;r.setAttribute('Id','rId'+id);r.setAttribute('Type',type);r.setAttribute('Target','docProps/custom.xml');rels.documentElement.appendChild(r);}
    if(!kids(types.documentElement).some(n=>n.getAttribute('PartName')==='/docProps/custom.xml')){const o=types.createElementNS(CT,'Override');o.setAttribute('PartName','/docProps/custom.xml');o.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.custom-properties+xml');types.documentElement.appendChild(o);}
    const serialize=doc=>new env.XMLSerializer().serializeToString(doc);
    return {'docProps/custom.xml':serialize(props),'_rels/.rels':serialize(rels),'[Content_Types].xml':serialize(types)};
  }
  return {convert,identity,match,citeItems,documentSettings};
})();
if(typeof module!=='undefined')module.exports=TLConversion;
