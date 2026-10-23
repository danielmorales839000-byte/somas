import {runTeamStep} from './ai-team/project-runtime.mjs';
import {publicationIntent,requestPublication,preparePublicationIntent,checkNewDomain,ADDRESS_MODES} from './hosting-setup.mjs';
import {syncSubnet,subnetMessages,sendSubnetMessage,rootGuidance,networkOverview,deliverReviewedGuidance,ROOT_ID} from './subnets.mjs';
import {hostingStatus,connectHosting,publicationStatus,configurePublication,publishOne,subnetCallback,rootDomain,projectTeamAccess} from './publishing.mjs';
import {emailAuthEndpoint,emailSessionRequest} from './email-auth.mjs';
import {gmailAuthEndpoint,gmailSettings,saveGmailSettings} from './gmail-auth.mjs';
import {ownerIdentity,verificationAddress,emailEnvironment,saveEmailSender,OWNER_EMAIL,opinionEmailDraft,profile,isVerified,verificationRequired,ownerAccount,managerAccount,mailReady,sendVerification,verifyEmail,requestManager,decideManager,recordActivity,enqueueMail,deliverMail,drainMail} from './membership.mjs';
import {pricingConfig} from './telemetry.mjs';
import {SERVICE_DEFAULTS,operationalGuide,validateServiceConfig,newRoot,servicePrompt,validateRootPlan,validateRootReport,applyRootReview} from './service.mjs';
import {AppError,ROLES,text,log,newProject,publicProject,projectKind,validateSite} from './domain.mjs';
import {modelCatalog,chooseModels,seal,unseal,providerConfig,PROVIDERS} from './provider.mjs';
const json=(x,status=200,extra={})=>Response.json(x,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
const changed=r=>(r.meta?.changes??r.changes??0)>0;
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))throw new AppError('JSON is required.',415);const raw=await req.text();if(raw.length>18000)throw new AppError('Request is too large.',413);try{return JSON.parse(raw)}catch{throw new AppError('Invalid JSON.')}}
async function owned(db,id,owner){const row=await db.prepare('SELECT * FROM projects WHERE id=? AND owner=?').bind(id,owner).first();if(!row)throw new AppError('Project not found.',404);return row}
async function persist(db,row,p,lease){p.updatedAt=Date.now();while(JSON.stringify(p).length>300000){if(p.history.length>12)p.history.shift();else if(p.reports.length>10){const index=p.reports.findIndex(r=>r.id!==p.pendingReport);if(index<0)break;p.reports.splice(index,1)}else if(p.releases.length>3)p.releases.shift();else break}if(JSON.stringify(p).length>350000)throw new AppError('Project storage limit reached.',413);const r=await db.prepare('UPDATE projects SET data=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=? AND lease=?').bind(JSON.stringify(p),p.updatedAt,row.id,row.owner,row.revision,lease).run();if(!changed(r))throw new AppError('Project changed. Refresh and try again.',409);row.revision++;if(p.scope==='service')await deliverReviewedGuidance(db,p);else await syncSubnet(db,p,row.owner)}
async function locked(db,id,owner,fn){const token=crypto.randomUUID(),now=Date.now();await owned(db,id,owner);const r=await db.prepare('UPDATE projects SET lease=?,lease_until=? WHERE id=? AND owner=? AND lease_until<?').bind(token,now+90000,id,owner,now).run();if(!changed(r))throw new AppError('A task is already in progress.',409,'busy');const row=await owned(db,id,owner);try{return await fn(row,JSON.parse(row.data),token)}finally{await db.prepare('UPDATE projects SET lease=NULL,lease_until=0 WHERE id=? AND owner=? AND lease=?').bind(id,owner,token).run()}}
async function ensureRoot(db,env){if(!env.SOMAS_ADMIN_USER_ID)return null;const p=newRoot(env.SOMAS_ADMIN_USER_ID);p.id='somas-service-root';await db.prepare('INSERT OR IGNORE INTO projects(id,owner,data,revision,paused,lease,lease_until,updated) VALUES(?,?,?,0,0,NULL,0,?)').bind(p.id,p.owner,JSON.stringify(p),Date.now()).run();await db.prepare('INSERT OR IGNORE INTO service(id,project_id) VALUES(?,?)').bind('root',p.id).run();const row=await owned(db,p.id,env.SOMAS_ADMIN_USER_ID);const current=JSON.parse(row.data);if(operationalGuide(current.serviceConfig?.guide)&&row.lease_until<Date.now()){try{await locked(db,p.id,env.SOMAS_ADMIN_USER_ID,async(r,p,t)=>{if(!operationalGuide(p.serviceConfig?.guide))return;p.serviceConfig={...p.serviceConfig,headline:SERVICE_DEFAULTS.headline,guide:SERVICE_DEFAULTS.guide};p.version++;p.releases=[...p.releases,{version:p.version,config:structuredClone(p.serviceConfig),at:Date.now(),summary:'Runtime guard restored user-facing dashboard and Guide copy.'}].slice(-12);log(p,'Runtime','Restored user guidance; retained the reviewed provider call spacing.');await persist(db,r,p,t)})}catch(err){if(err.code!=='busy')throw err}return owned(db,p.id,env.SOMAS_ADMIN_USER_ID)}return row}
async function serviceConfig(db){const row=await db.prepare('SELECT p.data FROM projects p JOIN service s ON p.id=s.project_id WHERE s.id=?').bind('root').first();return row?JSON.parse(row.data).serviceConfig:SERVICE_DEFAULTS}
async function serviceEvidence(db,env){const rows=(await db.prepare('SELECT id,data,paused,lease_until FROM projects').all()).results.filter(r=>JSON.parse(r.data).scope!=='service');const opinions=(await db.prepare('SELECT id,message,created FROM opinions ORDER BY created DESC LIMIT 12').all()).results;return {at:Date.now(),database:true,encryptionConfigured:!!env.APP_DATA_KEY,subnets:(await networkOverview(db)).slice(0,30),projects:rows.map(r=>{const p=JSON.parse(r.data);return {id:r.id,status:r.paused?'paused':p.status,error:p.error,phase:p.phase,version:p.version,nextAt:p.nextAt,round:p.cycle+1}}),opinions,tools:['Update dashboard headline','Update Guide copy','Adjust model call spacing from 5 to 60 seconds','Send reviewed advisory guidance to connected Subnet Managers'],unavailable:['Edit source code','Run arbitrary tests','Deploy code','Change access or credentials']}}
function isAdmin(owner,env){return owner===env.actorManagerId||(!verificationRequired(env)&&!!env.SOMAS_ADMIN_USER_ID&&owner===env.SOMAS_ADMIN_USER_ID)}
function requireAdmin(owner,env){if(!isAdmin(owner,env))throw new AppError('Administrator access is required.',403,'admin_required')}
async function runStep(db,env,row,p,token,fetcher){if(p.scope!=='service'&&(await db.prepare('SELECT team_runtime FROM project_publications WHERE project_id=?').bind(p.id).first())?.team_runtime)return p;return runTeamStep(db,env,row,p,token,fetcher,{persist,serviceConfig,serviceEvidence,rootGuidance,recordActivity})}
async function handleAPIInternal(req,env,deps={}){try{env=await emailEnvironment(env);const url=new URL(req.url),parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean),db=env.DB;
 if(parts[0]==='share-event'){if(req.method!=='POST')throw new AppError('Method not allowed.',405);if(req.headers.get('origin')!==url.origin)throw new AppError('Request origin was rejected.',403);const input=await body(req),platform=input.platform||'';if(!['','facebook','x','linkedin','whatsapp','telegram','reddit','instagram','youtube'].includes(platform))throw new AppError('Unknown share platform.',400);const actor=req.headers.get('oai-authenticated-user-id');if(!actor||!db)return json({recorded:false});const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(actor).first();if(!user||user.status!=='active'||!isVerified(user,env))return json({recorded:false});const action=platform?'share.open':'page.view',resource=platform||'share',recent=await db.prepare('SELECT created FROM activity WHERE actor=? AND action=? AND resource=? ORDER BY created DESC LIMIT 1').bind(actor,action,resource).first();if(!recent||recent.created<Date.now()-5000)await recordActivity(db,actor,action,resource);return json({recorded:true})}
 if(parts[0]==='subnets'&&parts.length===3)return json(await subnetCallback(req,env,decodeURIComponent(parts[1]),parts[2],await body(req)));
 if(parts[0]==='runner')return await handleRunner(req,env,deps);
 if(parts[0]==='service'&&req.method==='GET')return json({config:db?await serviceConfig(db):SERVICE_DEFAULTS});
 if(parts[0]==='health')return json({service:'somas',database:!!db,encryption:!!env.APP_DATA_KEY});
 if(parts[0]==='auth'&&parts[1]==='options'&&req.method==='GET')return json({email:{configured:mailReady(env)}});
 const owner=req.headers.get('oai-authenticated-user-id');if(!owner)throw new AppError('Sign in with your email to open your workspace.',401,'sign_in_required');if(!db)throw new AppError('Database is not connected.',503,'storage_unavailable');
 if(req.method!=='GET'&&req.headers.get('origin')!==url.origin)throw new AppError('Request origin was rejected.',403,'origin_rejected');
 const member=await profile(req,env);
 env={...env,mailFetcher:deps.mailFetcher||fetch,actorManagerId:managerAccount(member,env)?owner:null};
 if(member.status!=='active'&&parts[0]!=='me')throw new AppError('Your account is suspended. Contact the owner.',403,'account_suspended');
 if(parts[0]==='me'){if(req.method!=='GET')throw new AppError('Method not allowed.',405);const account=await db.prepare('SELECT models,manager_model,worker_model,provider,pricing FROM accounts WHERE owner=?').bind(owner).first(),verification=await db.prepare("SELECT id,expires FROM verification_challenges WHERE actor=? AND purpose='verify_email' AND consumed=0 AND expires>? AND attempts<5 ORDER BY created DESC LIMIT 1").bind(owner,Date.now()).first();return json({verification,signedIn:true,authMethod:env.authMethod||'chatgpt',isAdmin:isAdmin(owner,env),isOwner:ownerAccount(member,env),emailVerified:!!(member.email_verified_at&&member.verified_email===verificationAddress(member,env)),accountVerified:isVerified(member,env),verificationRequired:verificationRequired(env),canConfigureEmail:ownerIdentity(member,env),verificationEmail:verificationAddress(member,env),mailConfigured:mailReady(env),status:member.status,user:{id:owner,name:member.name,email:member.email},connected:!!account,models:account?JSON.parse(account.models):[],managerModel:account?.manager_model||'',workerModel:account?.worker_model||'',provider:account?.provider||'groq',providers:Object.entries(PROVIDERS).map(([id,p])=>({id,name:p.name,keys:p.keys})),pricing:JSON.parse(account?.pricing||'{"mode":"unknown"}'),encryptionReady:!!env.APP_DATA_KEY})}
 if(parts[0]==='email-setup'){
  if(!ownerIdentity(member,env))throw new AppError('Only the configured site owner can connect email.',403,'owner_required');
  if(parts[1]==='google'){if(req.method==='GET')return json(await gmailSettings(env,url.origin));if(req.method!=='POST')throw new AppError('Method not allowed.',405);return json(await saveGmailSettings(env,url.origin,{...await body(req),provider:'google'}))}
  if(parts.length!==1)throw new AppError('Not found.',404);
  if(req.method==='GET'){const config=await gmailSettings(env,url.origin),last=await db.prepare('SELECT status,last_error,created FROM mail_outbox ORDER BY created DESC LIMIT 1').first();return json({configured:mailReady(env),provider:env.GMAIL_SENDER?'gmail':'resend',from:env.MAIL_FROM||'',managed:mailReady(env)&&env.emailSenderSource!=='connection',verificationEmail:verificationAddress(member,env),googleConfigured:config.providers[0].configured,googleClientId:config.providers[0].clientId,googleManaged:config.providers[0].managed,lastDelivery:last||null})}
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);
  return json(await saveEmailSender(member,env,await body(req)));
 }
 if(parts[0]==='signin-setup')throw new AppError('Social sign-in has been removed. Use email delivery settings.',410,'social_signin_removed');
 if(parts[0]==='auth'){
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);
  if(parts[1]==='send-verification')return json(await sendVerification(member,env));
  if(parts[1]==='verify-email')return json(await verifyEmail(member,env,await body(req)));
  throw new AppError('Not found.',404);
 }
 if(!isVerified(member,env))throw new AppError('Verify your email before using your workspace.',403,'email_verification_required');
 if(parts[0]==='hosting'){
  if(parts[1]==='domain-check'){if(req.method!=='POST')throw new AppError('Method not allowed.',405);return json(await checkNewDomain(env,owner,url.origin,await body(req),deps.hostingFetcher||fetch))}
  if(parts.length!==1)throw new AppError('Not found.',404);if(req.method==='GET')return json(await hostingStatus(env,owner));if(req.method!=='POST')throw new AppError('Method not allowed.',405);
  const connected=await connectHosting(env,owner,await body(req),deps.hostingFetcher||fetch);await db.prepare("UPDATE publication_intents SET status='queued',next_at=0,last_error='' WHERE owner=? AND status IN ('awaiting_hosting','needs_attention','blocked')").bind(owner).run();return json(connected);
 }
 if(parts[0]==='network'){
  requireAdmin(owner,env);
  if(!parts[1]&&req.method==='GET')return json({rootId:ROOT_ID,subnets:await networkOverview(db)});
  const subnetId=decodeURIComponent(parts[1]||''),link=await db.prepare('SELECT project_id FROM subnet_links WHERE project_id=?').bind(subnetId).first();if(!link)throw new AppError('Subnet not found.',404);
  if(req.method==='GET')return json({messages:await subnetMessages(db,subnetId)});
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);await sendSubnetMessage(db,subnetId,'root_to_subnet',(await body(req)).message);return json({saved:true});
 }
 if(parts[0]==='manager-request'){
  if(req.method==='GET'){const row=await db.prepare('SELECT id,status,created FROM manager_requests WHERE applicant=? ORDER BY created DESC LIMIT 1').bind(owner).first();return json({request:row})}
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);return json(await requestManager(member,env,await body(req)),201);
 }
 if(parts[0]==='activity'){
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),allowed=['dashboard','new','connect','opinions','root','users','activity','manager','approvals','business','team','share','hosting','network','publication'];
  if(!allowed.includes(input.screen))throw new AppError('Unknown activity.',400);
  const platforms=['facebook','x','linkedin','whatsapp','telegram','reddit','instagram','youtube'];if(input.platform&&!platforms.includes(input.platform))throw new AppError('Unknown share platform.',400);if(input.projectId){if(typeof input.projectId!=='string'||input.projectId.length>100)throw new AppError('Invalid project.',400);if(!isAdmin(owner,env))await owned(db,input.projectId,owner)}const action=input.platform?'share.open':'page.view',resource=input.platform||input.screen+(input.projectId?':'+input.projectId:'');const recent=await db.prepare('SELECT created FROM activity WHERE actor=? AND action=? AND resource=? ORDER BY created DESC LIMIT 1').bind(owner,action,resource).first();if(!recent||recent.created<Date.now()-5000)await recordActivity(db,owner,action,resource);return json({saved:true});
 }
 if(parts[0]==='work'){if(req.method!=='POST')throw new AppError('Method not allowed.',405);return await handleRunner(req,env,{...deps,onlyOwner:owner})}
 if(parts[0]==='root'){requireAdmin(owner,env);if(req.method!=='GET')throw new AppError('Method not allowed.',405);const row=await ensureRoot(db,env);return json({project:{...publicProject(row),readOnly:row.owner!==owner}})}
 if(parts[0]==='opinions'){if(req.method==='GET'){const rows=isAdmin(owner,env)?await db.prepare('SELECT o.id,o.message,o.created,u.name FROM opinions o LEFT JOIN users u ON o.owner=u.id ORDER BY o.created DESC LIMIT 100').all():await db.prepare('SELECT id,message,created FROM opinions WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner).all();return json({opinions:rows.results})}if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),opinionId=crypto.randomUUID(),message=text(input.message,2000,3);const recent=await db.prepare('SELECT created FROM opinions WHERE owner=? ORDER BY created DESC LIMIT 1').bind(owner).first();if(recent&&recent.created>Date.now()-10000)throw new AppError('Please wait before sending another opinion.',429);await db.prepare('INSERT INTO opinions(id,owner,message,created) VALUES(?,?,?,?)').bind(opinionId,owner,message,Date.now()).run();const mail=await enqueueMail(env,{id:'opinion-'+opinionId,to:OWNER_EMAIL,replyTo:member.verified_email||undefined,kind:'opinion',subject:'New SOMAS opinion',text:'From: '+member.name+'\nUser ID: '+owner+'\n\n'+message});const delivery=mail.id?await deliverMail(env,mail.id,env.mailFetcher):{status:mail.status};return json({saved:true,notification:delivery.status,emailDraft:opinionEmailDraft({...member,email:member.verified_email||member.email},message)},201)}
 if(parts[0]==='admin'){requireAdmin(owner,env);const adminResponse=await membershipAdmin(req,env,member,parts,deps);if(adminResponse)return adminResponse;if(req.method!=='GET')throw new AppError('Method not allowed.',405);if(parts[1]!=='users')throw new AppError('Not found.',404);const rows=(await db.prepare('SELECT * FROM projects ORDER BY updated DESC').all()).results.filter(r=>JSON.parse(r.data).scope!=='service');if(parts[2]){parts[2]=decodeURIComponent(parts[2]);if(parts[3]!=='projects')throw new AppError('Not found.',404);const profile=await db.prepare('SELECT * FROM users WHERE id=?').bind(parts[2]).first();const matches=rows.filter(r=>r.owner===parts[2]);if(!profile&&!matches.length)throw new AppError('User not found.',404);return json({user:profile||{id:parts[2],name:'Existing user',email:''},projects:matches.map(r=>{const p=publicProject(r);return {id:p.id,name:p.name,requirement:p.requirement,status:p.status,version:p.version,cycle:p.cycle,running:p.running}})})}const profiles=(await db.prepare('SELECT * FROM users ORDER BY last_seen DESC').all()).results,connections=(await db.prepare('SELECT owner FROM accounts').all()).results,hosting=(await db.prepare('SELECT owner,account_id,workers_subdomain,updated FROM hosting_connections').all()).results,details=(await db.prepare('SELECT * FROM user_details').all()).results;const ids=new Set([...profiles.map(u=>u.id),...rows.map(r=>r.owner),...connections.map(a=>a.owner)]);return json({users:[...ids].map(id=>({...(profiles.find(u=>u.id===id)||{id,name:'Existing user',email:'',joined:null,last_seen:null}),role:id===env.SOMAS_ADMIN_USER_ID?'Owner':(profiles.find(u=>u.id===id)?.role==='manager'?'Manager':'User'),connected:connections.some(a=>a.owner===id),hosting:hosting.find(h=>h.owner===id)||null,details:details.find(d=>d.owner===id)||null,projects:rows.filter(r=>r.owner===id).length}))})}

 if(parts[0]==='settings'){
 if(req.method==='DELETE'){await db.prepare('DELETE FROM accounts WHERE owner=?').bind(owner).run();return json({connected:false})}
 if(req.method!=='POST')throw new AppError('Method not allowed.',405);
 const input=await body(req),account=await db.prepare('SELECT * FROM accounts WHERE owner=?').bind(owner).first(),provider=input.provider||account?.provider||'groq';providerConfig(provider);
 const switched=!!account&&provider!==account.provider;let secret=account?.secret,models=account?JSON.parse(account.models):[];
 if(switched&&!input.key)throw new AppError('Enter a key for the selected provider. The previous key cannot be sent to a different provider.');
 if(input.key){const key=text(input.key,1000,10);models=await modelCatalog(key,deps.fetcher,provider);secret=await seal(env.APP_DATA_KEY,key,owner)}
 if(!secret)throw new AppError('Enter your selected provider’s API key.');
 const defaults=chooseModels(models,provider),manager=input.managerModel||(!input.key&&!switched?account?.manager_model:null)||defaults.manager,worker=input.workerModel||(!input.key&&!switched?account?.worker_model:null)||defaults.worker;
 if(!models.includes(manager)||!models.includes(worker))throw new AppError('Choose models available to your key.');
 const changedModels=!!account&&(manager!==account.manager_model||worker!==account.worker_model),pricing=pricingConfig(input.pricing??(!switched&&!changedModels?JSON.parse(account?.pricing||'{"mode":"unknown"}'):null));
 await db.prepare('INSERT INTO accounts(owner,secret,models,manager_model,worker_model,next_call,provider,pricing) VALUES(?,?,?,?,?,0,?,?) ON CONFLICT(owner) DO UPDATE SET secret=excluded.secret,models=excluded.models,manager_model=excluded.manager_model,worker_model=excluded.worker_model,provider=excluded.provider,pricing=excluded.pricing,next_call=0').bind(owner,secret,JSON.stringify(models),manager,worker,provider,JSON.stringify(pricing)).run();
 if(input.key||switched||changedModels){
 const rows=(await db.prepare('SELECT * FROM projects WHERE owner=? ORDER BY updated ASC LIMIT 100').bind(owner).all()).results;
 for(const row of rows){const member=await db.prepare('SELECT * FROM users WHERE id=?').bind(row.owner).first();if(member?.status==='suspended'||verificationRequired(env)&&(!member||!isVerified(member,env)))continue;const p=JSON.parse(row.data);if(row.paused||!['setup_required','provider_auth','credential_unavailable','provider_configuration','provider_quota'].includes(p.error?.code))continue;
 try{await locked(db,row.id,owner,async(r,p,t)=>{p.running=true;p.nextAt=0;p.status='queued';p.error=null;for(const a of p.agents)a.state='resting';log(p,'Runtime','Provider connection updated. Saved work queued for retry.');await persist(db,r,p,t)})}catch(err){if(err.code!=='busy')throw err}
 }
 }
 return json({connected:true,provider,models,managerModel:manager,workerModel:worker,pricing})}
 if(parts[0]!=='projects')throw new AppError('Not found.',404);
 if(!parts[1]){if(req.method==='GET'){const x=await db.prepare('SELECT * FROM projects WHERE owner=? ORDER BY updated DESC LIMIT 30').bind(owner).all();return json({projects:x.results.filter(r=>JSON.parse(r.data).scope!=='service').map(publicProject)})}if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req);const p=newProject(owner,input);p.addressMode=input.addressMode||(input.hostname?'existing_domain':'new_domain');if(!ADDRESS_MODES.includes(p.addressMode))throw new AppError('Choose a website address type.');if(input.hostname&&p.addressMode!=='workers_dev')p.requestedDomain=rootDomain(input.hostname,url.origin);const account=await db.prepare('SELECT owner FROM accounts WHERE owner=?').bind(owner).first();if(!account){p.running=false;p.status='setup';p.error={message:'Connect your chosen API provider to start.',code:'setup_required'}}await db.prepare('INSERT INTO projects(id,owner,data,revision,paused,lease,lease_until,updated) VALUES(?,?,?,0,0,NULL,0,?)').bind(p.id,owner,JSON.stringify(p),Date.now()).run();await syncSubnet(db,p,owner);let publicationWarning='';if(projectKind(p)!=='chatroom'){try{await requestPublication(env,p,owner,url.origin,{mode:p.addressMode,hostname:p.requestedDomain||'',autoPublish:input.autoPublish!==false});if(!(await hostingStatus(env,owner)).connected)publicationWarning='Connect your Cloudflare account in the guided Hosting setup. Your project and address choice are saved.'}catch(err){publicationWarning=err instanceof AppError?err.message:'Open Publish & network to finish website setup.'}}return json({project:publicProject(await owned(db,p.id,owner)),publicationWarning},201)}
 const id=decodeURIComponent(parts[1]),action=parts[2];let row;if(!action&&req.method==='GET'&&isAdmin(owner,env)){row=await db.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();if(!row)throw new AppError('Project not found.',404)}else row=await owned(db,id,owner);if(!action&&req.method==='GET')return json({project:{...publicProject(row),publication:JSON.parse(row.data).scope==='service'?null:await publicationStatus(env,row.id),readOnly:row.owner!==owner}});
 if(action==='team-access'){if(req.method!=='POST')throw new AppError('Method not allowed.',405);return json(await projectTeamAccess(env,id,owner))}
 if(action==='publication'){
  const p=JSON.parse(row.data);if(p.scope==='service')throw new AppError('Root service is not a project publication.',400);
  await syncSubnet(db,p,owner);
  if(req.method==='POST'){const input=await body(req);if(input.action==='publish'){const task=await db.prepare('SELECT project_id,lease_until FROM project_publications WHERE project_id=?').bind(id).first();if(!task)throw new AppError('Connect a root domain first.',409);if(task.lease_until>Date.now())throw new AppError('Publication is already in progress.',409);if(!p.site)throw new AppError('The Subnet Manager must approve a website revision first.',409);await db.prepare("UPDATE project_publications SET status='queued',publish_stage='preflight',desired_version=?,attempts=0,next_at=0,last_error='' WHERE project_id=?").bind(p.version,id).run()}else if(input.mode){await requestPublication(env,p,owner,url.origin,input)}else{await configurePublication(env,p,owner,url.origin,input,deps.hostingFetcher||fetch);await db.prepare("UPDATE publication_intents SET status='configured',last_error='' WHERE project_id=?").bind(id).run()}
  }else if(req.method!=='GET')throw new AppError('Method not allowed.',405);
  return json({intent:await publicationIntent(env,id),publication:await publicationStatus(env,id),hosting:await hostingStatus(env,owner),rootId:ROOT_ID,link:await db.prepare('SELECT connected,last_report,updated FROM subnet_links WHERE project_id=?').bind(id).first(),messages:await subnetMessages(db,id)});
 }
 if(action==='subnet'){
  if(JSON.parse(row.data).scope==='service')throw new AppError('Root is not a subnet.',400);await syncSubnet(db,JSON.parse(row.data),owner);
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req);
  if(input.action==='connect'||input.action==='disconnect')await db.prepare('UPDATE subnet_links SET connected=?,updated=? WHERE project_id=?').bind(input.action==='connect'?1:0,Date.now(),id).run();
  else if(input.action==='report')await sendSubnetMessage(db,id,'subnet_to_root',input.message);else throw new AppError('Unknown network action.');return json({saved:true});
 }
 if(action==='messages'){const p=JSON.parse(row.data);if(projectKind(p)!=='chatroom')throw new AppError('Messaging is available for chatroom projects.',400);if(req.method==='GET'){const x=await db.prepare('SELECT id,name,message,created FROM messages WHERE project_id=? AND owner=? ORDER BY created DESC,id DESC LIMIT 100').bind(id,owner).all();return json({messages:x.results.reverse()})}if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),name=text(input.name,40,1),message=text(input.message,1500,1);await db.prepare('INSERT INTO messages(id,project_id,owner,name,message,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,owner,name,message,Date.now()).run();return json({saved:true},201)}
 if(action==='inquiries'){if(req.method==='GET'){const x=await db.prepare('SELECT id,name,email,message,created FROM submissions WHERE project_id=? AND owner=? ORDER BY created DESC LIMIT 50').bind(id,owner).all();return json({inquiries:x.results})}if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),name=text(input.name,100,1),email=text(input.email,200,3),message=text(input.message,1500,3);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid email.');await db.prepare('INSERT INTO submissions(id,project_id,owner,name,email,message,created) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,owner,name,email,message,Date.now()).run();return json({saved:true},201)}
 if(req.method!=='POST')throw new AppError('Method not allowed.',405);
 if(action==='control'){if((await publicationStatus(env,id))?.team_runtime)throw new AppError('Open the AI team on your project domain to control it.',409,'local_team_required');const input=await body(req);if(input.action==='pause'){await db.prepare('UPDATE projects SET paused=1 WHERE id=? AND owner=?').bind(id,owner).run();return json({project:publicProject(await owned(db,id,owner))})}if(input.action!=='resume'&&input.action!=='goal')throw new AppError('Unknown action.');await locked(db,id,owner,async(r,p,t)=>{if(input.action==='goal'){p.requirement=text(input.goal,1600,8);p.goal=p.requirement;p.phase='plan';p.tasks=[];p.pendingReport=null;p.cycle=0;log(p,'Manager','New goal received.')}else if(p.status==='complete'){p.phase='plan';p.goal=p.requirement+' Improve the current website using reports.';p.cycle=0;}p.running=true;p.nextAt=0;p.error=null;p.status='queued';for(const a of p.agents)a.state='resting';await persist(db,r,p,t)});await db.prepare('UPDATE projects SET paused=0 WHERE id=? AND owner=?').bind(id,owner).run();}
 else if(action==='step'){const work=locked(db,id,owner,(r,p,t)=>runStep(db,env,r,p,t,deps.fetcher));if(deps.defer)deps.defer(work.catch(()=>{}));else await work;}
 else if(action==='layout'){const input=await body(req);await locked(db,id,owner,async(r,p,t)=>{if(input.reset)p.layout={};else{if(!Object.hasOwn(ROLES,input.agent)||!Number.isFinite(input.x)||!Number.isFinite(input.y))throw new AppError('Invalid layout.');p.layout[input.agent]={x:Math.max(10,Math.min(90,input.x)),y:Math.max(17,Math.min(82,input.y))}}await persist(db,r,p,t)})}
 else if(action==='rollback'){const input=await body(req);await locked(db,id,owner,async(r,p,t)=>{const release=p.releases.find(v=>v.version===input.version);if(!release)throw new AppError('Revision not found.',404);if(p.scope==='service')p.serviceConfig=validateServiceConfig(release.config);else{p.site=validateSite(release.site);p.name=p.site.name}p.version++;p.running=false;p.runnerVersion=2;p.status='complete';p.error=null;p.nextAt=0;p.releases=[...p.releases,{version:p.version,...(p.scope==='service'?{config:structuredClone(p.serviceConfig)}:{site:structuredClone(p.site)}),at:Date.now(),summary:'Owner restored v'+release.version}].slice(-12);for(const a of p.agents)a.state='resting';log(p,'You','Restored v'+release.version+' as v'+p.version+'.');await persist(db,r,p,t)})}
 else throw new AppError('Not found.',404);
 return json({project:publicProject(await owned(db,id,owner))});
 }catch(err){const x=err instanceof AppError?err:new AppError('The server could not complete the request.',500,'server_error');return json({error:{message:x.message,code:x.code,retryAfter:x.retryAfter}},x.status,x.retryAfter?{'Retry-After':String(x.retryAfter)}:{})}}

