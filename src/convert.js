window.addEventListener('DOMContentLoaded',()=>{
  const args=window.arguments[0],$=id=>document.getElementById(id);
  const styles=args.styles.slice().sort((a,b)=>a.title.localeCompare(b.title));
  let selected=styles[0]?.id || '';
  $('file').textContent=args.name;
  $('summary').textContent=`Ready: ${args.result.citations} citation groups, ${args.result.itemOccurrences} cited items, ${args.result.bibliographies} bibliography fields. All references matched.`;
  const rows=[];
  function updateSelection(){
    const style=styles.find(s=>s.id===selected);
    $('selected-style').textContent=style?'Selected: '+style.title:'Select a style to continue.';
    $('save').disabled=!style;
    for(const row of rows){row.input.checked=row.style.id===selected;row.label.classList.toggle('selected',row.input.checked);}
  }
  for(const style of styles){
    const label=document.createElementNS('http://www.w3.org/1999/xhtml','label');label.className='style-row';
    const input=document.createElementNS('http://www.w3.org/1999/xhtml','input');input.type='radio';input.name='citation-style';input.value=style.id;
    const title=document.createElementNS('http://www.w3.org/1999/xhtml','span');title.textContent=style.title;
    input.addEventListener('change',()=>{if(input.checked){selected=style.id;updateSelection();}});
    label.append(input,title);$('styles').append(label);rows.push({style,input,label});
  }
  $('style-filter').addEventListener('input',()=>{
    const query=$('style-filter').value.trim().toLocaleLowerCase();let visible=0;
    for(const row of rows){row.label.hidden=!row.style.title.toLocaleLowerCase().includes(query);if(!row.label.hidden)visible++;}
    $('no-styles').hidden=visible>0;
  });
  updateSelection();
  $('cancel').addEventListener('click',()=>window.close());
  $('save').addEventListener('click',()=>{if(!styles.some(s=>s.id===selected))return;args.styleID=selected;args.accepted=true;window.close();});
});
