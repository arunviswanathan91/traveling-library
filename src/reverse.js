/* Experimental Zotero CSL fields -> EndNote inline traveling-library fields. */
var TLReverse = (()=>{
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const types={article:['Generic',13],software:['Computer Program',9],'article-journal':['Journal Article',17],book:['Book',6],chapter:['Book Section',5],report:['Report',27],thesis:['Thesis',32],webpage:['Web Page',12],'paper-conference':['Conference Proceedings',10],manuscript:['Manuscript',36],'article-magazine':['Magazine Article',19],'article-newspaper':['Newspaper Article',23]};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const plain=s=>String(s||'').replace(/<[^>]*>/g,'');
  const tag=(k,v)=>v===undefined||v===null||v===''?'':`<${k}>${escape(v)}</${k}>`;
  const name=a=>a.literal? a.literal+',': [a.family,[a.given,a.suffix].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  function record(data,num,db) {
    if(!data||typeof data!=='object'||!data.title)throw new Error('Citation has no embedded title; refresh this document with Zotero first');
    const type=types[data.type];if(!type)throw new Error('Unsupported reference type: '+data.type);
    let xml=tag('rec-number',num)+`<foreign-keys><key app="EN" db-id="${escape(db)}">${num}</key></foreign-keys><ref-type name="${type[0]}">${type[1]}</ref-type>`;
    const authors=(role,key)=>Array.isArray(data[key])&&data[key].length?`<${role}>${data[key].map(a=>tag('author',name(a))).join('')}</${role}>`:'';
    // Book editors use tertiary-authors in EndNote; chapter/article editors use secondary-authors.
    xml+='<contributors>'+authors('authors','author')+authors(data.type==='book'?'tertiary-authors':'secondary-authors','editor')+authors('subsidiary-authors','translator')+'</contributors>';
    xml+='<titles>'+tag('title',plain(data.title))+tag('secondary-title',plain(data['container-title']))+tag('short-title',plain(data['title-short']))+'</titles>';
    if(data.type.startsWith('article-'))xml+='<periodical>'+tag('full-title',plain(data['container-title']))+tag('abbr-1',plain(data['container-title-short']))+'</periodical>';
    const fields={page:'pages',volume:'volume',issue:'number',edition:'edition',version:'edition',publisher:'publisher','publisher-place':'pub-location',DOI:'electronic-resource-num',abstract:'abstract',language:'language',ISBN:'isbn'};
    for(const [key,target] of Object.entries(fields))xml+=tag(target,plain(data[key]));
    if(data.type.startsWith('article-')&&data.ISSN)xml+=tag('isbn',Array.isArray(data.ISSN)?data.ISSN.join(' '):data.ISSN);
    const date=data.issued?.['date-parts']?.[0];
    if(date?.length)xml+='<dates>'+tag('year',date[0])+'<pub-dates>'+tag('date',date.map((v,i)=>i?String(v).padStart(2,'0'):v).join('-'))+'</pub-dates></dates>';
    else if(data.issued?.literal)xml+='<dates><pub-dates>'+tag('date',data.issued.literal)+'</pub-dates></dates>';
    if(data.URL)xml+='<urls><web-urls>'+tag('url',data.URL)+'</web-urls></urls>';
    if(/^\d+$/.test(data.PMID||''))xml+=tag('accession-num',data.PMID);
    if(/^PMC\d+$/i.test(data.PMCID||''))xml+=tag('custom2',data.PMCID.toUpperCase());
    // Retain the exact embedded metadata for fields without a direct mapping.
    // EndNote may not retain research-notes during Export Traveling Library.
    xml+=tag('research-notes','Original Zotero CSL metadata: '+JSON.stringify(data));
    return '<record>'+xml+'</record>';
  }
  function convert(parts,env,core,conversion,random) {
    if(typeof conversion.scan!=='function'||typeof conversion.writeCode!=='function')throw new Error('Plugin modules are outdated. Restart Zotero.');
    const docs={},plans=[],errors=[],records=new Map();let citations=0,bibliographies=0,occurrences=0;
    const db='tl'+random();
    for(const [part,xml] of Object.entries(parts)) {
      if(!/^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(part)){
        if(/^word\//.test(part)&&/ZOTERO_(ITEM|BIBL)/.test(xml))errors.push(part+': unsupported citation location');continue;
      }
      const doc=core.parseXML(xml,env);if(doc.documentElement.namespaceURI!==W)throw new Error('Save as standard DOCX in Word first; strict OOXML is unsupported');
      const fields=conversion.scan(doc,part);let changed=false;
      for(const f of fields){
        if(/\bADDIN\s+EN\./i.test(f.code))errors.push(f.location+': mixed EndNote/Zotero documents are unsupported');
        if(!/\bZOTERO_(ITEM|BIBL)\b/.test(f.code))continue;
        try {
          if(f.revision||f.unsupported||f.children.length||/header|footer/.test(part))throw new Error('Unsupported citation location, tracked changes or nested fields');
          if(!f.instructions.length||!f.separator||!f.end)throw new Error('Incomplete field boundaries');
          let code;
          if(/^\s*ADDIN\s+ZOTERO_ITEM\s+CSL_CITATION\s+/.test(f.code)) {
            const raw=f.code.replace(/^\s*ADDIN\s+ZOTERO_ITEM\s+CSL_CITATION\s+/,'');const c=JSON.parse(raw);
            if(!Array.isArray(c.citationItems)||!c.citationItems.length)throw new Error('Empty citation');
            const props=c.properties||{};
            for(const [key,value] of Object.entries(props))if(!['unsorted','formattedCitation','plainCitation','noteIndex','field'].includes(key)&&value!==false&&value!=null&&value!=='')throw new Error('Unsupported citation property: '+key);
            if(props.plainCitation && props.plainCitation!==f.visible)throw new Error('Citation text was manually edited; refresh or resolve it in Zotero first');
            const cites=c.citationItems.map(ci=>{
              const allowed=['id','uris','uri','itemData','locator','label','prefix','suffix','suppress-author'];
              for(const key of Object.keys(ci))if(!allowed.includes(key)&&ci[key]!==false&&ci[key]!=null)throw new Error('Unsupported citation option: '+key);
              if(ci.locator&&ci.label&&ci.label!=='page')throw new Error('Only page locators are supported, found: '+ci.label);
              if(ci['suppress-author']!==undefined&&typeof ci['suppress-author']!=='boolean')throw new Error('Invalid author suppression setting');
              const key=ci.uris?.[0]||(Array.isArray(ci.uri)?ci.uri[0]:ci.uri)||ci.itemData?.id||ci.id;
              if(key===undefined||key===null||key==='')throw new Error('Missing citation item identity');
              const data=ci.itemData;
              const signature=JSON.stringify(data);
              let r=records.get(String(key));
              if(r&&r.signature!==signature)throw new Error('Conflicting embedded metadata for one Zotero item; refresh the document first');
              if(!r){const num=records.size+1;r={num,signature,xml:record(data,num,db)};records.set(String(key),r);}
              const author=data.author?.[0];const year=data.issued?.['date-parts']?.[0]?.[0]||'';
              occurrences++;
              return '<Cite'+(ci['suppress-author']?' ExcludeAuth="1"':'')+'>'+tag('Author',author?.family||author?.literal||'')+tag('Year',year)+tag('RecNum',r.num)+tag('Prefix',ci.prefix)+tag('Suffix',ci.suffix)+tag('Pages',ci.locator)+r.xml+'</Cite>';
            });
            code='ADDIN EN.CITE <EndNote>'+cites.join('')+'</EndNote>';citations++;
          } else if(/^\s*ADDIN\s+ZOTERO_BIBL\b/.test(f.code)) {
            const body=f.code.replace(/^\s*ADDIN\s+ZOTERO_BIBL\s*/,'').replace(/\s*CSL_BIBLIOGRAPHY\s*$/,'');const b=JSON.parse(body);
            for(const [k,v] of Object.entries(b))if(!['uncited','omitted','custom'].includes(k)||(Array.isArray(v)?v.length:Object.keys(v||{}).length))throw new Error('Customized bibliography (uncited, omitted or edited entries) requires manual review');
            code='ADDIN EN.REFLIST';bibliographies++;
          } else throw new Error('Unsupported Zotero field encoding');
          plans.push(()=>conversion.writeCode(f,code));changed=true;
        }catch(e){errors.push(f.location+': '+e.message);}
      }
      if(changed)docs[part]=doc;
    }
    if(!citations)errors.push('No convertible Zotero citation fields found');
    if(bibliographies>1)errors.push('Multiple bibliographies require manual review');
    if(errors.length)throw new Error('Conversion stopped. No document was saved.\n\n'+errors.slice(0,20).join('\n')+(errors.length>20?'\nMore issues: '+(errors.length-20):''));
    for(const apply of plans)apply();
    // Strip Zotero session/style metadata; preserve unrelated custom properties.
    if(parts['docProps/custom.xml']){
      const doc=core.parseXML(parts['docProps/custom.xml'],env);
      for(const n of Array.from(doc.documentElement.childNodes))if(n.nodeType===1&&/^ZOTERO_PREF_/.test(n.getAttribute('name')))doc.documentElement.removeChild(n);
      docs['docProps/custom.xml']=doc;
    }
    const changes={};for(const [p,d] of Object.entries(docs))changes[p]=new env.XMLSerializer().serializeToString(d);
    return {changes,citations,bibliographies,itemOccurrences:occurrences,uniqueReferences:records.size};
  }
  return {convert,record};
})();
if(typeof module!=='undefined')module.exports=TLReverse;