// Global runner requires the configured administrator or an explicit service credential.
// Sites consumes its dispatch header; the separate app header is validated here.
// The authenticated /work route sets onlyOwner server-side; clients cannot select it.
export async function handleRunner(req,env,deps={}){
 if(env.PRIVATE_RUNNER_ENABLED!=='true')throw new AppError('Background runner is disabled.',403);
 const runnerActor=req.headers.get('oai-authenticated-user-id');if(runnerActor&&env.DB){const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(runnerActor).first();if(managerAccount(user,env))env={...env,actorManagerId:runnerActor}}
 const supplied=req.headers.get('X-SOMAS-Runner-Authorization');if(!deps.onlyOwner&&!isAdmin(req.headers.get('oai-authenticated-user-id'),env)&&(!env.SOMAS_RUNNER_TOKEN||!supplied||supplied!==env.SOMAS_RUNNER_TOKEN))throw new AppError('Runner authorization is required.',403,'runner_auth_required');
 const db=env.DB;if(!db)throw new AppError('Storage is unavailable.',503);
 if(req.method!=='GET'&&req.method!=='POST')throw new AppError('Method not allowed.',405);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new AppError('Request origin was rejected.',403);
 if(!deps.onlyOwner||isAdmin(deps.onlyOwner,env))await ensureRoot(db,env);
 await drainMail(env,deps.mailFetcher||fetch);
 const rows=(deps.onlyOwner?await db.prepare('SELECT * FROM projects WHERE owner=? ORDER BY updated ASC LIMIT 100').bind(deps.onlyOwner).all():await db.prepare('SELECT * FROM projects ORDER BY updated ASC LIMIT 100').all()).results;
 const summary=r=>{const p=JSON.parse(r.data);return {id:r.id,name:p.name,scope:p.scope||'project',status:r.paused?'paused':p.status,phase:p.phase,running:p.running&&!r.paused,continuous:p.autoImprove,round:p.cycle+1,version:p.version,calls:p.calls||0,reports:p.reports.length,lessons:p.agents[0].memory.length,memoryVersion:p.agents[0].memoryVersion,nextAt:p.nextAt,error:p.error,busy:r.lease_until>Date.now(),history:p.history.slice(-3),runnerVersion:p.runnerVersion||0}};
 if(req.method==='GET'){const publications=(deps.onlyOwner?await db.prepare('SELECT project_id,hostname,status,publish_stage,desired_version,published_version,next_at,lease_until FROM project_publications WHERE owner=? LIMIT 100').bind(deps.onlyOwner).all():await db.prepare('SELECT project_id,hostname,status,publish_stage,desired_version,published_version,next_at,lease_until FROM project_publications LIMIT 100').all()).results;const setups=(deps.onlyOwner?await db.prepare('SELECT project_id,status,next_at,last_error FROM publication_intents WHERE owner=? LIMIT 100').bind(deps.onlyOwner).all():await db.prepare('SELECT project_id,status,next_at,last_error FROM publication_intents LIMIT 100').all()).results;return json({projects:rows.map(summary),publications,setups})}
 const setup=await preparePublicationIntent(env,deps.hostingFetcher||fetch,{owner:deps.onlyOwner});if(setup)return json({processed:setup,kind:'hosting_setup',intent:await publicationIntent(env,setup)});
 const publication=await publishOne(env,deps.hostingFetcher||fetch,{owner:deps.onlyOwner});if(publication)return json({processed:publication,kind:'publication',publication:await publicationStatus(env,publication),project:summary(await db.prepare('SELECT * FROM projects WHERE id=?').bind(publication).first())});
 // One provider call per request: short, restartable jobs with durable checkpoints.
 for(const row of rows){if((await db.prepare('SELECT team_runtime FROM project_publications WHERE project_id=?').bind(row.id).first())?.team_runtime)continue;const member=await db.prepare('SELECT * FROM users WHERE id=?').bind(row.owner).first();if(member?.status==='suspended'||verificationRequired(env)&&(!member||!isVerified(member,env)))continue;const p=JSON.parse(row.data);if(row.paused||row.lease_until>Date.now())continue;
 const formatRecovery=p.autoImprove&&p.error?.code==='provider_configuration'&&p.error?.message?.includes('json_validate_failed');
 const recover=formatRecovery||p.runnerVersion!==2&&p.autoImprove&&!p.releases.at(-1)?.summary?.startsWith('Owner restored')&&!['setup','provider_auth','credential_unavailable','provider_configuration','setup_required'].includes(p.error?.code)&&p.status!=='setup';
 if(!recover&&(!p.running||p.nextAt>Date.now()))continue;
 try{await locked(db,row.id,row.owner,async(r,p,t)=>{if(recover){p.runnerVersion=2;p.running=true;p.error=null;p.nextAt=0;for(const a of p.agents)a.state='resting';if(p.status==='complete'){p.phase='plan';p.goal=p.requirement+' Improve the current website using accepted reports.'}if(p.phase==='review'&&p.reports.find(x=>x.id===p.pendingReport)?.evaluation){p.pendingReport=null;p.phase='plan'}p.status='queued';log(p,'Manager','Continuous work enabled. Resuming the saved task.');await persist(db,r,p,t)}await runStep(db,env,r,p,t,deps.fetcher)});return json({processed:row.id,project:summary(await owned(db,row.id,row.owner))})}catch(err){if(err.code==='busy')continue;throw err}
 }
 return json({processed:null,projects:rows.map(summary)});
}

