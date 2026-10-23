const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Core=require('../src/core'),Conversion=require('../src/conversion');
function harness(broken=false) {
 const calls=[],ctx=vm.createContext({Zotero:{},Cc:{},Ci:{},Services:{}});
 ctx.Services.scriptloader={
  loadSubScript(){throw new Error('Cache-prone loader must not be used');},
  loadSubScriptWithOptions(url,options){
   calls.push({url,ignoreCache:options.ignoreCache});
   if(!options.ignoreCache){options.target.TLCore={};return;}
   const target=options.target;
   if(!vm.isContext(target))vm.createContext(target);
   vm.runInContext(fs.readFileSync('src/'+url.split('/').pop(),'utf8'),target);
   if(broken&&url.endsWith('core.js'))delete target.TLCore.decodePayload;
  }
 };
 vm.runInContext(fs.readFileSync('src/bootstrap.js','utf8'),ctx);
 return {ctx,calls};
}
test('startup bypasses stale caches and loads complete modules in a fresh scope',()=>{
 const h=harness();const first=h.ctx.loadPluginScripts('file:///plugin/');
 assert.equal(typeof first.TLCore.decodePayload,'function');assert.equal(typeof first.TLConversion.convert,'function');
 assert.equal(h.calls.length,4);assert.ok(h.calls.every(c=>c.ignoreCache===true));
 const second=h.ctx.loadPluginScripts('file:///plugin/');assert.notEqual(first,second);assert.notEqual(first.TLCore,second.TLCore);
});
test('incomplete parser stops startup with a single restart instruction',()=>{
 const h=harness(true);assert.throws(()=>h.ctx.loadPluginScripts('file:///plugin/'),/Fully quit and reopen Zotero/);
});
test('conversion checks parser API before scanning document fields',()=>{
 const stale={...Core};delete stale.decodePayload;
 assert.throws(()=>Conversion.convert({'word/document.xml':'not parsed'},[],{},stale,()=>'',()=>''),/parser files are out of date.*No document was saved/);
});
