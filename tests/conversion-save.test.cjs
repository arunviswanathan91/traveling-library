const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness({existing=false,fail=false,cancel=false}={}) {
 const files=new Map([['/source.docx',{original:'retained'}]]),calls=[];if(existing)files.set('/output.docx',{user:'existing'});
 const ctx=vm.createContext({console,Set,Promise});
 class Picker {constructor(){this.modeSave=1;this.returnCancel=0;this.file='/output.docx';}init(){}appendFilter(){}async show(){return cancel?0:1;}}
 ctx.ChromeUtils={importESModule:()=>({FilePicker:Picker})};ctx.Zotero={version:'10.0.6',randomString:()=> 'test',File:{pathToFile:x=>x,putContentsAsync:async(p,x)=>files.set(p,x)}};
 ctx.IOUtils={exists:async p=>files.has(p),copy:async(a,b,o)=>{assert.equal(o.noOverwrite,true);files.set(b,{...files.get(a)});},move:async(a,b,o)=>{assert.equal(o.noOverwrite,true);if(files.has(b))throw Error('exists');files.set(b,files.get(a));files.delete(a);calls.push('moved');},remove:async p=>{files.delete(p);}};
 let zipPath;
 ctx.Ci={nsIZipWriter:{COMPRESSION_DEFAULT:6}};
 ctx.Cc={'@mozilla.org/zipwriter;1':{createInstance:()=>({open:p=>{zipPath=p;},hasEntry:n=>Object.hasOwn(files.get(zipPath),n),removeEntry:n=>delete files.get(zipPath)[n],addEntryFile:(n,c,p)=>{if(fail)throw Error('write failed');files.get(zipPath)[n]=files.get(p);},close:()=>{}})}};
 vm.runInContext(fs.readFileSync('src/bootstrap.js','utf8'),ctx);ctx.readDocx=p=>files.get(p);
 return {files,calls,run:()=>ctx.saveConvertedCopy({},'/source.docx',{'word/document.xml':'new xml'})};
}
test('converted copy is validated and moved to a new path; source remains untouched',async()=>{const h=harness();assert.equal(await h.run(),'/output.docx');assert.deepEqual(h.files.get('/source.docx'),{original:'retained'});assert.equal(h.files.get('/output.docx')['word/document.xml'],'new xml');assert.equal(h.files.size,2);assert.deepEqual(h.calls,['moved']);});
test('existing destination is never overwritten',async()=>{const h=harness({existing:true});await assert.rejects(h.run(),/never overwritten/);assert.deepEqual(h.files.get('/output.docx'),{user:'existing'});assert.equal(h.calls.length,0);});
test('ZIP failure cleans temporary files without touching source',async()=>{const h=harness({fail:true});await assert.rejects(h.run(),/write failed/);assert.equal(h.files.size,1);assert.ok(h.files.has('/source.docx'));});
test('cancelling save creates no output',async()=>{const h=harness({cancel:true});assert.equal(await h.run(),null);assert.equal(h.files.size,1);});