async function membershipAdmin(req,env,member,parts,deps){
 const db=env.DB,url=new URL(req.url),target=parts[2]&&decodeURIComponent(parts[2]);
 if(parts[1]==='manager-requests'){
  if(!ownerAccount(member,env))throw new AppError('Only the verified owner can review manager requests.',403,'owner_required');
  if(req.method==='GET'&&!target){const rows=await db.prepare('SELECT r.id,r.applicant,r.reason,r.status,r.created,r.reviewed,u.name,u.email,c.expires FROM manager_requests r JOIN users u ON u.id=r.applicant JOIN verification_challenges c ON c.id=r.challenge_id ORDER BY r.created DESC LIMIT 100').all();return json({requests:rows.results})}
  if(req.method==='POST'&&target)return json(await decideManager(member,env,target,await body(req)));
  throw new AppError('Method not allowed.',405);
 }
 if(parts[1]==='activity'){
  if(req.method!=='GET')throw new AppError('Method not allowed.',405);
  const who=url.searchParams.get('user')||'';let before=Number.MAX_SAFE_INTEGER,last='\uffff';
  if(url.searchParams.has('cursor')){try{const c=JSON.parse(url.searchParams.get('cursor'));if(!Array.isArray(c)||!Number.isSafeInteger(c[0])||typeof c[1]!=='string'||c[1].length>100)throw Error();[before,last]=c}catch{throw new AppError('Invalid activity cursor.',400)}}
  const rows=(await db.prepare('SELECT a.id,a.actor,a.action,a.resource,a.status,a.created,u.name FROM activity a LEFT JOIN users u ON u.id=a.actor WHERE (?=\'\' OR a.actor=?) AND (a.created<? OR (a.created=? AND a.id<?)) ORDER BY a.created DESC,a.id DESC LIMIT 101').bind(who,who,before,before,last).all()).results;
  const events=rows.slice(0,100),end=events.at(-1);return json({events,next:rows.length>100?JSON.stringify([end.created,end.id]):null});
 }
 if(parts[1]==='mail'){
  if(!ownerAccount(member,env))throw new AppError('Only the owner can inspect email delivery.',403,'owner_required');
  if(req.method==='POST'){await drainMail(env,deps.mailFetcher||fetch);return json({retried:true})}
  if(req.method!=='GET')throw new AppError('Method not allowed.',405);
  const rows=await db.prepare('SELECT id,kind,status,attempts,next_at,created,expires FROM mail_outbox ORDER BY created DESC LIMIT 100').all();return json({configured:mailReady(env),notifications:rows.results});
 }
 if(parts[1]==='users'&&target&&parts[3]==='details'){
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),user=await db.prepare('SELECT id FROM users WHERE id=?').bind(target).first();if(!user)throw new AppError('User not found.',404);
  if(Object.keys(input).some(k=>!['label','organization','notes'].includes(k)))throw new AppError('Only the management label, organization and notes can be edited here.');
  await db.prepare('INSERT INTO user_details(owner,label,organization,notes,updated_by,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET label=excluded.label,organization=excluded.organization,notes=excluded.notes,updated_by=excluded.updated_by,updated=excluded.updated').bind(target,text(input.label||'',100),text(input.organization||'',150),text(input.notes||'',2000),member.id,Date.now()).run();return json({saved:true});
 }
 if(parts[1]==='users'&&target&&parts[3]==='access'){
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),user=await db.prepare('SELECT * FROM users WHERE id=?').bind(target).first();if(!user)throw new AppError('User not found.',404);
  if(target===env.SOMAS_ADMIN_USER_ID||target===member.id)throw new AppError('The owner and your own access cannot be changed here.',403);
  if(input.action==='revoke-manager'){
   if(!ownerAccount(member,env))throw new AppError('Only the owner can revoke managers.',403,'owner_required');
   await db.prepare("UPDATE users SET role='user' WHERE id=?").bind(target).run();
  }else if(['suspend','activate'].includes(input.action)){
   if(user.role==='manager'&&!ownerAccount(member,env))throw new AppError('Only the owner can change another manager’s access.',403,'owner_required');
   await db.prepare('UPDATE users SET status=? WHERE id=?').bind(input.action==='suspend'?'suspended':'active',target).run();
  }else throw new AppError('Unknown user action.',400);
  await recordActivity(db,member.id,'user.'+input.action,target);return json({saved:true});
 }
 if(parts[1]==='projects'&&target&&parts[3]==='control'){
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);const input=await body(req),row=await db.prepare('SELECT * FROM projects WHERE id=?').bind(target).first();if(!row)throw new AppError('Project not found.',404);
  if(!['pause','resume'].includes(input.action))throw new AppError('Unknown project action.',400);
  if(input.action==='pause')await db.prepare('UPDATE projects SET paused=1 WHERE id=?').bind(target).run();
  else{const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(row.owner).first();if(!user||user.status!=='active'||!isVerified(user,env))throw new AppError('The project owner must be active and verified.',409);await locked(db,target,row.owner,async(r,p,t)=>{const complete=p.status==='complete';p.running=true;p.status='queued';p.nextAt=0;p.error=null;if(p.phase==='settle'||complete)p.phase='plan';await persist(db,r,p,t)});await db.prepare('UPDATE projects SET paused=0 WHERE id=?').bind(target).run()}
  await recordActivity(db,member.id,'project.'+input.action,target);return json({saved:true});
 }
 return null;
}

