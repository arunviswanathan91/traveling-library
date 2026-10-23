window.addEventListener('DOMContentLoaded',()=>{
 const args=window.arguments[0],$=id=>document.getElementById(id);
 $('file').textContent=args.name;
 $('summary').textContent=`Ready: ${args.result.citations} citation groups, ${args.result.uniqueReferences} references, ${args.result.bibliographies} bibliography fields.`;
 $('cancel').addEventListener('click',()=>window.close());
 $('save').addEventListener('click',()=>{args.accepted=true;window.close();});
});
