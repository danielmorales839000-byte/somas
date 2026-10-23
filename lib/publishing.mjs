import {AppError,text,projectKind} from './domain.mjs';
import {seal,unseal} from './provider.mjs';
import {fixedEndpointFetch} from './http.mjs';
import {standaloneWorker,standaloneTeamModule} from './standalone-site.mjs';
import {mintTeamTicket} from './ai-team/access.mjs';
import {rootGuidance} from './subnets.mjs';
import {getDomain} from 'tldts';
import {syncSubnet} from './subnets.mjs';
import {isVerified,verificationRequired} from './membership.mjs';
const API='https://api.cloudflare.com/client/v4';
const changed=r=>(r.meta?.changes??r.changes??0)>0;
export function rootDomain(value,rootOrigin){
 const host=text(value,253,4).toLowerCase();
 if(!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||/\.(?:local|localhost|test|example|invalid)$/.test(host))throw new AppError('Enter a root domain you own, such as yourbusiness.com, without https:// or a path.');
 const root=new URL(rootOrigin).hostname;
 if(getDomain(host,{allowPrivateDomains:false})!==host)throw new AppError('Use a registered root domain, such as yourbusiness.com, rather than a subdomain.');
 if(host===root||host.endsWith('.'+root)||root.endsWith('.'+host)||host==='chatgpt.site'||host.endsWith('.chatgpt.site'))throw new AppError('Use a separate domain you own, outside the SOMAS domain.');
 return host;
}
export async function cloud(connection,path,{method='GET',body}={},fetcher=fetch){
 let r;try{r=await fixedEndpointFetch(fetcher,API+path,{method,headers:{Authorization:'Bearer '+connection.token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(9000)})}catch{throw new AppError('Cloudflare could not be reached. The saved publication can retry.',502,'hosting_network')}
 let x;try{x=await r.json()}catch{throw new AppError('Cloudflare returned an unreadable response.',502,'hosting_network')}
 if(!r.ok||x.success!==true){const code=r.status===429||r.status>=500?'hosting_retry':'hosting_rejected';throw new AppError('Cloudflare rejected this request (HTTP '+r.status+'). '+(r.status===401||r.status===403?'Check the API token permissions and account ID.':'Check the domain and Workers configuration in Cloudflare.'),r.status===429?429:502,code)}
 return x.result;
}
export async function connection(env,owner){const c=await env.DB.prepare('SELECT * FROM hosting_connections WHERE owner=?').bind(owner).first();if(!c)throw new AppError('Connect your Cloudflare account in Hosting first.',409,'hosting_required');return {...c,token:await unseal(env.APP_DATA_KEY,c.secret,'hosting:'+owner)}}
export async function hostingStatus(env,owner){const c=await env.DB.prepare('SELECT account_id,workers_subdomain,updated FROM hosting_connections WHERE owner=?').bind(owner).first();return {connected:!!c,accountId:c?.account_id||'',workersSubdomain:c?.workers_subdomain||'',updated:c?.updated||null}}
export async function connectHosting(env,owner,input,fetcher){
 const accountId=text(input.accountId,32,32),token=text(input.token,256,20);if(!/^[a-f0-9]{32}$/i.test(accountId)||/[\s\r\n]/.test(token))throw new AppError('Enter a valid Cloudflare account ID and API token.');
 const bound=await env.DB.prepare('SELECT account_id FROM project_publications WHERE owner=? LIMIT 1').bind(owner).first();if(bound&&bound.account_id!==accountId)throw new AppError('This workspace already has domains connected to another Cloudflare account. Keep that account ID.',409);
 await cloud({token},'/accounts/'+accountId+'/workers/scripts',{},fetcher);
 let workersSubdomain='';try{const x=await cloud({token},'/accounts/'+accountId+'/workers/subdomain',{},fetcher);if(typeof x.subdomain==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x.subdomain))workersSubdomain=x.subdomain}catch{}
 const secret=await seal(env.APP_DATA_KEY,token,'hosting:'+owner);
 await env.DB.prepare('INSERT INTO hosting_connections(owner,account_id,secret,workers_subdomain,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET account_id=excluded.account_id,secret=excluded.secret,workers_subdomain=excluded.workers_subdomain,updated=excluded.updated').bind(owner,accountId,secret,workersSubdomain,Date.now()).run();return hostingStatus(env,owner);
}
export async function publicationStatus(env,id){
 const p=await env.DB.prepare('SELECT hostname,address_type,team_runtime,auto_publish,status,desired_version,published_version,observed_version,last_error,last_seen,next_at,lease_until FROM project_publications WHERE project_id=?').bind(id).first();
 return p?{...p,url:'https://'+p.hostname,teamUrl:p.team_runtime?'https://'+p.hostname+'/team':null,busy:p.lease_until>Date.now(),lease_until:undefined}:null;
}
export async function projectTeamAccess(env,id,owner){
 const p=await env.DB.prepare("SELECT * FROM project_publications WHERE project_id=? AND owner=? AND team_runtime=1 AND status='live'").bind(id,owner).first();
 if(!p)throw new AppError('Publish and verify this project domain before opening its local AI team.',409);
 const secret=await unseal(env.APP_DATA_KEY,p.secret,'subnet:'+id);
 return {url:'https://'+p.hostname+'/team#ticket='+encodeURIComponent(await mintTeamTicket(secret,id,p.hostname))};
}
export async function configurePublication(env,p,owner,origin,input,fetcher){
 if(input.mode==='workers_dev')throw new AppError('Projects publish on a separate root domain. Choose or register a domain.',400,'root_domain_required');
 if(p.scope==='service'||projectKind(p)==='chatroom')throw new AppError('Independent hosting currently supports business websites. Private chatrooms stay in SOMAS.',409);
 const db=env.DB,c=await connection(env,owner),prior=await db.prepare('SELECT * FROM project_publications WHERE project_id=?').bind(p.id).first(),free=input.mode==='workers_dev',workerName='somas-'+p.id.replace(/-/g,'');
 let hostname,zoneId='';
 if(free){const x=await cloud(c,'/accounts/'+c.account_id+'/workers/subdomain',{},fetcher);if(typeof x.subdomain!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x.subdomain))throw new AppError('In Cloudflare, open Workers & Pages and choose your workers.dev account name, then retry here.',409,'workers_setup_required');hostname=workerName+'.'+x.subdomain+'.workers.dev'}
 else{hostname=rootDomain(input.hostname,origin);const zones=await cloud(c,'/zones?name='+encodeURIComponent(hostname)+'&account.id='+c.account_id+'&status=active',{},fetcher),zone=zones.find(z=>z.name===hostname&&z.account?.id===c.account_id&&z.status==='active');if(!zone)throw new AppError('This new domain is not active in your Cloudflare account yet. Complete registration in Cloudflare; SOMAS will check again automatically.',409,'domain_not_ready');zoneId=zone.id}
 if(prior&&(prior.hostname!==hostname||prior.address_type!==(free?'workers_dev':'custom_domain')))throw new AppError('This project already has a deployment address. Create a new project to publish on another address.',409);
 if(prior?.lease_until>Date.now())throw new AppError('Publication is in progress. Refresh shortly.',409);
 const collision=await db.prepare('SELECT project_id FROM project_publications WHERE hostname=? AND project_id<>?').bind(hostname,p.id).first();if(collision)throw new AppError('That domain is already assigned to another project.',409);
 const secret=prior?.secret||await seal(env.APP_DATA_KEY,Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),'subnet:'+p.id);
 const saved=await db.prepare("INSERT INTO project_publications(project_id,owner,hostname,address_type,worker_name,account_id,zone_id,root_origin,secret,auto_publish,status,desired_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET auto_publish=excluded.auto_publish,status=excluded.status,desired_version=excluded.desired_version,attempts=0,next_at=0,last_error='',publish_stage='preflight' WHERE project_publications.lease_until<?").bind(p.id,owner,hostname,free?'workers_dev':'custom_domain',workerName,c.account_id,zoneId,origin,secret,input.autoPublish===false?0:1,p.site?'queued':'awaiting_release',p.version,Date.now()).run();if(!changed(saved))throw new AppError('Publication is in progress. Refresh shortly.',409);
 return publicationStatus(env,p.id);
}
export async function proof(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function sameSecret(a,b){const hash=async x=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));const x=await hash(a),y=await hash(b);let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0}
async function checkLive(env,p,fetcher){
 const challenge=crypto.randomUUID(),key=await unseal(env.APP_DATA_KEY,p.secret,'subnet:'+p.project_id);
 try{const r=await fixedEndpointFetch(fetcher,'https://'+p.hostname+'/__somas/health?challenge='+challenge,{signal:AbortSignal.timeout(8000)});if(!r.ok)return false;const x=await r.json();if(x.projectId!==p.project_id||x.version!==p.published_version||!await sameSecret(String(x.proof),await proof(key,challenge+':'+x.version)))return false;
 if(p.team_runtime){
  const row=await env.DB.prepare('SELECT data FROM projects WHERE id=? AND owner=?').bind(p.project_id,p.owner).first();if(!row)return false;
  const boot=await fixedEndpointFetch(fetcher,'https://'+p.hostname+'/__somas/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':key},body:row.data,signal:AbortSignal.timeout(12000)});if(!boot.ok||!(await boot.json()).ready)return false;
 }
 await env.DB.prepare("UPDATE project_publications SET status=CASE WHEN desired_version>published_version THEN 'queued' ELSE 'live' END,observed_version=?,last_seen=?,last_error='' WHERE project_id=?").bind(x.version,Date.now(),p.project_id).run();return true}catch{return false}
}
function checkDomainConflict(p,domains,dns){
 const domain=domains.find(d=>d.hostname===p.hostname);
 if(domain&&domain.service!==p.worker_name)throw new AppError('This domain is already connected to another Worker. Choose an unused root domain.',409,'domain_conflict');
 if(!domain&&dns.some(d=>['A','AAAA','CNAME'].includes(d.type)))throw new AppError('This domain already has website DNS records. Use an unused domain, or remove those website records yourself in Cloudflare before publishing. SOMAS will not replace them.',409,'domain_conflict');
}
export async function publishOne(env,fetcher=fetch,{owner,id}={}){
 const db=env.DB,now=Date.now(),clauses=["status IN ('queued','publishing','domain_pending')",'next_at<=?','lease_until<?'],args=[now,now];if(owner){clauses.push('owner=?');args.push(owner)}if(id){clauses.push('project_id=?');args.push(id)}
 const p=await db.prepare('SELECT * FROM project_publications WHERE '+clauses.join(' AND ')+' ORDER BY next_at ASC LIMIT 1').bind(...args).first();if(!p)return null;
 const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(p.owner).first();if(user?.status==='suspended'||verificationRequired(env)&&(!user||!isVerified(user,env))){await db.prepare("UPDATE project_publications SET status='failed',last_error='Publication paused: the project owner must be active and verified.' WHERE project_id=?").bind(p.project_id).run();return null;}
 const lock=await db.prepare('UPDATE project_publications SET lease_until=? WHERE project_id=? AND lease_until<?').bind(now+180000,p.project_id,now).run();if(!changed(lock))return null;
 try{
  if(p.status==='domain_pending'){if(!await checkLive(env,p,fetcher))await db.prepare('UPDATE project_publications SET next_at=? WHERE project_id=?').bind(now+60000,p.project_id).run();return p.project_id}
  const row=await db.prepare('SELECT * FROM projects WHERE id=? AND owner=?').bind(p.project_id,p.owner).first();if(!row)throw new AppError('Project is unavailable.',404);const project=JSON.parse(row.data);
  if(!project.site){await db.prepare("UPDATE project_publications SET status='awaiting_release' WHERE project_id=?").bind(p.project_id).run();return p.project_id}
  const c=await connection(env,p.owner);if(c.account_id!==p.account_id)throw new AppError('Reconnect the original Cloudflare account.',409);
  if(p.publish_stage==='preflight'){
   if(p.address_type==='workers_dev'){const x=await cloud(c,'/accounts/'+c.account_id+'/workers/subdomain',{},fetcher);if(p.hostname!==p.worker_name+'.'+x.subdomain+'.workers.dev')throw new AppError('Your Cloudflare account address changed. Review Hosting before retrying.',409);await db.prepare("UPDATE project_publications SET status='publishing',publish_stage='upload',next_at=0 WHERE project_id=?").bind(p.project_id).run();return p.project_id}
   const [zones,domains,dns]=await Promise.all([
    cloud(c,'/zones?name='+p.hostname+'&account.id='+c.account_id+'&status=active',{},fetcher),
    cloud(c,'/accounts/'+c.account_id+'/workers/domains?hostname='+p.hostname,{},fetcher),
    cloud(c,'/zones/'+p.zone_id+'/dns_records?name='+p.hostname+'&per_page=100',{},fetcher)
   ]);
   if(!zones.some(z=>z.id===p.zone_id&&z.name===p.hostname&&z.account?.id===c.account_id&&z.status==='active'))throw new AppError('Domain ownership or Cloudflare zone status changed. Reconnect this domain.',409);
   checkDomainConflict(p,domains,dns);
   await db.prepare("UPDATE project_publications SET status='publishing',publish_stage='upload',next_at=0 WHERE project_id=?").bind(p.project_id).run();return p.project_id;
  }
  if(p.publish_stage==='upload'){
   const linkKey=await unseal(env.APP_DATA_KEY,p.secret,'subnet:'+p.project_id),form=new FormData();
   const account=await db.prepare('SELECT * FROM accounts WHERE owner=?').bind(p.owner).first();if(!account)throw new AppError('Connect an AI provider before publishing this service with its own team.',409,'setup_required');
   const scripts=await cloud(c,'/accounts/'+c.account_id+'/workers/scripts',{},fetcher),existing=scripts.find(s=>s.id===p.worker_name),tag=existing?.migration_tag;
   if(tag&&tag!=='somas-team-v1')throw new AppError('This Worker has an unknown AI-team migration. Review its deployment before overwriting.',409);
   const bindings=[{type:'plain_text',name:'ROOT_ORIGIN',text:p.root_origin},{type:'plain_text',name:'SITE_HOST',text:p.hostname},{type:'plain_text',name:'PROJECT_ID',text:p.project_id},{type:'plain_text',name:'TEAM_CONFIG',text:JSON.stringify({provider:account.provider,managerModel:account.manager_model,workerModel:account.worker_model,pricing:JSON.parse(account.pricing||'{}')})},{type:'secret_text',name:'SUBNET_KEY',text:linkKey},{type:'secret_text',name:'TEAM_API_KEY',text:await unseal(env.APP_DATA_KEY,account.secret,p.owner)},{type:'durable_object_namespace',name:'PROJECT_TEAM',class_name:'ProjectTeam'}];
   form.set('metadata',new Blob([JSON.stringify({main_module:'site.mjs',compatibility_date:'2026-05-15',bindings,...(!tag?{migrations:{new_tag:'somas-team-v1',steps:[{new_sqlite_classes:['ProjectTeam']}]}}:{})})],{type:'application/json'}));
   form.set('site.mjs',new Blob([standaloneWorker(project)],{type:'application/javascript+module'}),'site.mjs');
   form.set('ai-team.mjs',new Blob([standaloneTeamModule()],{type:'application/javascript+module'}),'ai-team.mjs');
   await cloud(c,'/accounts/'+c.account_id+'/workers/scripts/'+p.worker_name,{method:'PUT',body:form},fetcher);
   await db.prepare("UPDATE project_publications SET status='publishing',publish_stage='domain',published_version=?,team_runtime=1,next_at=0 WHERE project_id=?").bind(project.version,p.project_id).run();return p.project_id;
  }
  if(p.address_type==='workers_dev'){const enabled=await cloud(c,'/accounts/'+c.account_id+'/workers/scripts/'+p.worker_name+'/subdomain',{method:'POST',body:{enabled:true,previews_enabled:false}},fetcher);if(enabled.enabled!==true)throw new AppError('Cloudflare did not enable the generated website address.',502);await db.prepare("UPDATE project_publications SET status='domain_pending',publish_stage='preflight',domain_id='workers_dev',last_error='',attempts=0,next_at=? WHERE project_id=?").bind(now+10000,p.project_id).run();return p.project_id}
  const [domains,dns]=await Promise.all([cloud(c,'/accounts/'+c.account_id+'/workers/domains?hostname='+p.hostname,{},fetcher),cloud(c,'/zones/'+p.zone_id+'/dns_records?name='+p.hostname+'&per_page=100',{},fetcher)]);
  checkDomainConflict(p,domains,dns);
  const attached=await cloud(c,'/accounts/'+c.account_id+'/workers/domains',{method:'PUT',body:{hostname:p.hostname,service:p.worker_name,zone_id:p.zone_id,enabled:true}},fetcher);
  await db.prepare("UPDATE project_publications SET status='domain_pending',publish_stage='preflight',domain_id=?,last_error='',attempts=0,next_at=? WHERE project_id=?").bind(attached.id,now+60000,p.project_id).run();
 }catch(err){const retry=['hosting_retry','hosting_network'].includes(err.code)&&p.attempts<4;await db.prepare("UPDATE project_publications SET status=?,publish_stage='preflight',last_error=?,attempts=attempts+1,next_at=? WHERE project_id=?").bind(retry?'queued':'failed',err instanceof AppError?err.message:'Publication failed. Check Hosting and retry.',now+Math.min(3600000,30000*2**p.attempts),p.project_id).run()}
 finally{await db.prepare('UPDATE project_publications SET lease_until=0 WHERE project_id=?').bind(p.project_id).run();const row=await db.prepare('SELECT data,owner FROM projects WHERE id=?').bind(p.project_id).first();if(row)await syncSubnet(db,JSON.parse(row.data),row.owner)}
 return p.project_id;
}
export async function subnetCallback(req,env,id,action,input){
 if(req.method!=='POST'||!['report','contact','team'].includes(action))throw new AppError('Not found.',404);
 const db=env.DB,p=await db.prepare('SELECT * FROM project_publications WHERE project_id=?').bind(id).first(),link=await db.prepare('SELECT connected FROM subnet_links WHERE project_id=?').bind(id).first();
 if(!p||!link||!link.connected&&action!=='team')throw new AppError('Subnet connection unavailable.',403);
 const key=req.headers.get('X-SOMAS-Subnet-Key')||'';if(!await sameSecret(key,await unseal(env.APP_DATA_KEY,p.secret,'subnet:'+id)))throw new AppError('Subnet authentication failed.',403);
 const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(p.owner).first();if(user?.status==='suspended'||verificationRequired(env)&&(!user||!isVerified(user,env)))throw new AppError('Subnet connection unavailable.',403);
 if(action==='team'){
  if(!p.team_runtime||input.hostname!==p.hostname||!['plan','task','review','settle'].includes(input.phase)||!['queued','paused','complete','setup','blocked','reporting','working','evaluating'].includes(input.status)||!Number.isInteger(input.version)||input.version<0||!Number.isInteger(input.round)||input.round<1)throw new AppError('Invalid team report.',400);
  const row=await db.prepare('SELECT data,paused FROM projects WHERE id=?').bind(id).first(),project=JSON.parse(row.data);
  if(!link.connected)return {received:false,paused:!!row.paused,guidance:[]};
  await db.prepare('UPDATE subnet_links SET last_report=?,updated=? WHERE project_id=?').bind(JSON.stringify({name:project.name,status:input.status,phase:input.phase,version:input.version,round:input.round,runtime:'project-service',updated:Date.now()}),Date.now(),id).run();
  return {received:true,paused:!!row.paused,guidance:await rootGuidance(db,id)};
 }
 if(action==='report'){
  if(input.hostname!==p.hostname||!Number.isInteger(input.version)||input.version!==p.published_version||!p.domain_id)throw new AppError('Unexpected publication report.',409);
  await db.prepare("UPDATE project_publications SET status=CASE WHEN desired_version>published_version THEN 'queued' ELSE 'live' END,observed_version=?,last_seen=?,last_error='' WHERE project_id=? AND lease_until<?").bind(input.version,Date.now(),id,Date.now()).run();return {received:true};
 }
 const name=text(input.name,100,1),email=text(input.email,200,3),message=text(input.message,1500,3),requestId=text(input.requestId,36,36);if(!/^[\da-f-]{36}$/.test(requestId)||!/^\S+@\S+\.\S+$/.test(email))throw new AppError('Invalid inquiry.');
 const hash=await proof(key,text(input.ip,100,1)),rateKey='subnet-contact:'+id+':'+hash,now=Date.now();
 await db.prepare('INSERT INTO login_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END').bind(rateKey,now,now-3600000,now-3600000).run();
 const limit=await db.prepare('SELECT count FROM login_limits WHERE key=?').bind(rateKey).first();if(limit.count>10)throw new AppError('Too many messages. Try again later.',429);
 await db.prepare('INSERT OR IGNORE INTO submissions(id,project_id,owner,name,email,message,created) VALUES(?,?,?,?,?,?,?)').bind('subnet-'+requestId,id,p.owner,name,email,message,now).run();return {saved:true};
}
