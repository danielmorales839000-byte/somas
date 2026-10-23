import {DurableObject} from 'cloudflare:workers';
import {runTeamStep} from './project-runtime.mjs';
import {verifyTeamTicket,signature} from './access.mjs';
import {teamPanel,teamCSS,teamJS} from './panel.mjs';
import {AppError,text,log,validateSite,publicProject} from '../domain.mjs';
import {seal} from '../provider.mjs';
import {standaloneHTML} from '../site-renderer.mjs';
const reply=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const cookieName='__Host-somas-project';
const cookie=(value,age)=>cookieName+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;
const hash=value=>signature('somas-session-id',value);
async function input(req){const raw=await req.text();if(raw.length>350000)throw new AppError('Request too large.',413);try{return JSON.parse(raw)}catch{throw new AppError('Invalid JSON.')}}
export class ProjectTeam extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.storage=ctx.storage;this.env=env;this.busy=false;ctx.blockConcurrencyWhile(async()=>{this.project=await this.storage.get('project')||null;this.paused=await this.storage.get('paused')??true;this.nextCall=await this.storage.get('nextCall')||0})}
 async save(p){p.updatedAt=Date.now();p.history=p.history.slice(-60);p.reports=p.reports.slice(-35);if(JSON.stringify(p).length>350000)throw new AppError('Project storage limit reached.',413);await this.storage.put('project',p);this.project=p}
 async authorize(req){const id=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!id)return false;const s=await this.storage.get('session:'+await hash(id));return !!s&&s>Date.now()}
 async fetch(req){try{const u=new URL(req.url),action=u.pathname.split('/').at(-1),env=this.env;
  if(action==='site'&&req.method==='GET')return reply({site:this.project?.site||null});
  if(action==='bootstrap'&&req.method==='POST'){
   const provided=req.headers.get('X-SOMAS-Subnet-Key')||'';if(await hash(provided)!==await hash(env.SUBNET_KEY))return reply({error:'Forbidden'},403);
   const p=await input(req);if(p.id!==env.PROJECT_ID||p.scope!=='project')throw new AppError('Wrong project.',403);validateSite(p.site);
   if(!this.project){this.paused=true;p.running=false;p.status='paused';p.nextAt=0;await this.save(p);await this.storage.put('paused',true)}
   return reply({ready:true,projectId:this.project.id,version:this.project.version});
  }
  if(action==='config'&&req.method==='GET')return reply({panel:env.ROOT_ORIGIN+'/?screen=publication&business='+encodeURIComponent(env.PROJECT_ID)});
  if(req.method==='POST'&&req.headers.get('origin')!==u.origin)return reply({error:'Origin rejected'},403);
  if(action==='session'&&req.method==='POST'){
   const data=await input(req),ticket=await verifyTeamTicket(env.SUBNET_KEY,data.ticket,env.PROJECT_ID,env.SITE_HOST);if(!ticket)return reply({error:'Access expired. Open the team from your SOMAS project panel.'},401);
   const now=Date.now();let result=false;const id=crypto.randomUUID()+crypto.randomUUID();
   await this.storage.transaction(async tx=>{const used=(await tx.get('tickets')||[]).filter(t=>t.expires>now);if(used.some(t=>t.nonce===ticket.nonce))return;if(used.length>=100)throw new AppError('Too many access attempts. Retry in one minute.',429);await tx.put('tickets',[...used,ticket]);const sessions=await tx.list({prefix:'session:'});let active=0;for(const [key,expires] of sessions)if(expires<=now)await tx.delete(key);else active++;if(active>=20)throw new AppError('Too many team sessions. Sign out of an older session.',429);await tx.put('session:'+await hash(id),now+1800000);result=true});
   return result?reply({signedIn:true},200,{'Set-Cookie':cookie(id,1800)}):reply({error:'Access ticket already used.'},401);
  }
  if(!await this.authorize(req))return reply({error:'Open this team from your signed-in SOMAS project panel.'},401);
  if(!this.project)return reply({error:'Team setup is not complete. Retry publication in SOMAS.'},409);
  if(action==='state'&&req.method==='GET')return reply({project:publicProject({data:JSON.stringify(this.project),paused:this.paused,lease:this.busy?'busy':null,lease_until:this.busy?Date.now()+90000:0}),runtime:'project-service'});
  if(action==='logout'&&req.method==='POST'){const id=req.headers.get('cookie').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'=')).slice(cookieName.length+1);await this.storage.delete('session:'+await hash(id));return reply({signedIn:false},200,{'Set-Cookie':cookie('',0)})}
  if(action!=='control'||req.method!=='POST')return reply({error:'Not found'},404);
  if(this.busy)return reply({error:'A model task is finishing. Retry shortly.'},409);
  this.busy=true;try{const data=await input(req),p=structuredClone(this.project);if(!['pause','resume','goal'].includes(data.action))throw new AppError('Unknown team action.');
   if(data.action==='goal'){p.requirement=text(data.goal,1600,8);p.goal=p.requirement;p.tasks=[];p.reports=[];p.pendingReport=null;p.phase='plan';p.cycle=0;p.autoImprove=false;log(p,'Owner','New project goal received.')}this.paused=data.action==='pause';
   if(!this.paused&&p.status==='complete')p.phase='plan';p.running=!this.paused;p.status=this.paused?'paused':'queued';p.error=null;p.nextAt=0;
   await this.storage.put('paused',this.paused);await this.save(p);if(this.paused)await this.storage.deleteAlarm();else await this.storage.setAlarm(Date.now()+1000);return reply({saved:true});
  }finally{this.busy=false}
 }catch(e){return reply({error:e instanceof AppError?e.message:'The project team could not complete this request.'},e instanceof AppError?e.status:500)}}
 async alarm(){
  if(this.busy){await this.storage.setAlarm(Date.now()+30000);return}if(this.paused||!this.project?.running)return;
  this.busy=true;try{
   const p=structuredClone(this.project),env=this.env,config=JSON.parse(env.TEAM_CONFIG),now=Date.now();
   try{const r=await fetch(env.ROOT_ORIGIN+'/api/subnets/'+env.PROJECT_ID+'/team',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':env.SUBNET_KEY},body:JSON.stringify({hostname:env.SITE_HOST,status:p.status,phase:p.phase,version:p.version,round:p.cycle+1}),signal:AbortSignal.timeout(5000)});if(r.ok){const x=await r.json();await this.storage.put('guidance',x.guidance||[]);if(x.paused){this.paused=true;p.running=false;p.status='paused';await this.storage.put('paused',true);await this.save(p);return}}else if(r.status===403){this.paused=true;p.running=false;p.status='paused';await this.storage.put('paused',true);await this.save(p);return}}catch{}
   let budget=await this.storage.get('budget')||{start:now,calls:0};if(now-budget.start>=3600000)budget={start:now,calls:0};if(budget.calls>=60){p.nextAt=budget.start+3600000;await this.save(p);await this.storage.setAlarm(p.nextAt);return}
   budget.calls++;await this.storage.put('budget',budget);
   const account={owner:p.owner,secret:await seal(env.SUBNET_KEY,env.TEAM_API_KEY,p.owner),manager_model:config.managerModel,worker_model:config.workerModel,provider:config.provider,pricing:JSON.stringify(config.pricing||{mode:'unknown'}),next_call:this.nextCall};
   const db={prepare:sql=>{let args;return{bind:(...v)=>{args=v;return{first:async()=>account,run:async()=>{if(sql.includes('next_call<=')&&this.nextCall>args[2])return{meta:{changes:0}};this.nextCall=Math.max(this.nextCall,args[0]);await this.storage.put('nextCall',this.nextCall);return{meta:{changes:1}}}}}}}};
   await runTeamStep(db,{APP_DATA_KEY:env.SUBNET_KEY},{owner:p.owner,paused:this.paused},p,null,fetch,{persist:async(_db,_row,value)=>this.save(value),serviceConfig:async()=>({callIntervalMs:30000}),serviceEvidence:async()=>({}),rootGuidance:async()=>this.storage.get('guidance')||[],recordActivity:async()=>{}});
   // Team execution and local publication survive a Root outage. Reports contain
   // operational status only; private prompts, memory and credentials stay here.
   try{const r=await fetch(env.ROOT_ORIGIN+'/api/subnets/'+env.PROJECT_ID+'/team',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':env.SUBNET_KEY},body:JSON.stringify({hostname:env.SITE_HOST,status:p.status,phase:p.phase,version:p.version,round:p.cycle+1}),signal:AbortSignal.timeout(5000)});if(r.ok){const x=await r.json();await this.storage.put('guidance',x.guidance||[])}}catch{}
   if(p.running&&!this.paused)await this.storage.setAlarm(Math.max(Date.now()+30000,p.nextAt||0));
  }finally{this.busy=false}
 }
}
export async function teamRoute(req,env){
 const u=new URL(req.url);const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
 if(req.method==='GET'&&['/team','/__somas/team.js','/__somas/team.css'].includes(u.pathname))return new Response(u.pathname==='/team'?teamPanel:u.pathname.endsWith('.js')?teamJS:teamCSS,{headers:{...headers,'Content-Type':u.pathname==='/team'?'text/html; charset=utf-8':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'}});
 if(u.pathname==='/__somas/bootstrap'||u.pathname.startsWith('/__somas/team/'))return env.PROJECT_TEAM.get(env.PROJECT_TEAM.idFromName(env.PROJECT_ID)).fetch(req);
 return null;
}
export async function projectHTML(env,fallback){
 try{const r=await env.PROJECT_TEAM.get(env.PROJECT_TEAM.idFromName(env.PROJECT_ID)).fetch('https://'+env.SITE_HOST+'/internal/site');const x=await r.json();return x.site?standaloneHTML(x.site):fallback}catch{return fallback}
}
