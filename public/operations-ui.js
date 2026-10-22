import {organizationModel,displayRole,freshCommunicationEvents} from './operations-model.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>new Date(value).toLocaleString();
const tag=state=>`<span class="state state-${escape(state)}">${escape(displayRole(state))}</span>`;
async function api(path,method='GET',data) {
  const r=await fetch(path,{method,credentials:'same-origin',headers:{'content-type':'application/json','x-somas-request':'1'},...(data?{body:JSON.stringify(data)}:{})});
  const body=await r.json();if(!r.ok)throw new Error(body.error||'request_failed');return body;
}
export function mountOperations({element,base,agents,getAgents,onError}) {
  let active=true,timer,ops=null,cursor=null,loading=false,inspected=null;
  element.innerHTML=`<div class="ops-toolbar"><div><div class="eyebrow">MISSION CONTROL</div><h2>Live organization</h2><p class="muted">Recorded work, evidence and decisions from your team's execution history.</p></div><button type="button" class="small-outline" data-refresh>Refresh records</button></div><div data-runtime></div>`;
  const runtime=element.querySelector('[data-runtime]');
  const error=message=>{runtime.innerHTML=`<div class="ops-error" role="alert"><h3>Operations unavailable</h3><p>${escape(message)}</p><p>Existing projects and releases remain accessible. An operator must verify the deployed revision and database migrations.</p></div>`;};
  function render() {
    const model=organizationModel(agents,ops),specialists=model.cards.filter(a=>a.role!=='manager');
    const fresh=freshCommunicationEvents(ops.events,cursor);cursor=Math.max(cursor||0,...ops.events.map(e=>Number(e.id)));
    const animated=new Set(fresh.flatMap(e=>[e.actor_role,e.recipient_role]));
    const card=a=>`<button type="button" class="org-agent ${a.role==='manager'?'org-manager':''}" data-agent="${escape(a.id)}"><span class="agent-glyph">${a.role==='manager'?'✦':a.role==='virtual_customer'?'◎':a.role==='assistant'?'◇':'⌘'}</span>${tag(a.state)}<strong>${escape(a.label)}</strong><span class="agent-assignment">${escape(a.job?displayRole(a.job.kind):'No execution assigned')}</span>${a.job?.blocker?`<small>${escape(a.job.blocker.replaceAll('_',' '))}</small>`:''}<span class="hint">Policy v${Number(a.policy?.version||1)}</span></button>`;
    runtime.innerHTML=`<div class="mission-strip"><div><span class="eyebrow">PERSISTENT OBJECTIVE</span><p>${escape(ops.mission.objective)}</p></div>${tag(ops.mission.state)}</div>
      <div class="ops-metrics"><div><strong>${model.cards.length}</strong><span>Team members</span></div><div><strong>${model.running}</strong><span>Working now</span></div><div><strong>${model.blocked}</strong><span>Blocked or failed</span></div><div><strong>${ops.artifacts.length}</strong><span>Evidence artifacts</span></div></div>
      <div class="org-layout"><div class="org-canvas" aria-label="Manager and specialist organization"><div class="manager-slot">${model.manager?card(model.manager):'<p>No Manager record</p>'}</div><div class="connection-bus" aria-hidden="true"></div><div class="specialist-row">${specialists.map(a=>`<div class="agent-branch ${animated.has(a.role)?'communication-arrived':''}"><span class="connection-stem" aria-hidden="true"></span>${card(a)}</div>`).join('')}</div><p class="org-caption">Links show Manager coordination. Motion appears only for newly received communication events.</p></div>
      <aside class="ops-inspector" data-inspector><h3>Inspect work</h3><p class="muted">Select an agent or an activity to see its task, status and evidence.</p></aside></div>
      <div class="ops-columns"><section><h3>Activity history</h3><div class="ops-feed">${ops.events.length?ops.events.slice(0,25).map(e=>`<button class="event-row" type="button" data-event="${e.id}"><span class="event-dot"></span><span><strong>${escape(e.summary)}</strong><small>${escape(displayRole(e.actor_role))} · ${escape(time(e.created_at))}</small></span>${tag(e.status)}</button>`).join(''):'<p class="muted">No execution events recorded.</p>'}</div></section><section><h3>Mission gaps</h3>${ops.gaps.length?ops.gaps.map(g=>`<details class="gap"><summary>${tag(g.status)} ${escape(g.title)}</summary><pre>${escape(JSON.stringify(g.evidence,null,2))}</pre></details>`).join(''):'<p class="muted">The mission has not yet been assessed.</p>'}<h3>Reviewable artifacts</h3>${ops.artifacts.map(a=>`<a class="artifact" href="${escape(base)}/artifacts/${escape(a.id)}" download>${escape(displayRole(a.kind))} ↗ <small>${escape(time(a.created_at))}</small></a><details class="artifact-integrity"><summary>Artifact integrity reference</summary><code>${escape(a.digest)}</code></details>`).join('')||'<p class="muted">No artifacts recorded.</p>'}</section></div>
      <details class="ops-controls"><summary>Mission execution controls</summary><form data-settings><label>Execution state<select name="state"><option ${ops.mission.state==='active'?'selected':''}>active</option><option ${ops.mission.state==='paused'?'selected':''}>paused</option></select></label><label>Maximum new jobs per month<input name="limit" type="number" min="1" max="100" value="${Number(ops.mission.monthly_job_limit)}" required></label><button class="small-outline" type="submit">Save execution controls</button></form><button type="button" class="primary small" data-cycle>Run bounded assessment</button><p class="hint">Background assessments use the configured Worker cron. Production changes require separate approval. Coding and hosting providers are currently unconfigured.</p></details>`;
    runtime.querySelectorAll('[data-agent]').forEach(b=>b.addEventListener('click',()=>inspect({kind:'agent',id:b.dataset.agent})));
    runtime.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>inspect({kind:'event',id:b.dataset.event})));
    runtime.querySelector('[data-cycle]').onclick=async()=>{try{await api(base+'/cycle','POST',{});await refresh();}catch(e){onError(e.message);}};
    runtime.querySelector('[data-settings]').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target);try{await api(base+'/settings','POST',{state:form.get('state'),monthlyJobLimit:Number(form.get('limit'))});await refresh();}catch(e){onError(e.message);}};
    if(inspected)inspect(inspected);
  }
  function inspect(selection) {
    inspected=selection;
    const node=runtime.querySelector('[data-inspector]');let title,records;
    if(selection.kind==='agent') {
      const a=agents.find(a=>a.id===selection.id);if(!a)return;
      title=displayRole(a.role);records=ops.jobs.filter(q=>q.agent_role===a.role);
    }else {
      const event=ops.events.find(e=>String(e.id)===selection.id);if(!event)return;
      title=event.summary;records=[event,...ops.jobs.filter(q=>q.id===event.job_id)];
    }
    node.innerHTML=`<h3>${escape(title)}</h3>${records.length?records.map(r=>`<div class="inspected-record">${tag(r.status)}<p>${escape(displayRole(r.kind||r.event_type||'Record'))}</p>${r.blocker?`<p>${escape(r.blocker.replaceAll('_',' '))}</p>`:''}<details><summary>Evidence and diagnostic record</summary><pre>${escape(JSON.stringify(r,null,2))}</pre></details></div>`).join(''):'<p>No assigned execution recorded.</p>'}`;
  }
  async function refresh() {
    if(!active||loading)return;loading=true;
    try{const data=await api(base);if(!active)return;ops=data;if(getAgents)agents=await getAgents();render();}
    catch(e){if(active)error(e.message);}finally{loading=false;}
  }
  element.querySelector('[data-refresh]').onclick=refresh;
  refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},15000);
  return {refresh,destroy(){active=false;clearInterval(timer);}};
}
export async function renderConversation(element,base) {
  const ops=await api(base);
  element.innerHTML=ops.messages.length?ops.messages.map(m=>`<article class="chat-message chat-${escape(m.role)}"><header><strong>${m.role==='owner'?'You':'Manager'}</strong><time>${escape(time(m.created_at))}</time></header><p>${escape(m.content)}</p></article>`).join(''):'<div class="chat-empty"><span>✦</span><h3>What should your application achieve?</h3><p>Your Manager retains your objective, organizes work and records its decisions here.</p></div>';
  element.scrollTop=element.scrollHeight;
}
