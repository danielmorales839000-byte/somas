import {dashboardModel} from './model.js';
const $=id=>document.getElementById(id);
const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
const snapshot=await (await fetch('preview-data.json')).json();
const select=$('instance'),dialog=$('agent-detail');let current;
for(const instance of snapshot.instances){const option=el('option','',instance.title);option.value=instance.id;select.append(option);}
function inspect(card){
 $('detail-title').textContent=card.label;const body=$('detail-content');body.replaceChildren();
 for(const [label,value] of [['Status',card.state],['Mission',card.assignment],['Neural policy',`Version ${card.policy_version}. No learning outcome inferred.`],['Recorded jobs',card.ownJobs.length?card.ownJobs.map(j=>j.kind+': '+j.state).join('\n'):'No execution recorded for this agent.'],['Evidence',current.instance.operations.reports.filter(r=>r.agent_id===card.id).length+' reports in this snapshot'],['Permission boundary',current.instance.mission]]){
  const row=el('div','detail-row');row.append(el('strong','',label),el('span','',value));body.append(row);
 }
 dialog.showModal();
}
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
function render(){
 const instance=snapshot.instances.find(i=>i.id===select.value);current=dashboardModel(instance);
 $('scope').textContent=`${instance.kind==='root'?'PLATFORM WORKSPACE':'CUSTOMER WORKSPACE'} / OWNER COMMAND CENTER`;
 $('title').textContent=instance.title;$('mission').textContent=instance.mission;
 $('manager-status').textContent=`Manager · ${current.manager?.state||'Unavailable'}`;
 $('captured').textContent='Local snapshot captured '+new Date(snapshot.captured_at).toLocaleString();
 $('agent-count').textContent=current.cards.length+' actual agents';$('node-count').textContent=current.cards.length+' nodes';
 const grid=$('agent-grid');grid.replaceChildren();
 for(const card of current.cards){
  const b=el('button','agent-card'+(card.role==='manager'?' manager-card':''));b.type='button';b.setAttribute('aria-label',`Inspect ${card.label}: ${card.state}`);
  const top=el('div','card-top'),name=el('div');name.append(el('div','agent-name',card.label),el('div','agent-role',card.role.replaceAll('_',' ')));top.append(el('span','avatar',card.label.split(' ').map(w=>w[0]).slice(0,2).join('')),name);
  const state=el('div','state');state.append(el('span','dot neutral'),document.createTextNode(card.state));
  const bottom=el('div','card-bottom');bottom.append(el('span','',card.ownJobs.length+' RECORDED JOBS'),el('span','',`POLICY V${card.policy_version}`));
  b.append(top,state,el('p','assignment',card.assignment),bottom);b.addEventListener('click',()=>inspect(card));grid.append(b);
 }
 const graph=$('graph');graph.replaceChildren();
 const root=el('div','graph-root'),children=el('div','graph-children');
 for(const card of current.cards){const node=el('button','graph-node',card.label);node.dataset.agent=card.id;node.addEventListener('click',()=>inspect(card));(card.role==='manager'?root:children).append(node);}
 graph.append(root,children);
 $('graph-note').textContent=current.edges.length?'Connections show recorded Manager mission assignments.':'Actual instance members. No reporting assignments recorded; no delegation links inferred.';
 drawEdges();
 $('chart').replaceChildren(el('strong','',current.jobs.length?'Loaded execution history':'No execution history yet'),el('span','',current.jobs.length?current.jobs.length+' recorded jobs. Outcome chart integration pending.':'A chart appears only after measured outcomes exist.'));
 const feed=$('feed');feed.replaceChildren();
 if(!current.feed.length){const empty=el('div','feed-empty');empty.append(el('span','empty-symbol','⌁'),el('strong','','No activity recorded'),el('p','','New instance. Agent work, evidence and Manager decisions will appear here when recorded.'));feed.append(empty);}
 for(const event of current.feed){const item=el('article','feed-event');item.append(el('small','',event.type.toUpperCase()),el('div','',event.text));feed.append(item);}
 $('approval-count').textContent=current.metrics.approvals?`${current.metrics.approvals} release proposals awaiting review`:'No release awaiting approval';
 const metrics=$('metrics');metrics.replaceChildren();
 for(const [label,value,note] of [['Instance agents',current.metrics.agents,'Canonical agents from this local instance'],['Running jobs',current.metrics.running,'Recorded jobs; no simulated activity'],['Evidence records',current.metrics.evidence,'Loaded history · no findings invented'],['Pending approvals',current.metrics.approvals,'Owner authorization remains required']]){
  const card=el('article','metric');card.append(el('div','metric-label',label),el('div','metric-value',String(value)),el('div','metric-note',note));metrics.append(card);
 }
}
function drawEdges(){
 const graph=$('graph');graph.querySelector('svg')?.remove();if(!current.edges.length)return;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),box=graph.getBoundingClientRect();svg.setAttribute('aria-hidden','true');
 for(const edge of current.edges){const nodes=[...graph.querySelectorAll('[data-agent]')],a=nodes.find(n=>n.dataset.agent===edge.from),b=nodes.find(n=>n.dataset.agent===edge.to);if(!a||!b)continue;
  const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),path=document.createElementNS(ns,'path');path.setAttribute('d',`M ${x.x+x.width/2-box.x} ${x.bottom-box.y} L ${y.x+y.width/2-box.x} ${y.top-box.y}`);path.setAttribute('stroke','#82baff');path.setAttribute('stroke-opacity','.55');path.setAttribute('fill','none');svg.append(path);
 }graph.prepend(svg);
}
select.addEventListener('change',render);new ResizeObserver(()=>drawEdges()).observe($('graph'));render();
