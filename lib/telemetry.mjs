import {AppError} from './domain.mjs';
export const PURPOSES={manager:'Plan · delegate · evaluate',researcher:'Understand requirements',designer:'Design · accessibility',engineer:'Build · improve website',customer:'Evaluate user experience',operations:'Audit supported capabilities',learning:'Evaluate team lessons'};
const SERVICE_PURPOSES={manager:'Improve SOMAS · evaluate',researcher:'Analyze service evidence',designer:'Dashboard · usability',engineer:'Improve service settings',customer:'Review SOMAS experience',operations:'Service health · quotas',learning:'Evaluate service lessons'};
const count=v=>Number.isFinite(v)&&v>=0?v:0;
export function pricingConfig(value){
 if(value==null)return {mode:'unknown'};
 if(!['unknown','free','metered'].includes(value.mode))throw new AppError('Choose a valid billing mode.');
 if(value.mode!=='metered')return {mode:value.mode};
 const x={mode:'metered'};for(const name of ['managerInput','managerOutput','workerInput','workerOutput']){if(typeof value[name]!=='number'||!Number.isFinite(value[name])||value[name]<0||value[name]>100000)throw new AppError('Enter a non-negative USD rate for each model, per million tokens.');x[name]=value[name]}return x;
}
function blankUsage(){return {calls:0,input:0,output:0,estimatedUsd:0,reportedUsd:0,estimatedCalls:0,reportedCalls:0,unknownCostCalls:0,missingTokenCalls:0}}
export function hydrateTelemetry(p){
 for(const a of p.agents){a.purpose=(p.scope==='service'?SERVICE_PURPOSES:PURPOSES)[a.id];if(!a.createdAt&&!a.trackedSince){const first=p.reports.find(r=>r.role===a.id);if(first?.at)a.trackedSince=first.at}if(a.learningValue==null)a.learningValue=a.id==='manager'?p.agents.filter(x=>x.id!=='manager').reduce((n,x)=>n+count(x.accepted),0):count(a.accepted)}
 if(p.telemetryVersion===1)return;
 for(const a of p.agents)a.usage=blankUsage();
 const records=[];if(p.planEvidence)records.push({role:'manager',...p.planEvidence});
 for(const r of p.reports){records.push(r);if(r.evaluation?.usage)records.push({role:'manager',...r.evaluation})}
 for(const r of records){const a=p.agents.find(a=>a.id===r.role);if(!a||!r.usage)continue;addUsage(a,{...r,usage:r.usage},'unknown',null);}
 p.unattributedHistoricalCalls=Math.max(0,(p.calls||0)-p.agents.reduce((n,a)=>n+a.usage.calls,0));p.telemetryVersion=1;p.telemetrySince=Date.now();
}
function addUsage(agent,result,role,pricing){const u=agent.usage||=blankUsage(),input=count(result.usage?.input),output=count(result.usage?.output);u.calls++;u.input+=input;u.output+=output;
 let cost=null,source='unknown';if(Number.isFinite(result.providerCost)&&result.providerCost>=0){cost=result.providerCost;source='reported';u.reportedUsd+=cost;u.reportedCalls++}
 else if(pricing?.mode==='free'){cost=0;source='estimated';u.estimatedCalls++}
 else if(pricing?.mode==='metered'&&result.usage?.available!==false){const prefix=role==='manager'?'manager':'worker';cost=(input*pricing[prefix+'Input']+output*pricing[prefix+'Output'])/1e6;source='estimated';u.estimatedUsd+=cost;u.estimatedCalls++}
 else u.unknownCostCalls++;
 if(result.usage?.available===false)u.missingTokenCalls++;
 agent.lastCall={at:Date.now(),model:result.model,provider:result.provider||'groq',requestId:result.requestId,usage:result.usage,cost,source};return agent.lastCall;
}
export function recordUsage(p,agent,result,pricing){hydrateTelemetry(p);p.calls=(p.calls||0)+1;p.tokens=(p.tokens||0)+count(result.usage?.input)+count(result.usage?.output);const record=addUsage(agent,result,agent.id,pricing);p.lastResponse={...record};return record}
export function displayState(p,a,now=Date.now()){
 if(p.paused)return {state:'paused',label:'Paused'};
 if(!p.running)return p.status==='setup'?{state:'setup',label:'Connect AI'}:p.status==='blocked'?{state:'blocked',label:'Blocked'}:{state:'resting',label:'Resting'};
 const waiting=p.nextAt>now,pending=p.reports.find(r=>r.id===p.pendingReport&&!r.evaluation),manager=a.id==='manager';
 if(!manager&&pending?.role===a.id)return {state:'reporting',label:'Report sent'};
 const assigned=manager?(p.phase==='plan'||!!pending):(p.phase==='task'&&p.tasks[0]?.role===a.id);
 if(p.error?.retry&&waiting&&assigned)return {state:p.error.code==='provider_quota'?'quota':'retry',label:p.error.code==='provider_quota'?'Quota wait':'Retry wait'};
 if(manager&&pending){if(p.busy&&a.state==='evaluating')return {state:'evaluating',label:'Reviewing'};return {state:'review-queued',label:'Review queued'}}
 if(p.busy&&['working','evaluating'].includes(a.state))return {state:a.state,label:a.state==='evaluating'?'Reviewing':'Working'};
 if(p.phase==='settle'&&a.state==='learning')return {state:'learning',label:'Learning'};
 if(manager&&p.phase==='plan')return {state:'queued',label:'Plan queued'};
 if(p.tasks.some(t=>t.role===a.id))return {state:'queued',label:'Task queued'};
 return {state:'resting',label:'Resting'};
}
export function snapshotTelemetry(p){hydrateTelemetry(p);for(const a of p.agents){const firstReport=p.reports.find(r=>r.role===a.id);a.ageStart=a.createdAt||(a.id==='manager'?p.createdAt:(a.trackedSince||firstReport?.at))||null;a.ageKind=a.createdAt||a.id==='manager'?'age':'tracked';a.live=displayState(p,a)}
 const total=blankUsage();for(const a of p.agents)for(const key of Object.keys(total))total[key]+=a.usage?.[key]||0;p.usage=total;p.serverTime=Date.now();return p}
