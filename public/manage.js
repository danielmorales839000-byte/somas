const el=id=>document.getElementById(id);
const id=el('somas-manager').dataset.project;
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,{method='GET',data}={}){
  const r=await fetch(path,{method,credentials:'same-origin',headers:{'x-somas-request':'1','content-type':'application/json'},body:data?JSON.stringify(data):undefined});
  const v=await r.json();if(!r.ok)throw new Error(v.error||'request_failed');return v;
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
