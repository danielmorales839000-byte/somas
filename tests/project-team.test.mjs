import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newProject} from '../lib/domain.mjs';
import {standaloneWorker,standaloneTeamModule} from '../lib/standalone-site.mjs';
import {mintTeamTicket} from '../lib/ai-team/access.mjs';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{Miniflare}=require('miniflare');
const site={name:'Willow Table',tagline:'A shared table',headline:'A table for every season',description:'Explore our seasonal offerings.',cta:'Get in touch',about:'A neighborhood restaurant.',accent:'#49664c',theme:'light',layout:'split',offerings:[{title:'Seasonal menu',description:'Discover what is in season.'}],faq:[]};
const secret='fixture-subnet-secret-for-project-tests';
async function fixture(t){
 const p=newProject('owner',{requirement:'Make a clear seasonal restaurant website.',autoImprove:false});p.site=site;p.version=1;const calls=[];let rootOffline=false,providerMode='valid';
 // The test subclass advances the real alarm handler deterministically, without
 // waiting for production's 30-second call spacing or exposing a production route.
 const testModule=`import {ProjectTeam as Base} from './ai-team.mjs';export class TestProjectTeam extends Base {async alarm(){}async fetch(req){if(new URL(req.url).pathname==='/__test/tick'){this.nextCall=0;if(this.project){this.project.nextAt=0;await this.save(this.project)}await super.alarm();return Response.json({ok:true})}return super.fetch(req)}}`;
 const mf=new Miniflare({modulesRoot:'/project',modules:[{type:'ESModule',path:'/project/site.mjs',contents:standaloneWorker(p)+"\nexport {TestProjectTeam} from './test-team.mjs';"},{type:'ESModule',path:'/project/ai-team.mjs',contents:standaloneTeamModule()},{type:'ESModule',path:'/project/test-team.mjs',contents:testModule}],durableObjects:{PROJECT_TEAM:{className:'TestProjectTeam',useSQLite:true}},compatibilityDate:'2026-05-15',bindings:{PROJECT_ID:p.id,SITE_HOST:'willow-business.com',ROOT_ORIGIN:'https://somas.test',SUBNET_KEY:secret,TEAM_API_KEY:'fixture-provider-secret',TEAM_CONFIG:JSON.stringify({provider:'groq',managerModel:'manager-model',workerModel:'worker-model'})},outboundService:async req=>{
  if(new URL(req.url).hostname==='somas.test'){if(rootOffline)throw Error('Root offline');return Response.json({received:true,paused:false,guidance:[{message:'Keep contact copy concise.'}]})}
  assert.equal(new URL(req.url).origin,'https://api.groq.com');assert.equal(req.headers.get('Authorization'),'Bearer fixture-provider-secret');const request=await req.json(),context=JSON.parse(request.messages[1].content);calls.push(request);
  if(providerMode==='quota')return Response.json({error:{}},{status:429,headers:{'Retry-After':'60'}});
  let output;if(request.messages[0].content.includes('As Manager'))output={goal:p.requirement,tasks:[{role:'engineer',task:'Clarify the restaurant website headline.'}],draft:site};else if(request.messages[0].content.includes('Evaluate the attached'))output={accepted:true,score:88,reason:'The content makes the restaurant offering clearer.',agentLesson:'Use concrete wording about seasonal dishes.',managerLesson:'Check the change against the original brief.',nextImprovement:'Review the contact journey.',complete:false};else output={summary:'Clarified the website headline and retained the contact form.',findings:'The headline describes seasonal dining.',lesson:'Describe the main offering directly.',site:{...site,headline:'Seasonal dining, made welcoming'}};
  return Response.json({id:'fixture-response-'+calls.length,model:request.model,usage:{prompt_tokens:80,completion_tokens:120},choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});
 }});t.after(()=>mf.dispose());const namespace=await mf.getDurableObjectNamespace('PROJECT_TEAM'),stub=namespace.get(namespace.idFromName(p.id));let cookie='';
 async function call(action,data,{origin='https://willow-business.com',withCookie=true}={}){const r=await mf.dispatchFetch('https://willow-business.com/__somas/team/'+action,{method:data?'POST':'GET',headers:{Origin:origin,...(withCookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const c=r.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return {status:r.status,headers:r.headers,data:await r.json()}}
 async function bootstrap(project=p){return mf.dispatchFetch('https://willow-business.com/__somas/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':secret},body:JSON.stringify(project)})}
 const ticket=()=>mintTeamTicket(secret,p.id,'willow-business.com');
 return {p,mf,stub,calls,call,bootstrap,ticket,setRootOffline:v=>rootOffline=v,setProviderMode:v=>providerMode=v,tick:()=>stub.fetch('https://willow-business.com/__test/tick')};
}
test('deployed project team requires owner access, redeems tickets once and isolates sessions by project',async t=>{
 const f=await fixture(t);assert.equal((await f.call('state')).status,401);assert.equal((await f.bootstrap()).status,200);
 const ticket=await f.ticket();assert.equal((await f.call('session',{ticket},{origin:'https://evil.test'})).status,403);const signedIn=await f.call('session',{ticket});assert.equal(signedIn.status,200);assert.match(signedIn.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.equal((await f.call('session',{ticket})).status,401);
 assert.equal((await f.call('state')).data.project.status,'paused');assert.equal((await f.call('control',{action:'resume'},{withCookie:false})).status,401);assert.equal((await f.call('control',{action:'resume'},{origin:'https://evil.test'})).status,403);
 const other=await mintTeamTicket(secret,'another-project','willow-business.com');assert.equal((await f.call('session',{ticket:other})).status,401);assert.equal((await f.call('session',{ticket:ticket+'bad'})).status,401);
 assert.equal((await f.bootstrap({...f.p,id:'another-project'})).status,403);assert.equal((await f.call('logout',{})).status,200);assert.equal((await f.call('state')).status,401);
});
test('real project runtime plans, calls a specialist, reviews evidence, persists memory and publishes locally during a Root outage',async t=>{
 const f=await fixture(t);await f.bootstrap();await f.call('session',{ticket:await f.ticket()});await f.call('control',{action:'goal',goal:'Make the restaurant service clear and welcoming.'});f.setRootOffline(true);
 await f.tick();let state=(await f.call('state')).data.project;assert.equal(state.phase,'task');assert.ok(state.agents.length>1);assert.equal(f.calls.length,1);
 await f.tick();state=(await f.call('state')).data.project;assert.equal(state.phase,'review');assert.equal(state.reports.length,1);assert.equal(state.reports[0].evaluation,null);assert.equal(f.calls[1].model,'worker-model');
 await f.tick();state=(await f.call('state')).data.project;assert.equal(state.reports[0].evaluation.accepted,true);assert.equal(state.agents.find(a=>a.id==='manager').memory.length,1);assert.equal(state.agents.find(a=>a.id==='engineer').memory.length,1);assert.equal(state.version,2);assert.equal(state.calls,3);
 const html=await (await f.mf.dispatchFetch('https://willow-business.com/')).text();assert.match(html,/Seasonal dining, made welcoming/);assert.ok(!html.includes('fixture-provider-secret'));assert.ok(!html.includes(state.requirement));
 // Re-publication cannot erase the deployed team's memory or accepted content.
 await f.bootstrap();assert.equal((await f.call('state')).data.project.version,2);await f.call('control',{action:'pause'});const before=f.calls.length;await f.tick();assert.equal(f.calls.length,before);
});
test('provider quota preserves the local team task for retry instead of creating fake work',async t=>{
 const f=await fixture(t);await f.bootstrap();await f.call('session',{ticket:await f.ticket()});await f.call('control',{action:'goal',goal:'Improve the restaurant website with clearer copy.'});f.setProviderMode('quota');await f.tick();let state=(await f.call('state')).data.project;assert.equal(state.phase,'plan');assert.equal(state.error.code,'provider_quota');assert.equal(state.reports.length,0);assert.ok(state.nextAt>Date.now());
 f.setProviderMode('valid');await f.tick();state=(await f.call('state')).data.project;assert.equal(state.phase,'task');assert.equal(state.error,null);
});