// Audit route names, resource IDs, and outcomes only. Never record request bodies,
// API keys, verification codes, private message text, or authentication headers.
export async function handleAPI(req,env,deps={}){
 if(new URL(req.url).pathname.startsWith('/api/auth/oauth/'))return gmailAuthEndpoint(req,env,deps);
 if(new URL(req.url).pathname.startsWith('/api/auth/email/'))return emailAuthEndpoint(req,env,deps);
 const url=new URL(req.url),ownerSetup=['/api/email-setup','/api/email-setup/google'].includes(url.pathname)||url.searchParams.get('context')==='owner-setup'&&['/api/me','/api/auth/send-verification','/api/auth/verify-email'].includes(url.pathname);
 const session=await emailSessionRequest(req,env,{ownerSetup});req=session.req;env={...env,authMethod:session.method,oauthUserId:session.oauthUserId};
 const response=await handleAPIInternal(req,env,deps),actor=req.headers.get('oai-authenticated-user-id');
 const parts=new URL(req.url).pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean);
 if(env.DB&&actor&&((req.method!=='GET'&&!['work','activity','share-event'].includes(parts[0])&&parts[2]!=='step')||parts[0]==='admin')){
  const action=(req.method.toLowerCase()+'.'+(parts[0]||'root')+(parts[0]==='auth'?'.'+parts[1]:''));
  await recordActivity(env.DB,actor,action,parts[0]==='auth'?'':parts.slice(1,4).join('/'),response.status);
 }
 return response;
}
