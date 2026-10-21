const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url,options={}){
  const response=await fetch(url,{method:options.method||'GET',credentials:'same-origin',headers:{'content-type':'application/json','x-somas-request':'1'},body:options.data?JSON.stringify(options.data):undefined});
  const payload=await response.json();if(!response.ok)throw new Error((payload.error||'request_failed')+(payload.requestId?` (reference: ${payload.requestId})`:''));return payload;
}
async function load(){
  const result=await api('/api/admin/root');
  document.getElementById('rootProposals').innerHTML=result.proposals.length
    ?result.proposals.map(p=>`<article class="entry"><b>${e(p.kind)} — ${e(p.status)}</b><p>${e(p.plan.instruction)}</p><small>Mission target: ${e(p.target)} · Not automatically executed</small></article>`).join('')
    :'<p>No Root evolution proposals yet.</p>';
}
document.getElementById('rootMissionForm').onsubmit=async event=>{
  event.preventDefault();
  const result=document.getElementById('rootResult');
  try {
    const response=await api('/api/admin/root/evolution',{method:'POST',data:{
      message:document.getElementById('rootMessage').value,
      changeKind:document.getElementById('rootChangeKind').value
    }});
    result.textContent=`Planned: ${response.proposal.target}\nTeam: ${response.proposal.team.agents.join(', ')}\nStatus: proposed; no live modifications`;
    await load();
  }catch(err){result.textContent=`Unable to prepare plan: ${err.message}`;}
};
load().catch(err=>document.getElementById('rootProposals').textContent=`Cannot load Root SOMAS: ${err.message}`);
