const el=id=>document.getElementById(id);
const id=el('somas-manager').dataset.project;
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,{method='GET',data}={}){
  const r=await fetch(path,{method,credentials:'same-origin',headers:{'x-somas-request':'1','content-type':'application/json'},body:data?JSON.stringify(data):undefined});
  const v=await r.json();if(!r.ok)throw new Error((v.error||'request_failed')+(v.requestId?` (reference: ${v.requestId})`:''));return v;
}
async function refresh(){
  const p=await api(`/api/projects/${id}/proposals`);el('embeddedProposals').innerHTML=p.proposals.length?p.proposals.map(x=>`<article class="entry"><span class="pill">${e(x.status)}</span><h3>${e(x.prompt)}</h3><p>${e(x.reason)}</p>${x.status==='pending'&&x.proposed_spec?`<button class="primary small" data-approve="${e(x.id)}">Approve & publish</button>`:''}</article>`).join(''):'<p class="muted">No proposals yet.</p>';
  document.querySelectorAll('[data-approve]').forEach(button=>button.onclick=async()=>{
    if(!confirm('Publish this change to your live website?'))return;
    try{await api(`/api/projects/${id}/proposals/${button.dataset.approve}/approve`,{method:'POST',data:{}});await refresh();alert('Your website has been updated.');}
    catch(err){alert(err.message);}
  });
  const f=await api(`/api/projects/${id}/findings`);
  el('embeddedFindings').innerHTML=f.findings.length?f.findings.map(x=>`<article class="entry"><b>${e(x.title)}</b><p class="muted">${e(x.evidence)} · ${e(x.method)}</p></article>`).join(''):'<p class="muted">No findings yet.</p>';
}
el('embeddedForm').onsubmit=async event=>{
  event.preventDefault();const textarea=el('embeddedRequest');
  try{const r=await api(`/api/projects/${id}/requests`,{method:'POST',data:{message:textarea.value}});
    el('embeddedResult').textContent=`Assistant: ${r.assistant}\n\nManager team: ${r.task.team.specialists.join(', ')}`;
    el('embeddedResult').classList.remove('hidden');textarea.value='';await refresh();
  }catch(err){alert(err.message);}
};
el('embeddedRefresh').onclick=()=>refresh().catch(err=>alert(err.message));
el('embeddedAudit').onclick=async()=>{try{const r=await api(`/api/projects/${id}/audit`,{method:'POST',data:{}});await refresh();alert(`Recorded ${r.findings.length} static findings. Run the separate Playwright runner for real browser journeys.`);}catch(err){alert(err.message);}};
refresh().catch(err=>alert(err.message));

// Same evolution planner as Root; API enforces customer mission and permissions.
async function loadUnit(){
  const data=await api(`/api/projects/${id}/unit`);
  el('unitMission').textContent=data.unit.mission;
  el('unitEvolutionPlans').innerHTML=data.proposals.length
    ?data.proposals.slice(0,8).map(p=>`<article class="entry"><b>${e(p.kind)} · ${e(p.status)}</b><p>${e(p.plan.instruction)}</p><p class="muted">${e(p.target)} · ${e(p.plan.implementationStatus)}</p></article>`).join('')
    :'<p class="muted">No instance-wide improvement plans yet.</p>';
}
el('unitEvolutionForm').onsubmit=async event=>{
  event.preventDefault();
  try{
    const r=await api(`/api/projects/${id}/unit/evolution`,{method:'POST',data:{message:el('unitEvolutionMessage').value,changeKind:el('unitEvolutionKind').value}});
    el('unitEvolutionResult').textContent=`Manager prepared a ${r.proposal.changeKind} plan. Team: ${r.proposal.team.agents.join(', ')}. This is a proposal, not an executed change.`;
    el('unitEvolutionResult').classList.remove('hidden');el('unitEvolutionMessage').value='';await loadUnit();
  }catch(err){alert(err.message);}
};
loadUnit().catch(err=>{el('unitMission').textContent=`Mission unavailable: ${err.message}`;});
