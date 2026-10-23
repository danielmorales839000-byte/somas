import {workerBundle} from './helpers/worker-bundle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/database.mjs';
import {handleAPI} from '../lib/server.mjs';
import {newProject,promptFor} from '../lib/domain.mjs';
import {connectHosting,configurePublication,publicationStatus,publishOne,proof,rootDomain} from '../lib/publishing.mjs';
import {syncSubnet,rootGuidance,networkOverview,deliverReviewedGuidance} from '../lib/subnets.mjs';
import {seal,unseal} from '../lib/provider.mjs';
import {standaloneWorker,standaloneTeamModule} from '../lib/standalone-site.mjs';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const site={name:'Willow Table',tagline:'A shared table',headline:'A table for every season',description:'Explore our seasonal offerings.',cta:'Get in touch',about:'A neighborhood restaurant.',accent:'#49664c',theme:'light',layout:'split',offerings:[{title:'Seasonal menu',description:'Discover what is in season.'}],faq:[]};
const accountId='a'.repeat(32),token='fixture-cloudflare-token-only-123456789';
async function fixture(){
 const {sqlite,db}=testDatabase(),env={DB:db,APP_DATA_KEY:'fixture-encryption-only',EMAIL_VERIFICATION_REQUIRED:'false',SOMAS_ADMIN_USER_ID:'root',PRIVATE_RUNNER_ENABLED:'true'};
 await db.prepare('INSERT INTO accounts(owner,secret,models,manager_model,worker_model) VALUES(?,?,?,?,?)').bind('alice',await seal(env.APP_DATA_KEY,'fixture-ai-key-private','alice'),'["fixture-model"]','fixture-model','fixture-model').run();
 const p=newProject('alice',{name:'Willow',requirement:'Build a seasonal restaurant website.'});p.site=site;p.version=1;p.running=false;p.status='complete';p.reports=[{id:'private-report',summary:'PRIVATE_AI_REPORT',findings:'Private evidence',role:'engineer'}];
 sqlite.prepare('INSERT INTO projects(id,owner,data,updated) VALUES(?,?,?,?)').run(p.id,'alice',JSON.stringify(p),Date.now());await syncSubnet(db,p,'alice');
 const state={calls:[],domains:[],dns:[],uploaded:null,metadata:null,networkFail:false,zone:true,live:true,subdomain:'willow-account'};
 const fetcher=async(url,options={})=>{
  const u=new URL(url);state.calls.push({url,method:options.method||'GET'});
  if(u.hostname==='willow-business.com'||u.hostname.endsWith('.workers.dev')){
   if(u.pathname==='/__somas/bootstrap'){assert.equal(options.method,'POST');assert.ok(options.headers['X-SOMAS-Subnet-Key']);return Response.json({ready:true})}assert.equal(options.headers,undefined);if(!state.live)return new Response('Pending',{status:503});const pub=sqlite.prepare('SELECT * FROM project_publications WHERE hostname=?').get(u.hostname),secret=await unseal(env.APP_DATA_KEY,pub.secret,'subnet:'+pub.project_id),version=pub.published_version;
   return Response.json({projectId:pub.project_id,version,proof:await proof(secret,u.searchParams.get('challenge')+':'+version)});
  }
  assert.equal(u.origin,'https://api.cloudflare.com');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+token);
  if(state.networkFail)throw Error('fixture network interruption');
  let result=[];if(u.pathname.endsWith('/workers/subdomain'))result={subdomain:state.subdomain};else if(u.pathname.endsWith('/subdomain')&&options.method==='POST')result={enabled:true};else if(u.pathname.endsWith('/registrar/domain-check'))result={domains:[{name:'willow-business.com',registrable:true,pricing:{currency:'USD',registration_cost:'12.34',renewal_cost:'14.56'}}]};else if(u.pathname.endsWith('/zones'))result=state.zone?[{id:'zone-1',name:'willow-business.com',status:'active',account:{id:accountId}}]:[];
  else if(u.pathname.endsWith('/dns_records'))result=state.dns;
  else if(u.pathname.endsWith('/domains')){if(options.method==='PUT'){const x=JSON.parse(options.body);result={id:'domain-1',...x};state.domains=[result]}else result=state.domains}
  else if(options.method==='PUT'&&u.pathname.includes('/workers/scripts/')){state.uploaded=await options.body.get('site.mjs').text();state.metadata=JSON.parse(await options.body.get('metadata').text());result={id:'uploaded'}}
  return Response.json({success:true,result});
 };
 async function call(path,method='GET',data,owner='alice',origin='https://somas.test'){
  const headers={Origin:origin,...(owner?{'oai-authenticated-user-id':owner}:{}),...(data?{'Content-Type':'application/json'}:{})};const r=await handleAPI(new Request('https://somas.test/api/'+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})}),env,{hostingFetcher:fetcher});return {status:r.status,data:await r.json()};
 }
 async function configured(){await connectHosting(env,'alice',{accountId,token},fetcher);await configurePublication(env,p,'alice','https://somas.test',{hostname:'willow-business.com'},fetcher)}
 async function advance(){sqlite.prepare('UPDATE project_publications SET next_at=0').run();await publishOne(env,fetcher,{owner:'alice'});return publicationStatus(env,p.id)}
 return {sqlite,db,env,p,state,fetcher,call,configured,advance};
}
test('publishing requires an owned, active root zone outside SOMAS; credentials are encrypted and private',async()=>{
 const f=await fixture();for(const host of ['https://willow-business.com','willow-business.com/a','localhost','127.0.0.1','foo.somas.test','somas.test','foo.chatgpt.site','a..com'])assert.throws(()=>rootDomain(host,'https://somas.test'));
 assert.equal((await f.call('hosting','POST',{accountId,token})).status,200);assert.ok(!f.sqlite.prepare('SELECT secret FROM hosting_connections').get().secret.includes(token));assert.equal((await f.call('hosting','GET',null,'bob')).data.connected,false);
 const bad=await f.call('projects/'+f.p.id+'/publication','POST',{hostname:'www.willow-business.com'});assert.equal(bad.status,400);
 await f.configured();const status=await f.call('projects/'+f.p.id+'/publication');assert.equal(status.data.publication.status,'queued');assert.ok(!JSON.stringify(status).includes(token));assert.ok(!JSON.stringify(status).includes('"secret"'));
 assert.equal((await f.call('projects/'+f.p.id+'/publication','GET',null,'bob')).status,404);assert.equal((await f.call('projects/'+f.p.id+'/publication','GET',null,'root')).status,404);assert.equal((await f.call('hosting','POST',{accountId,token},'alice','https://evil.test')).status,403);
});
test('publication has restartable stages, uploads only public content, and confirms the domain cryptographically',async()=>{
 const f=await fixture();await f.configured();assert.equal((await f.advance()).status,'publishing');assert.equal(f.state.uploaded,null);
 assert.equal((await f.advance()).published_version,1);assert.ok(f.state.uploaded.includes('Willow Table'));assert.ok(!f.state.uploaded.includes('PRIVATE_AI_REPORT'));assert.ok(!f.state.uploaded.includes(token));assert.ok(!f.state.uploaded.includes(f.p.requirement));
 assert.equal(f.state.metadata.main_module,'site.mjs');assert.equal(f.state.metadata.bindings.find(b=>b.name==='SUBNET_KEY').type,'secret_text');assert.equal((await f.advance()).status,'domain_pending');
 f.state.live=false;assert.equal((await f.advance()).status,'domain_pending');f.state.live=true;assert.equal((await f.advance()).status,'live');assert.equal((await f.advance()).observed_version,1);
 f.p.version=2;f.p.site={...site,headline:'A better table'};f.sqlite.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(f.p),f.p.id);await syncSubnet(f.db,f.p,'alice');assert.equal((await publicationStatus(f.env,f.p.id)).status,'live');await f.call('projects/'+f.p.id+'/publication','POST',{action:'publish'});assert.equal((await publicationStatus(f.env,f.p.id)).status,'queued');await f.advance();await f.advance();await f.advance();assert.equal((await f.advance()).observed_version,2);
});
test('existing website DNS and unrelated Worker domains are preserved',async()=>{
 for(const conflict of ['dns','worker']){const f=await fixture();await f.configured();if(conflict==='dns')f.state.dns=[{type:'A',content:'192.0.2.1'}];else f.state.domains=[{hostname:'willow-business.com',service:'unrelated'}];const status=await f.advance();assert.equal(status.status,'failed');assert.match(status.last_error,/already/);assert.ok(!f.state.calls.some(c=>c.method==='PUT'));assert.equal(f.state.uploaded,null)}
});
test('publication retries network failures, respects leases and owner scoping, and does not bypass verification',async()=>{
 const f=await fixture();await f.configured();f.state.networkFail=true;assert.equal((await f.advance()).status,'queued');assert.match((await publicationStatus(f.env,f.p.id)).last_error,/could not be reached/);f.state.networkFail=false;
 f.sqlite.prepare('UPDATE project_publications SET next_at=0,lease_until=?').run(Date.now()+60000);assert.equal(await publishOne(f.env,f.fetcher),null);f.sqlite.prepare('UPDATE project_publications SET lease_until=0').run();assert.equal(await publishOne(f.env,f.fetcher,{owner:'bob'}),null);
 f.env.EMAIL_VERIFICATION_REQUIRED='true';assert.equal(await publishOne(f.env,f.fetcher,{owner:'alice'}),null);f.env.EMAIL_VERIFICATION_REQUIRED='false';f.sqlite.prepare("UPDATE project_publications SET status='queued'").run();await f.advance();assert.equal((await publicationStatus(f.env,f.p.id)).status,'publishing');
});
test('a Cloudflare redirect never receives credentials at another host',async()=>{
 const f=await fixture(),calls=[];await assert.rejects(connectHosting(f.env,'alice',{accountId,token},async(url)=>{calls.push(url);return new Response(null,{status:307,headers:{Location:'https://evil.test'}})}),/could not be reached/);assert.equal(calls.length,1);assert.equal((await f.call('hosting')).data.connected,false);
});
test('projects reject generated subdomains and wait for a chosen root domain',async()=>{
 const f=await fixture();await f.call('hosting','POST',{accountId,token});
 const rejected=await f.call('projects/'+f.p.id+'/publication','POST',{mode:'workers_dev'});assert.equal(rejected.status,400);assert.equal(rejected.data.error.code,'root_domain_required');
 assert.equal((await f.call('projects','POST',{requirement:'Build a new business website.',addressMode:'workers_dev'})).status,400);
 for(const host of ['www.willow-business.com','shop.willow-business.com','anything.workers.dev','one.pages.dev'])assert.throws(()=>rootDomain(host,'https://somas.test'));
 assert.equal(rootDomain('willow.co.uk','https://somas.test'),'willow.co.uk');
});
test('new projects retain domain setup before Cloudflare connection, without inventing a subdomain',async()=>{
 const f=await fixture(),created=await f.call('projects','POST',{requirement:'Build a new business landing page.'});assert.equal(created.status,201);const id=created.data.project.id;
 assert.equal((await f.call('projects/'+id+'/publication')).data.intent.status,'needs_domain');
 assert.equal((await f.call('projects/'+id+'/publication','POST',{mode:'new_domain',hostname:'willow-business.com'})).data.intent.status,'awaiting_hosting');
 assert.equal((await f.call('hosting','POST',{accountId,token})).status,200);assert.equal((await f.call('work','POST',{})).data.kind,'hosting_setup');assert.equal((await f.call('projects/'+id+'/publication')).data.publication.status,'awaiting_release');
});
test('paid domain onboarding checks real prices and waits for Cloudflare checkout and activation without charging',async()=>{
 const f=await fixture();await f.call('hosting','POST',{accountId,token});f.state.zone=false;
 const chosen=await f.call('projects/'+f.p.id+'/publication','POST',{mode:'new_domain',hostname:'willow-business.com'});assert.equal(chosen.status,200);
 const check=await f.call('hosting/domain-check','POST',{hostname:'willow-business.com'});assert.deepEqual(check.data.pricing,{currency:'USD',registration:'12.34',renewal:'14.56'});assert.match(check.data.checkoutUrl,/^https:\/\/dash.cloudflare.com\//);
 assert.equal((await f.call('work','POST',{})).data.intent.status,'awaiting_domain');assert.equal(await publicationStatus(f.env,f.p.id),null);
 f.state.zone=true;f.sqlite.prepare('UPDATE publication_intents SET next_at=0').run();assert.equal((await f.call('work','POST',{})).data.intent.status,'configured');assert.equal((await publicationStatus(f.env,f.p.id)).hostname,'willow-business.com');assert.ok(!f.state.calls.some(c=>c.url.endsWith('/registrar/registrations')));
});
test('publication refuses to silently omit the project AI team when no provider is connected',async()=>{
 const f=await fixture();await f.configured();f.sqlite.prepare('DELETE FROM accounts').run();await f.advance();const result=await f.advance();assert.equal(result.status,'failed');assert.match(result.last_error,/AI provider/);assert.equal(f.state.uploaded,null);
});
test('Root administrators can manage user records without changing sign-in identity or exposing credentials',async()=>{
 const f=await fixture();await f.call('me');await f.call('hosting','POST',{accountId,token});const path='admin/users/alice/details',details={label:'Customer A',organization:'Willow Table',notes:'Private support note'};
 assert.equal((await f.call(path,'POST',details)).status,403);assert.equal((await f.call(path,'POST',details,'root')).status,200);assert.equal((await f.call(path,'POST',{...details,role:'manager'},'root')).status,400);
 const users=(await f.call('admin/users','GET',null,'root')).data.users,alice=users.find(u=>u.id==='alice');assert.equal(alice.details.organization,'Willow Table');assert.equal(alice.hosting.account_id,accountId);assert.ok(!JSON.stringify(users).includes(token));assert.ok(!JSON.stringify(users).includes('"secret"'));assert.equal(f.sqlite.prepare('SELECT role FROM users WHERE id=?').get('alice').role,'user');assert.ok(!JSON.stringify((await networkOverview(f.db))).includes('Private support note'));
});
test('Root and Subnet Managers exchange scoped reports and advice; only accepted AI guidance is delivered',async()=>{
 const f=await fixture();assert.equal((await f.call('network')).status,403);assert.equal((await f.call('network','GET',null,'root')).data.subnets.length,1);
 assert.equal((await f.call('network/'+f.p.id,'POST',{message:'Make the contact action clearer.'},'root')).status,200);assert.equal((await rootGuidance(f.db,f.p.id)).length,1);assert.equal(promptFor(f.p,{rootGuidance:await rootGuidance(f.db,f.p.id)}).input.rootGuidance.length,1);
 assert.equal((await f.call('projects/'+f.p.id+'/subnet','POST',{action:'report',message:'We are waiting for the domain connection.'})).status,200);assert.match((await networkOverview(f.db))[0].manager_report,/waiting/);
 const root={reports:[{id:'reviewed-1',evaluation:{accepted:true},guidance:[{projectId:f.p.id,message:'Use concise, accessible copy.'}]},{id:'rejected-1',evaluation:{accepted:false},guidance:[{projectId:f.p.id,message:'Never deliver this.'}]}]};await deliverReviewedGuidance(f.db,root);await deliverReviewedGuidance(f.db,root);assert.equal((await rootGuidance(f.db,f.p.id)).length,2);
 assert.equal((await f.call('projects/'+f.p.id+'/subnet','POST',{action:'disconnect'})).status,200);assert.deepEqual(await rootGuidance(f.db,f.p.id),[]);assert.equal((await f.call('network/'+f.p.id,'POST',{message:'Do not send while disconnected.'},'root')).status,409);assert.equal((await f.call('projects/'+f.p.id+'/subnet','POST',{action:'connect'})).status,200);
});
test('new projects attach to Root automatically and retain an honest hosting setup state',async()=>{
 const f=await fixture();const r=await f.call('projects','POST',{requirement:'Build another business website.',hostname:'another-business.com'});assert.equal(r.status,201);assert.match(r.data.publicationWarning,/Connect your Cloudflare/);assert.equal(r.data.project.requestedDomain,'another-business.com');assert.equal((await networkOverview(f.db)).length,2);assert.equal((await f.call('projects/'+r.data.project.id+'/publication')).data.publication,null);
});
test('scoped remote reports authenticate the project and contact forms save privately with rate limits',async()=>{
 const f=await fixture();await f.configured();await f.advance();await f.advance();await f.advance();const pub=f.sqlite.prepare('SELECT * FROM project_publications').get(),key=await unseal(f.env.APP_DATA_KEY,pub.secret,'subnet:'+f.p.id);
 async function callback(action,data,secret=key,id=f.p.id){const r=await handleAPI(new Request('https://somas.test/api/subnets/'+id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':secret},body:JSON.stringify(data)}),f.env);return {status:r.status,data:await r.json()}}
 const report={hostname:pub.hostname,version:1};assert.equal((await callback('report',report,'wrong')).status,403);assert.equal((await callback('report',{...report,version:900})).status,409);assert.equal((await callback('report',report)).status,200);assert.equal((await publicationStatus(f.env,f.p.id)).status,'live');
 const inquiry={name:'A visitor',email:'visitor@example.test',message:'Please tell me more.',requestId:crypto.randomUUID(),ip:'192.0.2.2'};assert.equal((await callback('contact',inquiry)).status,200);assert.equal((await callback('contact',inquiry)).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,1);assert.equal((await f.call('projects/'+f.p.id+'/inquiries','GET',null,'bob')).status,404);
 for(let i=0;i<8;i++)assert.equal((await callback('contact',{...inquiry,requestId:crypto.randomUUID()})).status,200);assert.equal((await callback('contact',{...inquiry,requestId:crypto.randomUUID()})).status,429);
 await f.call('projects/'+f.p.id+'/subnet','POST',{action:'disconnect'});assert.equal((await callback('report',report)).status,403);
});
test('only the project owner can open its deployed team and local status stays separate from the SOMAS builder',async()=>{
 const f=await fixture();await f.configured();for(let i=0;i<4;i++)await f.advance();
 const path='projects/'+f.p.id+'/team-access';assert.equal((await f.call(path,'POST',{})).status,200);assert.equal((await f.call(path,'POST',{},'bob')).status,404);assert.equal((await f.call(path,'POST',{},'root')).status,404);assert.equal((await f.call(path,'GET')).status,405);
 const access=await f.call(path,'POST',{});assert.match(access.data.url,/^https:\/\/willow-business\.com\/team#ticket=/);assert.ok(!access.data.url.includes(token));
 const pub=f.sqlite.prepare('SELECT * FROM project_publications').get(),key=await unseal(f.env.APP_DATA_KEY,pub.secret,'subnet:'+f.p.id),report={hostname:pub.hostname,status:'queued',phase:'task',version:7,round:2};
 const response=await handleAPI(new Request('https://somas.test/api/subnets/'+f.p.id+'/team',{method:'POST',headers:{'Content-Type':'application/json','X-SOMAS-Subnet-Key':key},body:JSON.stringify(report)}),f.env);assert.equal(response.status,200);
 await syncSubnet(f.db,f.p,'alice');const network=(await networkOverview(f.db))[0];assert.equal(network.report.version,7);assert.equal(network.report.runtime,'project-service');assert.equal(JSON.parse(f.sqlite.prepare('SELECT data FROM projects WHERE id=?').get(f.p.id).data).version,1);
 assert.equal((await f.call('projects/'+f.p.id+'/control','POST',{action:'resume'})).data.error.code,'local_team_required');
 const before=f.p.reports.length;const work=await f.call('work','POST',{});assert.equal(work.data.processed,null);assert.equal(JSON.parse(f.sqlite.prepare('SELECT data FROM projects WHERE id=?').get(f.p.id).data).reports.length,before);
});
test('standalone website runs in real Workers, escapes content, reports to Root and saves a contact form without exposing keys',async t=>{
 const p=newProject('private-owner',{requirement:'PRIVATE_GOAL restaurant website'});p.site={...site,headline:'<script>alert(1)</script>'};p.version=4;p.reports=[{findings:'PRIVATE_REPORT'}];const script=standaloneWorker(p),calls=[];
 const mf=new Miniflare({modulesRoot:'/project',modules:[{type:'ESModule',path:'/project/site.mjs',contents:script},{type:'ESModule',path:'/project/ai-team.mjs',contents:standaloneTeamModule()}],durableObjects:{PROJECT_TEAM:{className:'ProjectTeam',useSQLite:true}},compatibilityDate:'2026-05-15',bindings:{PROJECT_ID:p.id,ROOT_ORIGIN:'https://root.test',SITE_HOST:'willow-business.com',SUBNET_KEY:'fixture-worker-subnet-secret'},outboundService:async req=>{calls.push({url:req.url,key:req.headers.get('X-SOMAS-Subnet-Key'),body:await req.json()});return Response.json({saved:true})}});t.after(()=>mf.dispose());
 const r=await mf.dispatchFetch('https://willow-business.com/');assert.equal(r.status,200);const html=await r.text();assert.match(html,/&lt;script&gt;/);for(const privateValue of ['PRIVATE_GOAL','PRIVATE_REPORT','private-owner','fixture-worker-subnet-secret'])assert.ok(!html.includes(privateValue));assert.match(r.headers.get('content-security-policy'),/form-action 'self'/);
 const health=await mf.dispatchFetch('https://willow-business.com/__somas/health?challenge=0123456789abcdef');const value=await health.json();assert.equal(value.proof,await proof('fixture-worker-subnet-secret','0123456789abcdef:4'));
 const data=new URLSearchParams({name:'A visitor',email:'visitor@example.test',message:'I would like to visit.'});const contact=await mf.dispatchFetch('https://willow-business.com/contact',{method:'POST',headers:{Origin:'https://willow-business.com','Content-Type':'application/x-www-form-urlencoded'},body:data.toString()});assert.equal(contact.status,200);assert.match(await contact.text(),/Message saved/);assert.ok(calls.some(c=>c.url.endsWith('/contact')&&c.key==='fixture-worker-subnet-secret'));
 const rejected=await mf.dispatchFetch('https://willow-business.com/contact',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/x-www-form-urlencoded'},body:data.toString()});assert.equal(rejected.status,403);assert.equal((await mf.dispatchFetch('https://unrelated.com/')).status,404);
});
test('Root publishing stages run in real Workers with D1 and Cloudflare multipart uploads',async t=>{
 const uploads=[],domains=[],mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('./fixtures/publishing-runtime-worker.mjs',import.meta.url)),script:await workerBundle(fileURLToPath(new URL('./fixtures/publishing-runtime-worker.mjs',import.meta.url))),compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{APP_DATA_KEY:'fixture-runtime-encryption',EMAIL_VERIFICATION_REQUIRED:'false',PRIVATE_RUNNER_ENABLED:'true'},outboundService:async req=>{
  const url=new URL(req.url);assert.equal(url.hostname,'api.cloudflare.com');assert.equal(req.headers.get('Authorization'),'Bearer '+token);let result=[];
  if(url.pathname.endsWith('/workers/subdomain'))result={subdomain:'runtime-account'};else if(req.method==='POST'&&url.pathname.endsWith('/subdomain'))result={enabled:true};else if(url.pathname.endsWith('/zones'))result=[{id:'runtime-zone',name:'willow-business.com',status:'active',account:{id:accountId}}];
  else if(url.pathname.endsWith('/domains')){if(req.method==='PUT'){const data=await req.json();result={...data,id:'runtime-domain'};domains.push(result)}else result=domains}
  else if(req.method==='PUT'){const form=await req.formData();uploads.push({metadata:JSON.parse(await form.get('metadata').text()),script:await form.get('site.mjs').text()});result={id:'runtime-upload'}}
  return Response.json({success:true,result});
 }});t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 async function call(path,data){const r=await mf.dispatchFetch('https://somas.test/api/'+path,{method:'POST',headers:{Origin:'https://somas.test','Content-Type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()}}
 await db.prepare('INSERT INTO accounts(owner,secret,models,manager_model,worker_model) VALUES(?,?,?,?,?)').bind('alice',await seal('fixture-runtime-encryption','fixture-ai-key-private','alice'),'["fixture-model"]','fixture-model','fixture-model').run();
 assert.equal((await call('hosting',{accountId,token})).status,200);const created=await call('projects',{requirement:'Build a seasonal restaurant website.',autoImprove:false});assert.equal(created.status,201);const p=created.data.project;p.site=site;p.version=1;p.running=false;p.status='complete';await db.prepare('UPDATE projects SET data=? WHERE id=?').bind(JSON.stringify(p),p.id).run();
 assert.equal((await call('projects/'+p.id+'/publication',{hostname:'willow-business.com'})).status,200);for(let i=0;i<3;i++)assert.equal((await call('work',{})).status,200);
 assert.equal(uploads.length,1);assert.equal(uploads[0].metadata.main_module,'site.mjs');assert.match(uploads[0].script,/Willow Table/);assert.equal(domains[0].hostname,'willow-business.com');assert.equal((await db.prepare('SELECT status FROM project_publications').first()).status,'domain_pending');
 const pending=await call('projects',{requirement:'Build another restaurant website.',autoImprove:false});assert.equal(pending.status,201);const intent=await db.prepare('SELECT status,hostname FROM publication_intents WHERE project_id=?').bind(pending.data.project.id).first();assert.equal(intent.status,'needs_domain');assert.equal(intent.hostname,'');assert.equal(uploads.length,1);
 assert.equal(uploads[0].metadata.bindings.find(b=>b.name==='PROJECT_TEAM').class_name,'ProjectTeam');assert.equal(uploads[0].metadata.bindings.find(b=>b.name==='TEAM_API_KEY').type,'secret_text');assert.equal((await db.prepare('SELECT team_runtime FROM project_publications').first()).team_runtime,1);

});
