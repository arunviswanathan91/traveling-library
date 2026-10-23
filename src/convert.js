window.addEventListener('DOMContentLoaded',()=>{
  const args=window.arguments[0],$=id=>document.getElementById(id);
  $('file').textContent=args.name;
  $('summary').textContent=`Ready: ${args.result.citations} citation groups, ${args.result.itemOccurrences} cited items, ${args.result.bibliographies} bibliography fields. All references matched.`;
  for(const style of args.styles){const o=document.createElementNS('http://www.w3.org/1999/xhtml','option');o.value=style.id;o.textContent=style.title;$('style').append(o);}
  $('cancel').addEventListener('click',()=>window.close());
  $('save').addEventListener('click',()=>{args.styleID=$('style').value;args.accepted=true;window.close();});
});
