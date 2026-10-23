const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const V=require('../src/verification'),Core=require('../src/core');
const base={itemType:'journalArticle',title:'Example β-cell study',DOI:'10.1234/example',creators:[{creatorType:'author',lastName:'Example',firstName:'A'}]};
test('matching metadata offers only missing fields for automatic fill',()=>{const r=V.compare(base,{...base,abstractNote:'Abstract',volume:'3',PMID:'123'});assert.equal(r.matched,true);assert.deepEqual(r.changes.map(x=>x.key),['PMID','volume','abstractNote']);assert.ok(r.changes.every(x=>x.missing));});
test('resolving DOI alone does not verify a mismatching title',()=>{assert.equal(V.compare(base,{...base,title:'Unrelated paper'}).matched,false);});
test('author mismatch prevents automatic enrichment',()=>{assert.equal(V.compare(base,{...base,creators:[{creatorType:'author',lastName:'Other'}]}).matched,false);});
test('different DOI, missing DOI and type mismatch require review',()=>{for(const d of [{DOI:'10.1234/wrong'},{DOI:''},{itemType:'book'}])assert.equal(V.compare(base,{...base,...d}).matched,false);});
test('existing values are offered for review rather than automatic overwrite',()=>{const r=V.compare({...base,volume:'2'},{...base,volume:'3'});assert.equal(r.changes[0].missing,false);});
test('punctuation and case changes do not create a false identity conflict',()=>{assert.equal(V.compare(base,{...base,title:'EXAMPLE β CELL STUDY.'}).matched,true);});
function harness({count='1',ids=['123'],remote={...base,extra:'PMCID: PMC99'},httpError=false}={}) {
 const calls=[],ctx=vm.createContext({console,Set,Promise});
 ctx.scope={TLCore:Core,TLVerification:V};
 ctx.Zotero={HTTP:{request:async(method,url)=>{calls.push(url);if(httpError)throw Error('offline');return {response:{esearchresult:{count,idlist:ids}}};}}};
 vm.runInContext(fs.readFileSync('src/bootstrap.js','utf8'),ctx);ctx.scope={TLCore:Core,TLVerification:V};
 ctx.nativeLookup=async identifier=>{calls.push(identifier);return remote;};
 const win={setTimeout:fn=>setTimeout(fn,0),clearTimeout};
 return {ctx,calls,run:prefer=>ctx.lookupReference(base.DOI,prefer,win)};
}
test('DOI is searched exactly and PMID is passed to Zotero lookup',async()=>{const h=harness();const r=await h.run(true);assert.equal(r.source,'PubMed');assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1])),{PMID:'123'});assert.match(decodeURIComponent(h.calls[0]),/"10.1234\/example"\[AID\]/);assert.match(r.remote.extra,/PMID: 123/);});
test('zero PubMed matches falls back to DOI translator',async()=>{const h=harness({count:'0',ids:[]});const r=await h.run(true);assert.equal(r.source,'DOI registry');assert.equal(h.calls[1].DOI,base.DOI);});
test('ambiguous PubMed results never pick an arbitrary PMID',async()=>{const h=harness({count:'2',ids:['123','456']});await h.run(true);assert.equal(h.calls[1].PMID,undefined);assert.equal(h.calls[1].DOI,base.DOI);});
test('PubMed network errors retain DOI fallback',async()=>{const h=harness({httpError:true});const r=await h.run(true);assert.match(r.fallback,/unavailable/);assert.equal(h.calls[1].DOI,base.DOI);});
test('PubMed DOI mismatch triggers fallback',async()=>{const h=harness({remote:{...base,DOI:'10.1234/other'}});const r=await h.run(true);assert.equal(r.source,'DOI registry');assert.equal(h.calls.length,3);});
test('disabling PubMed makes only native DOI lookup',async()=>{const h=harness();await h.run(false);assert.equal(h.calls.length,1);assert.equal(h.calls[0].DOI,base.DOI);});
test('enrichment rejects edits made during a lookup',async()=>{
 const h=harness();const item={deleted:false,libraryID:1,toJSON:()=>({...base,title:'User changed title'})};
 h.ctx.Zotero.Items={getAsync:async()=>item};h.ctx.Zotero.Libraries={get:()=>({editable:true})};h.ctx.Zotero.DB={executeTransaction:fn=>fn()};
 await assert.rejects(h.ctx.applyEnrichment(1,[{key:'volume',after:'3'}],base),/changed since verification/);
});
test('PMID enrichment preserves original Extra and source marker',async()=>{
 const h=harness();let extra='Traveling Library ID: abc\nCustom: retained',saved=0;
 const item={deleted:false,libraryID:1,toJSON:()=>({...base,extra}),getField:()=>extra,setField:(key,val)=>{extra=val;},save:async()=>{saved++;}};
 h.ctx.Zotero.Items={getAsync:async()=>item};h.ctx.Zotero.Libraries={get:()=>({editable:true})};h.ctx.Zotero.DB={executeTransaction:fn=>fn()};
 await h.ctx.applyEnrichment(1,[{key:'PMID',after:'123'}],base);
 assert.match(extra,/Traveling Library ID: abc/);assert.match(extra,/Custom: retained/);assert.match(extra,/PMID: 123/);assert.equal(saved,1);
});
function dialogHarness(remote) {
 const h=harness();let data=JSON.parse(JSON.stringify(base)),writes=0,args;
 const item={id:1,deleted:false,libraryID:1,itemTypeID:1,isRegularItem:()=>true,toJSON:()=>JSON.parse(JSON.stringify(data)),getField:key=>data[key]||'',setField:(k,v)=>{data[k]=v;},setCreators:v=>{data.creators=v;},save:async()=>{writes++;}};
 h.ctx.Zotero.Items={get:()=>item,getAsync:async()=>item};h.ctx.Zotero.Libraries={get:()=>({editable:true})};h.ctx.Zotero.DB={executeTransaction:fn=>fn()};h.ctx.Zotero.ItemFields={getID:k=>k,isValidForType:()=>true};
 h.ctx.lookupReference=async()=>({remote,source:'PubMed'});
 h.ctx.openVerification({openDialog:(url,name,flags,a)=>{args=a;}},[1]);
 return {...h,verify:closed=>args.verify(1,()=>closed,true),data:()=>data,writes:()=>writes};
}
test('verification dialog fills missing metadata into the same item',async()=>{const h=dialogHarness({...base,abstractNote:'PubMed abstract',extra:'PMID: 123'});const r=await h.verify(false);assert.equal(r.code,'verified');assert.equal(h.data().abstractNote,'PubMed abstract');assert.match(h.data().extra,/PMID: 123/);assert.equal(r.changes.length,0);assert.equal(h.writes(),1);});
test('conflicting metadata never automatically overwrites or enriches item',async()=>{const h=dialogHarness({...base,title:'Other paper',abstractNote:'Wrong abstract'});const r=await h.verify(false);assert.equal(r.code,'conflict');assert.equal(h.writes(),0);assert.equal(h.data().abstractNote,undefined);assert.ok(r.changes.length);});
test('closing verification dialog discards late results',async()=>{const h=dialogHarness({...base,abstractNote:'Late result'});const r=await h.verify(true);assert.equal(r.code,'cancelled');assert.equal(h.writes(),0);});
