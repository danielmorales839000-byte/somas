import {mountOperations} from './operations-ui.js';
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

let rootOperationsView;
async function loadRootOperations(){
  try {
    const [root,overview]=await Promise.all([fetch('/api/admin/root').then(r=>{if(!r.ok)throw new Error('admin_required');return r.json();}),fetch('/api/admin/overview').then(r=>{if(!r.ok)throw new Error('overview_unavailable');return r.json();})]);
    const overviewNode=document.getElementById('rootOverview');
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    overviewNode.innerHTML=`<h2>Platform operations</h2><div class="root-summary"><span>${overview.accounts.length} accounts shown</span><span>${overview.instances.length} instances shown</span><span>${overview.health.reduce((n,s)=>n+Number(s.count),0)} recorded jobs</span></div><div class="admin-table"><table><thead><tr><th>Application</th><th>Subscription</th><th>Release</th><th>Status</th></tr></thead><tbody>${overview.instances.map(i=>`<tr><td>${escape(i.slug)}</td><td>${escape(i.plan)} · ${escape(i.subscription_status)}</td><td>${Number(i.active_release)}</td><td>${i.suspended?'Suspended':'Available'}</td></tr>`).join('')}</tbody></table></div><p class="hint">Operational metadata only. Root authority does not grant access to customer conversations, objectives or application content.</p>`;
    const accountSection=document.createElement('section');accountSection.className='admin-table';
    accountSection.innerHTML=`<h3>Account status</h3><table><thead><tr><th>Account ID</th><th>Status</th><th>Action</th></tr></thead><tbody>${overview.accounts.map(a=>`<tr><td>${escape(a.id)}</td><td>${escape(a.account_status)}</td><td><button class="small-outline" data-account="${escape(a.id)}" data-status="${a.account_status==='active'?'suspended':'active'}">${a.account_status==='active'?'Suspend':'Restore'}</button></td></tr>`).join('')}</tbody></table><h3>Security activity</h3>${overview.securityEvents.map(event=>`<p>${escape(event.action.replaceAll('_',' '))} · ${escape(new Date(event.created_at).toLocaleString())}</p>`).join('')||'<p>No security events recorded.</p>'}`;
    overviewNode.append(accountSection);
    accountSection.querySelectorAll('[data-account]').forEach(button=>button.onclick=async()=>{
      if(!confirm(`${button.dataset.status==='suspended'?'Suspend':'Restore'} account ${button.dataset.account}? Suspension revokes existing sessions.`))return;
      try{await api(`/api/admin/users/${button.dataset.account}/status`,{method:'POST',data:{status:button.dataset.status}});await loadRootOperations();}
      catch(error){document.getElementById('rootResult').textContent=error.message;}
    });
    rootOperationsView?.destroy();
    rootOperationsView=mountOperations({element:document.getElementById('rootOperations'),base:'/api/admin/root/operations',agents:root.agents,getAgents:async()=>(await api('/api/admin/root')).agents,onError:message=>{document.getElementById('rootResult').textContent=message;}});
  } catch(e){document.getElementById('rootOverview').textContent=e.message;}
}
loadRootOperations();
