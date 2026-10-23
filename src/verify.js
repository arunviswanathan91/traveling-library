window.addEventListener('DOMContentLoaded', () => {
  const args=window.arguments[0], $=id=>document.getElementById(id);
  const el=tag=>document.createElementNS('http://www.w3.org/1999/xhtml',tag);
  let busy=false, stopped=false, closed=false, active=null;
  const views=[]; $('pubmed').checked=args.preferPubMed;
  window.addEventListener('unload',()=>{closed=true;stopped=true;});
  const show=value=>typeof value==='object'?JSON.stringify(value,null,2):String(value || '');
  function review(view) {
    active=view; $('comparison').hidden=false;
    $('reason').textContent=view.result.reasons.join('; ') || 'Identity matches. Choose any existing values you want to replace.';
    $('differences').replaceChildren();
    view.checks=[];
    for(const change of view.result.changes) {
      const label=el('label'), check=el('input'), pre=el('pre');check.type='checkbox';check.checked=change.missing;
      label.append(check,document.createTextNode(' '+change.key));
      pre.textContent='Current: '+show(change.before)+'\nRetrieved: '+show(change.after);
      label.append(pre);$('differences').append(label);view.checks.push({check,change});
    }
  }
  async function verify(view) {
    view.status.textContent='Looking up DOI…';view.button.disabled=true;
    try {
      const result=await args.verify(view.item.id,()=>closed,$('pubmed').checked);
      if(closed)return;
      view.result=result;view.status.textContent=result.status;
      view.compare.disabled=!result.changes?.length;
    } catch(e){if(!closed)view.status.textContent='Error — '+e.message;}
    finally {if(!closed)view.button.disabled=false;}
  }
  async function run(list) {
    if(busy)return;busy=true;stopped=false;$('all').disabled=true;$('apply').disabled=true;
    for(let i=0;i<list.length&&!stopped&&!closed;i++) {
      $('progress').textContent=`${i+1} / ${list.length}`;
      await verify(list[i]);
      if(i+1<list.length&&!stopped&&!closed)await new Promise(r=>window.setTimeout(r,500));
    }
    busy=false;if(!closed){$('all').disabled=false;$('apply').disabled=false;$('progress').textContent=stopped?'Stopped':'Finished';}
  }
  for(const item of args.items) {
    const tr=el('tr'), title=el('td'),status=el('td'),actions=el('td'),button=el('button'),compare=el('button');
    title.textContent=item.title;const detail=el('small');detail.textContent=item.DOI||'No DOI';title.append(detail);
    status.textContent='Not checked';button.textContent='Verify DOI';compare.textContent='Review changes';compare.disabled=true;
    const view={item,status,button,compare};views.push(view);
    button.addEventListener('click',()=>run([view]));compare.addEventListener('click',()=>review(view));
    actions.append(button,compare);tr.append(title,status,actions);$('rows').append(tr);
  }
  $('all').addEventListener('click',()=>run(views.filter(v=>!v.result || !['verified','no-doi'].includes(v.result.code))));
  $('stop').addEventListener('click',()=>{stopped=true;});
  $('close').addEventListener('click',()=>window.close());$('dismiss').addEventListener('click',()=>{$('comparison').hidden=true;active=null;});
  $('apply').addEventListener('click',async()=>{
    if(!active||busy)return;const view=active;const chosen=view.checks.filter(x=>x.check.checked).map(x=>x.change);
    if(!chosen.length)return;
    $('apply').disabled=true;busy=true;
    try {await args.apply(view.item.id,chosen,view.result.snapshot);view.status.textContent='Selected changes applied';view.result=null;view.compare.disabled=true;$('comparison').hidden=true;active=null;}
    catch(e){$('reason').textContent=e.message;}
    finally{busy=false;$('apply').disabled=false;}
  });
  if(args.auto)window.setTimeout(()=>run(views),100);
});
