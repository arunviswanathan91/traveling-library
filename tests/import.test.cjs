const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const Core=require('../src/core');
function harness({editable=true,collection=true,accept=true,failSave=false,existing=[]}={}) {
  const alerts=[],saved=[];let transactionCount=0, rolledBack=false, translationCount=0;
  const source={identity:'synthetic',title:'Example',DOI:'10.1234/example',xml:'<record/>'};
  const ctx=vm.createContext({console,Set,Promise});
  class Item {
    constructor(type){this.itemType=type;this.id=100+saved.length;}
    fromJSON(data){this.data=data;}
    addToCollection(id){this.collectionID=id;}
    setNote(content){this.note=content;}
    async save(){if(failSave)throw new Error('Synthetic save failure');saved.push(this);}
  }
  const oldItems=existing.map(x=>({id:x.id,libraryID:1,deleted:false,isRegularItem:()=>true,getField:key=>x[key]||'',
    addToCollection(id){this.collectionID=id;},async save(){saved.push(this);}}));
  ctx.Zotero={version:'8.0',logError:()=>{},Libraries:{get:()=>({editable,name:'My Library'})},
    Items:{getAll:async()=>oldItems,getAsync:async id=>oldItems.find(x=>x.id===id)},
    Item,Utilities:{Internal:{md5:()=> 'source-marker'}},
    DB:{executeTransaction:async fn=>{transactionCount++;try{await fn();}catch(e){saved.length=0;rolledBack=true;throw e;}}},
    ProgressWindow:class {changeHeadline(){}show(){}close(){}}
  };
  ctx.Services={prompt:{alert:(w,t,m)=>alerts.push(m)}};
  vm.runInContext(fs.readFileSync('src/bootstrap.js','utf8'),ctx);
  ctx.scope={TLCore:{...Core,extract:()=>({records:[source],warnings:[],deletedFields:0})}};
  ctx.chooseFile=async()=>'/synthetic.docx';ctx.readDocx=()=>({});
  ctx.translateRecords=async()=>{translationCount++;return [{itemType:'journalArticle',title:'Example',DOI:'10.1234/example',creators:[{firstName:'A',lastName:'Example',creatorType:'author'}],tags:['test'],notes:[],attachments:[{path:'private.pdf'}]}];};
  const window={setTimeout:fn=>fn(),ZoteroPane:{getSelectedCollection:()=>collection?{id:7,libraryID:1,name:'Target'}:null,selectItems:async()=>{}},
    openDialog:(url,name,flags,args)=>{args.accepted=accept;args.preserveRaw=true;}};
  return {ctx,alerts,saved,run:()=>ctx.runImport(window),stats:()=>({transactionCount,rolledBack,translationCount})};
}

test('requires an explicit destination collection',async()=>{const h=harness({collection:false});await h.run();assert.match(h.alerts[0],/Select the destination/);assert.equal(h.stats().transactionCount,0);});
test('rejects read-only destinations before writes',async()=>{const h=harness({editable:false});await h.run();assert.match(h.alerts[0],/read-only/);assert.equal(h.stats().transactionCount,0);});
test('cancel leaves library untouched',async()=>{const h=harness({accept:false});await h.run();assert.equal(h.stats().transactionCount,0);assert.equal(h.stats().translationCount,0);});
test('new item imports transactionally, strips attachment paths, and preserves metadata',async()=>{
  const h=harness();await h.run();assert.equal(h.stats().transactionCount,1);assert.equal(h.saved.length,2);
  assert.equal(h.saved[0].collectionID,7);assert.equal(h.saved[0].data.attachments,undefined);
  assert.equal(h.saved[0].data.tags[0].tag,'test');assert.match(h.saved[0].data.extra,/Traveling Library ID: source-marker/);
  assert.match(h.saved[1].note,/&lt;record\/&gt;/);assert.match(h.alerts[0],/1 new references imported/);
});
test('existing DOI match is reused without metadata rewriting',async()=>{
  const h=harness({existing:[{id:8,DOI:'10.1234/example'}]});await h.run();assert.equal(h.saved.length,1);assert.equal(h.saved[0].id,8);assert.equal(h.saved[0].data,undefined);assert.equal(h.stats().translationCount,0);
});
test('ambiguous existing matches are not silently chosen',async()=>{
  const h=harness({existing:[{id:8,DOI:'10.1234/example'},{id:9,DOI:'10.1234/example'}]});await h.run();assert.equal(h.saved.length,0);assert.equal(h.stats().transactionCount,0);
});
test('save error uses transaction failure path and releases busy state',async()=>{
  const h=harness({failSave:true});await h.run();assert.equal(h.stats().rolledBack,true);assert.equal(h.saved.length,0);assert.match(h.alerts[0],/Synthetic save failure/);assert.equal(h.ctx.running,false);
});
