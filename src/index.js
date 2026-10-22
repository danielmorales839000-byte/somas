import {database,uuid,getUserFromSession,createUser,createSession,getSubscription,listProjects,ownedProject,publicProject,provisionProject,projectAgents,reserveQuota,usageSummary,createTaskWithProposal,listProposals,approveProposal,listReleases,rollbackRelease,recordFindings,listFindings} from './database.js';
import {hashPassword,verifyPassword,randomToken,sha256,cookieForSession,clearCookie,sessionCookie,checkMutationOrigin} from './auth.js';
import {initialSpec,slugify,normalizeInput,chooseTeam,proposeRevision,virtualCustomerHeuristics,renderSite,htmlEscape} from './agents.js';
import {callGateway,localAssistantReply} from './gateway.js';
import {prepareCandidate,validateTrainingLabel} from './learning.js';
import {verifyPaddleSignature,paddleStatusToSomas,createPaddleCheckout} from './billing.js';
import {cronEvolutionTick} from './research.js';
import {readBoundedText} from './http.js';
import {reportFailure} from './errors.js';
import {candidateEvaluation,releasePolicy} from './policy-releases.js';
import {ensureMission,scheduleAssessment,operations,recordConversation,configureMission,runLocalJobs,missionTick,claimJob,heartbeat,issueBrowserToken,completeBrowserJob} from './mission-runtime.js';
import {permissionsFor} from './somas-core.js';
import {ensureRootUnit,ensureCustomerUnit,rootAgents,unitPlans,proposeScopedEvolution,recordRootFeedback,prepareRootCandidate,promoteRootCandidate} from './somas-units.js';

const securityHeaders={'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','cache-control':'no-store','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
function json(payload,status=200,headers={}){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8',...securityHeaders,...headers}});}
function error(code,status=400){return json({error:code},status);}
function html(body,status=200){return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});}
function must(ok,message,status=400){if(!ok){const err=new Error(message);err.status=status;throw err;}}
async function payload(request){
  const len=Number(request.headers.get('content-length')||0);
  must(len<=12000,'payload_too_large',413);
  must(request.headers.get('content-type')?.includes('application/json'),'json_content_type_required',415);
  let text;try{text=await readBoundedText(request,12000);}catch(e){if(e.message==='external_source_too_large')throw Object.assign(new Error('payload_too_large'),{status:413});throw e;}
  let obj;try{obj=JSON.parse(text);}catch{throw Object.assign(new Error('invalid_json'),{status:400});}
  must(obj && typeof obj==='object' && !Array.isArray(obj),'json_object_required');return obj;
}
async function requireUser(sql,request){
  const token=sessionCookie(request);must(token,'unauthenticated',401);
  const user=await getUserFromSession(sql,await sha256(token));must(user,'session_invalid',401);return user;
}
async function requireProject(sql,user,id){const project=await ownedProject(sql,user.id,id);must(project,'project_not_found',404);return project;}
async function allowedSubscription(sql,user){
  const s=await getSubscription(sql,user.id);
  must(s && ['trial','active'].includes(s.status),'subscription_inactive',403);
  return s;
}
const routeId=/^[0-9a-f-]{36}$/i;
const permittedSources=new Set(['developers.cloudflare.com','developer.mozilla.org','neon.com']);
async function handle(request,env,trace){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/health')return json({ok:true,service:'SOMAS v2',databaseConfigured:!!env.DATABASE_URL});
  if(path==='/api/admin/root/view' && method==='GET'){
    const sql=database(env),user=await requireUser(sql,request);
    must(env.ADMIN_USER_ID && user.id===env.ADMIN_USER_ID,'admin_required',403);
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Root SOMAS</title><link rel="stylesheet" href="/style.css"></head><body><main class="content" style="max-width:1450px;margin:auto"><div class="eyebrow">PLATFORM OPERATOR</div><h1>Root SOMAS — Platform Mission</h1><div id="rootOverview" class="card"></div><div id="rootOperations" class="command-center"></div><p>The Root Manager improves the SOMAS service. Customer Managers improve their own applications. Both share the same planning engine.</p><section class="card"><h2>Root evolution request</h2><form id="rootMissionForm"><label>Service improvement<textarea id="rootMessage" minlength="8" maxlength="2500" rows="4" required placeholder="Improve SOMAS project onboarding reliability and tests"></textarea></label><label>Change type<select id="rootChangeKind"><option value="software">Software</option><option value="intelligence">Intelligence</option><option value="organization">Organization</option><option value="business">Business operations</option></select></label><button class="primary" type="submit">Prepare scoped plan</button></form><pre id="rootResult"></pre></section><section class="card"><h2>Recent proposals</h2><div id="rootProposals"></div></section></main><script type="module" src="/root.js"></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
  }

  const inSiteManager=path.match(/^\/s\/([a-z0-9-]{1,70})\/manage$/);
  if(inSiteManager && method==='GET'){
    const sql=database(env);const project=await publicProject(sql,inSiteManager[1]);
    if(!project)return error('site_not_found',404);
    let user;
    try{user=await requireUser(sql,request);}catch{return Response.redirect(`${url.origin}/?site=${encodeURIComponent(inSiteManager[1])}`,302);}
    const owned=await ownedProject(sql,user.id,project.id);
    if(!owned)return error('manager_access_denied',403);
    const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOMAS Manager · ${htmlEscape(project.title)}</title><link rel="stylesheet" href="/style.css"></head><body>
    <header class="topnav"><div class="brand">◈ SOMAS <span class="brand-version">MANAGER</span></div><nav><a href="/s/${htmlEscape(project.slug)}">← Back to site</a> &nbsp; <a href="/?site=${htmlEscape(project.slug)}">Full dashboard ↗</a></nav></header>
    <main class="content" style="max-width:900px;margin:auto"><div class="eyebrow">OWNER-ONLY AI CONTROL PANEL</div><h1>${htmlEscape(project.title)}</h1><p class="muted">Assistant → Manager → Dynamically assembled specialists</p>
    <section class="card" id="somas-manager" data-project="${htmlEscape(project.id)}"><h2>Tell your SOMAS team what to improve</h2><form id="embeddedForm"><label>Change request<textarea id="embeddedRequest" required minlength="8" maxlength="2500" placeholder="Try: Change the title to a new name" rows="4"></textarea></label><button type="submit" class="primary">Send to Manager →</button></form><div id="embeddedResult" class="response hidden"></div></section>
    <section class="card"><h2>Your SOMAS instance</h2><p class="muted" id="unitMission">Loading your mission...</p><p>Your application has its own Manager, Assistant and Virtual Customer, using the same SOMAS planning engine as the platform Root. Their permissions and neural weights remain independent.</p><form id="unitEvolutionForm"><label>What should your SOMAS team improve?<textarea id="unitEvolutionMessage" required minlength="8" maxlength="2500" rows="3" placeholder="Improve our reservation workflow and evaluate existing errors"></textarea></label><label>Improvement category<select id="unitEvolutionKind"><option value="software">Software</option><option value="intelligence">Intelligence</option><option value="organization">Organization</option><option value="business">Business operations</option></select></label><button type="submit" class="primary">Organize team and propose</button></form><div id="unitEvolutionResult" class="response hidden"></div><div id="unitEvolutionPlans"></div></section>
    <section class="card"><div class="section-head"><h2>Evolution proposals</h2><button id="embeddedRefresh" class="small-outline">Refresh</button></div><div id="embeddedProposals"></div></section><section class="card"><div class="section-head"><h2>Virtual Customer</h2><button id="embeddedAudit" class="small-outline">Run audit</button></div><div id="embeddedFindings"></div></section>
    </main><script type="module" src="/manage.js"></script></body></html>`;
    return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if(path.startsWith('/s/') && method==='GET'){
    const slug=path.slice(3);if(!/^[a-z0-9-]{1,70}$/.test(slug))return error('site_not_found',404);
    const project=await publicProject(database(env),slug);
    if(!project)return error('site_not_found',404);
    if(project.suspended)return html('<h1>Site temporarily unavailable</h1>',503);
    const response=html(renderSite(project.spec,slug));response.headers.set('x-somas-release',String(project.active_release));return response;
  }
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  // Paddle is not a browser request; verify cryptographic signature instead of an Origin header.
  if(path==='/api/webhooks/paddle' && method==='POST'){
    must(!!env.PADDLE_WEBHOOK_SECRET,'billing_not_configured',503);
    const raw=await request.text();must(raw.length<=200000,'payload_too_large',413);
    must(await verifyPaddleSignature(raw,request.headers.get('paddle-signature'),env.PADDLE_WEBHOOK_SECRET),'invalid_webhook_signature',401);
    const event=JSON.parse(raw);const providerId=String(event?.data?.id||'');
    if(!String(event.event_type||'').startsWith('subscription.'))return json({acknowledged:true,ignored:true});
    must(/^evt_[a-z0-9]{26}$/.test(event.event_id||'') && /^sub_[a-z0-9]{26}$/.test(providerId),'invalid_subscription_event');
    const status=paddleStatusToSomas(event?.data?.status);
    if(!status)return json({acknowledged:true,skipped:'unrecognized_status'});
    const sql=database(env);
    let workspaceId=event?.data?.custom_data?.workspace_id;
    if(!workspaceId){const existing=await sql`SELECT workspace_id FROM subscriptions WHERE provider_subscription_id=${providerId} LIMIT 1`;workspaceId=existing[0]?.workspace_id;}
    must(typeof workspaceId==='string' && /^[0-9a-f-]{36}$/i.test(workspaceId),'unknown_billing_workspace',404);
    const eventTime=String(event.occurred_at||'');must(!Number.isNaN(Date.parse(eventTime)),'invalid_event_time');
    const rows=await sql`WITH received AS (
      INSERT INTO processed_payment_events(event_id,event_type,occurred_at) VALUES (${event.event_id},${event.event_type},${eventTime}::timestamptz)
      ON CONFLICT DO NOTHING RETURNING event_id
    ), applied AS (
      UPDATE subscriptions SET status=${status},plan='starter',provider='paddle',provider_subscription_id=${providerId},updated_at=now(),provider_event_at=${eventTime}::timestamptz
      WHERE workspace_id=${workspaceId} AND (provider_subscription_id IS NULL OR provider_subscription_id=${providerId})
        AND (provider_event_at IS NULL OR provider_event_at<=${eventTime}::timestamptz)
        AND EXISTS(SELECT 1 FROM received)
      RETURNING workspace_id
    ) SELECT (SELECT count(*)::int FROM received) as received,(SELECT count(*)::int FROM applied) as applied`;
    return json({acknowledged:true,received:rows[0]?.received===1,applied:rows[0]?.applied===1});
  }
  if(path.startsWith('/api/runner/') && method==='POST') {
    const sql=database(env),bearer=request.headers.get('authorization')||'';
    must(/^Bearer [a-f0-9]{64}$/.test(bearer),'runner_unauthenticated',401);
    const runner=(await sql`SELECT unit_id FROM somas_runtime_runner_tokens WHERE token_hash=${await sha256(bearer.slice(7))} AND expires_at>now() AND revoked=false`)[0];
    must(runner,'runner_unauthenticated',401);
    if(path==='/api/runner/claim') {
      const job=await claimJob(sql,{unitId:runner.unit_id,kinds:['browser_journey']});
      return json({job:job?{id:job.id,kind:job.kind,leaseToken:job.lease_token,leaseUntil:job.lease_until,payload:job.payload}:null});
    }
    const p=await payload(request);must(routeId.test(p.jobId||'')&&routeId.test(p.leaseToken||''),'invalid_runner_request');
    if(path==='/api/runner/heartbeat')return json(await heartbeat(sql,runner.unit_id,p.jobId,p.leaseToken));
    if(path==='/api/runner/report')return json({job:await completeBrowserJob(sql,runner.unit_id,p.jobId,p.leaseToken,p.report)});
    return error('route_not_found',404);
  }
  must(checkMutationOrigin(request),'request_origin_not_allowed',403);
  trace.stage='database_configuration';
  const sql=database(env);

  if(path==='/api/auth/register'&&method==='POST'){
    const p=await payload(request);
    const email=String(p.email||'').trim().toLowerCase();must(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=180,'invalid_email');
    trace.stage='registration_password_hash';
    const hashed=await hashPassword(p.password);
    trace.stage='registration_user_workspace';
    let user;try{user=await createUser(sql,email,hashed);}catch(e){if(e.code==='23505')return error('email_already_registered',409);throw e;}
    trace.stage='registration_session';
    const token=randomToken();await createSession(sql,user.id,await sha256(token));
    return json({user:{id:user.id,email:user.email},plan:'free'},201,{'set-cookie':cookieForSession(token,request.url)});
  }
  if(path==='/api/auth/login'&&method==='POST'){
    const p=await payload(request);const email=String(p.email||'').trim().toLowerCase();
    const rows=await sql`SELECT id,email,password_hash,COALESCE(to_jsonb(users)->>'account_status','active') AS account_status FROM users WHERE email=${email} LIMIT 1`;
    if(!rows.length || !(await verifyPassword(String(p.password||''),rows[0].password_hash)))return error('invalid_credentials',401);
    must(rows[0].account_status!=='suspended','account_suspended',403);
    const token=randomToken();await createSession(sql,rows[0].id,await sha256(token));
    return json({user:{id:rows[0].id,email:rows[0].email}},200,{'set-cookie':cookieForSession(token,request.url)});
  }
  if(path==='/api/auth/logout'&&method==='POST'){
    const token=sessionCookie(request);
    if(token)await sql`DELETE FROM sessions WHERE token_hash=${await sha256(token)}`;
    return json({ok:true},200,{'set-cookie':clearCookie(request.url)});
  }
  const user=await requireUser(sql,request);
  if(path==='/api/billing/checkout' && method==='POST'){
    const workspace=(await sql`SELECT w.id FROM workspaces w WHERE w.owner_id=${user.id} LIMIT 1`)[0];
    must(workspace,'workspace_not_found',404);
    try{const checkoutUrl=await createPaddleCheckout(env,workspace.id);return json({checkoutUrl});}
    catch(e){if(e.message==='billing_not_configured')return error('billing_not_configured',503);throw e;}
  }
  if(path==='/api/admin/instances' && method==='GET'){
    must(env.ADMIN_USER_ID && user.id===env.ADMIN_USER_ID,'admin_required',403);
    const rows=await sql`SELECT p.id,p.slug,p.title,p.active_release,p.suspended,p.created_at,w.id as workspace_id,s.status as subscription_status
      FROM projects p JOIN workspaces w ON w.id=p.workspace_id JOIN subscriptions s ON s.workspace_id=w.id
      ORDER BY p.created_at DESC LIMIT 150`;
    return json({instances:rows});
  }
  const adminSuspend=path.match(/^\/api\/admin\/instances\/([0-9a-f-]{36})\/suspend$/i);
  if(adminSuspend && method==='POST'){
    must(env.ADMIN_USER_ID && user.id===env.ADMIN_USER_ID,'admin_required',403);
    const p=await payload(request);must(typeof p.suspended==='boolean','boolean_suspended_required');
    const rows=await sql`UPDATE projects SET suspended=${p.suspended} WHERE id=${adminSuspend[1]} RETURNING id,suspended`;
    must(rows.length,'instance_not_found',404);
    await sql`INSERT INTO audit_events(id,actor_id,project_id,action,metadata) VALUES (${uuid()},${user.id},${adminSuspend[1]},'platform_instance_suspension',${JSON.stringify({suspended:p.suspended,reason:String(p.reason||'').slice(0,200)})}::jsonb)`;
    return json({instance:rows[0]});
  }

  // Root and customer SOMAS share the same planner, but not privileges or data.
  const isAdmin=Boolean(env.ADMIN_USER_ID && user.id===env.ADMIN_USER_ID);
  const rootOperations=path.match(/^\/api\/admin\/root\/operations(?:\/(.*))?$/);
  if(rootOperations) {
    must(isAdmin,'admin_required',403);
    const unit=await ensureRootUnit(sql);
    return runtimeRoute(sql,unit,rootOperations[1]||'',method,request,env,user);
  }
  const adminAccount=path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/status$/i);
  if(adminAccount&&method==='POST') {
    must(isAdmin,'admin_required',403);must(adminAccount[1]!==user.id,'cannot_suspend_current_admin',409);
    const p=await payload(request);must(['active','suspended'].includes(p.status),'invalid_account_status');
    const results=await sql.transaction([
      sql`UPDATE users SET account_status=${p.status} WHERE id=${adminAccount[1]} RETURNING id,account_status`,
      sql`INSERT INTO audit_events(id,actor_id,action,metadata) SELECT ${uuid()},${user.id},'platform_account_status',jsonb_build_object('accountId',id,'status',account_status) FROM users WHERE id=${adminAccount[1]}`,
      sql`DELETE FROM sessions WHERE user_id=${adminAccount[1]} AND ${p.status}='suspended'`,
      sql`UPDATE somas_runtime_runner_tokens SET revoked=true WHERE ${p.status}='suspended' AND unit_id IN (SELECT u.id FROM somas_units u JOIN workspaces w ON w.id=u.workspace_id WHERE w.owner_id=${adminAccount[1]})`
    ]);
    must(results[0].length,'account_not_found',404);return json({account:results[0][0]});
  }
  if(path==='/api/admin/overview' && method==='GET') {
    must(isAdmin,'admin_required',403);
    const accounts=await sql`SELECT u.id,u.account_status,u.created_at,count(w.id)::int AS workspaces FROM users u LEFT JOIN workspaces w ON w.owner_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`;
    const instances=await sql`SELECT p.id,p.slug,p.active_release,p.suspended,s.plan,s.status AS subscription_status FROM projects p JOIN subscriptions s ON s.workspace_id=p.workspace_id ORDER BY p.created_at DESC LIMIT 100`;
    const health=await sql`SELECT status,count(*)::int AS count FROM somas_runtime_jobs GROUP BY status`;
    const securityEvents=await sql`SELECT id,action,created_at FROM audit_events WHERE action IN ('platform_instance_suspension','platform_account_status','runtime_browser_credential_issued') ORDER BY created_at DESC LIMIT 30`;
    return json({accounts,instances,health,securityEvents});
  }
  if(path==='/api/admin/root'&&method==='GET'){
    must(isAdmin,'admin_required',403);
    const unit=await ensureRootUnit(sql);
    return json({unit,permissions:permissionsFor(unit),agents:await rootAgents(sql),proposals:await unitPlans(sql,unit,user.id)});
  }
  if(path==='/api/admin/root/evolution'&&method==='POST'){
    must(isAdmin,'admin_required',403);
    must(await reserveQuota(sql,user.id,'root_evolution_plans',30),'monthly_evolution_plans_exhausted',429);
    const p=await payload(request);must(['software','intelligence','organization','business'].includes(p.changeKind||'software'),'invalid_evolution_kind');
    const unit=await ensureRootUnit(sql);
    const agents=await rootAgents(sql);
    const managerPolicy=agents.find(a=>a.role==='manager')?.policy;
    return json({proposal:await proposeScopedEvolution(sql,{unit,instruction:p.message,changeKind:p.changeKind,actorId:user.id,managerPolicy,target:p.target})},201);
  }
  const rootFeedback=path.match(/^\/api\/admin\/root\/agents\/([0-9a-f-]{36})\/feedback$/i);
  if(rootFeedback&&method==='POST'){
    must(isAdmin,'admin_required',403);
    const p=await payload(request);await ensureRootUnit(sql);
    return json(await recordRootFeedback(sql,rootFeedback[1],user.id,p.input,p.label),201);
  }
  const rootTraining=path.match(/^\/api\/admin\/root\/agents\/([0-9a-f-]{36})\/train$/i);
  if(rootTraining&&method==='POST'){
    must(isAdmin,'admin_required',403);
    await ensureRootUnit(sql);
    return json(await prepareRootCandidate(sql,rootTraining[1]));
  }
  const rootPromote=path.match(/^\/api\/admin\/root\/policies\/([0-9a-f-]{36})\/promote$/i);
  if(rootPromote&&method==='POST'){
    must(isAdmin,'admin_required',403);
    return json(await promoteRootCandidate(sql,rootPromote[1],user.id));
  }
  const rootRollback=path.match(/^\/api\/admin\/root\/policies\/([0-9a-f-]{36})\/rollback$/i);
  if(rootRollback&&method==='POST'){
    must(isAdmin,'admin_required',403);
    return json(await releasePolicy(sql,{scope:'root',candidateId:rootRollback[1],actorId:user.id,rollback:true}));
  }

  if(path==='/api/me'&&method==='GET')return json({user,subscription:await getSubscription(sql,user.id),usage:await usageSummary(sql,user.id),isAdmin,billingConfigured:!!(env.PADDLE_API_KEY&&env.PADDLE_PRICE_ID&&env.PADDLE_WEBHOOK_SECRET),limits:{projects:3,changeRequestsPerMonth:100,aiRequestsPerMonth:Number(env.FREE_MONTHLY_AI_REQUESTS||30)}});
  if(path==='/api/projects'&&method==='GET')return json({projects:await listProjects(sql,user.id)});
  if(path==='/api/projects'&&method==='POST'){
    await allowedSubscription(sql,user);
    const p=await payload(request);const title=String(p.title||'').trim();const purpose=normalizeInput(p.purpose);
    const spec=initialSpec(title,purpose,p.template||'business');
    const slug=`${slugify(title)}-${randomToken(3)}`;
    const result=await provisionProject(sql,user.id,{title,purpose,slug,spec});
    // Project, policies and customer unit are initialized in the same transaction.
    return json({project:result,liveUrl:`${url.origin}/s/${slug}`},201);
  }
  const match=path.match(/^\/api\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if(!match)return error('route_not_found',404);
  const projectId=match[1],rest=match[2]||'';must(routeId.test(projectId),'project_not_found',404);
  const project=await requireProject(sql,user,projectId);
  if(!rest&&method==='GET')return json({project:{...project,workspace_id:undefined},agents:await projectAgents(sql,projectId),siteUrl:`${url.origin}/s/${project.slug}`});
  if(rest==='operations'||rest.startsWith('operations/')) {
    const unit=await ensureCustomerUnit(sql,project,user.id);
    if(method!=='GET') {await allowedSubscription(sql,user);must(!project.suspended,'instance_suspended',403);}
    return runtimeRoute(sql,unit,rest.slice('operations'.length).replace(/^\//,''),method,request,env,user);
  }
  if(rest==='agents'&&method==='GET')return json({agents:await projectAgents(sql,projectId)});
  if(rest==='unit'&&method==='GET'){
    const unit=await ensureCustomerUnit(sql,project,user.id);
    return json({unit,permissions:permissionsFor(unit),agents:await projectAgents(sql,projectId),proposals:await unitPlans(sql,unit,user.id)});
  }
  if(rest==='unit/evolution'&&method==='POST'){
    await allowedSubscription(sql,user);must(!project.suspended,'instance_suspended',403);
    must(await reserveQuota(sql,user.id,'evolution_plans',30),'monthly_evolution_plans_exhausted',429);
    const p=await payload(request);must(['software','intelligence','organization','business'].includes(p.changeKind||'software'),'invalid_evolution_kind');
    const unit=await ensureCustomerUnit(sql,project,user.id);
    const agents=await projectAgents(sql,projectId);
    const managerPolicy=agents.find(a=>a.role==='manager')?.policy;
    return json({proposal:await proposeScopedEvolution(sql,{unit,instruction:p.message,changeKind:p.changeKind,actorId:user.id,managerPolicy,target:p.target})},201);
  }

  if(rest==='proposals'&&method==='GET')return json({proposals:await listProposals(sql,projectId)});
  if(rest==='releases'&&method==='GET')return json({releases:await listReleases(sql,projectId)});
  if(rest==='findings'&&method==='GET')return json({findings:await listFindings(sql,projectId)});
  if(rest==='research'&&method==='GET'){
    const sources=await sql`SELECT id,url,title,excerpt,fetched_at FROM research_sources WHERE project_id=${projectId} ORDER BY fetched_at DESC LIMIT 30`;
    return json({sources});
  }

  const approve=rest.match(/^proposals\/([0-9a-f-]{36})\/approve$/i);
  if(approve&&method==='POST'){
    await allowedSubscription(sql,user);
    const out=await approveProposal(sql,projectId,approve[1],user.id);
    return json({released:true,...out,siteUrl:`${url.origin}/s/${project.slug}`});
  }
  const rollback=rest.match(/^releases\/(\d+)\/rollback$/);
  if(rollback&&method==='POST'){
    await allowedSubscription(sql,user);
    await ensureCustomerUnit(sql,project,user.id);
    return json({released:true,...await rollbackRelease(sql,projectId,Number(rollback[1]),user.id)});
  }
  if(rest==='requests'&&method==='POST'){
    await allowedSubscription(sql,user);must(!project.suspended,'instance_suspended',403);
    must(await reserveQuota(sql,user.id,'requests',100),'monthly_request_quota_exhausted',429);
    const p=await payload(request);const instruction=normalizeInput(p.message);
    const activeAgents=await projectAgents(sql,projectId);
    const managerPolicy=activeAgents.find(a=>a.role==='manager')?.policy;
    const team=chooseTeam(instruction,managerPolicy), revision=proposeRevision(project.spec,instruction);
    const task=await createTaskWithProposal(sql,user.id,projectId,instruction,team,revision,project.active_release);
    let assistant=localAssistantReply(project.spec,instruction,team,revision).replace('The Manager selected','I selected').replace("the Manager's team",'your team');
    let llmResult=null;
    if(p.useAi===true && env.ENABLE_LLM==='true' && (env.GROQ_API_KEY||env.OPENROUTER_API_KEY)){
      const permitted=await reserveQuota(sql,user.id,'llm',Math.min(1000,Number(env.FREE_MONTHLY_AI_REQUESTS||30)));
      if(permitted){
        try{
          llmResult=await callGateway(env,[
            {role:'system',content:'You are the SOMAS Assistant. Explain this existing Manager plan in less than 90 words. Never claim that a feature is implemented if it is listed as needs_engineering. Never provide secrets.'},
            {role:'user',content:`Owner request: ${instruction}\nTeam: ${JSON.stringify(team)}\nOutcome: ${task.kind}; ${task.reason}`}
          ]);
          if(llmResult.enabled){assistant=llmResult.answer;
            await sql`INSERT INTO usage_events(id,user_id,project_id,provider,model,prompt_tokens,completion_tokens) VALUES (${uuid()},${user.id},${projectId},${llmResult.provider},${llmResult.model},${Number(llmResult.usage.prompt_tokens||0)},${Number(llmResult.usage.completion_tokens||0)})`;
          }
        }catch(e){assistant+=' (AI provider was unavailable, so I used the local response.)';}
      } else assistant+=' (Monthly AI allocation is exhausted; local planning remains available.)';
    }
    const unit=await ensureCustomerUnit(sql,project,user.id);
    await ensureMission(sql,unit);
    await recordConversation(sql,unit.id,instruction,assistant,task.taskId);
    await scheduleAssessment(sql,unit,{priority:100,key:'owner-request-'+task.taskId});
    return json({task,assistant,preview:revision.nextSpec,provider:llmResult?.provider||'local'},201);
  }
  if(rest==='browser-findings'&&method==='POST'){
    await allowedSubscription(sql,user);must(!project.suspended,'instance_suspended',403);
    must(await reserveQuota(sql,user.id,'browser_reports',30),'monthly_browser_reports_exhausted',429);
    const p=await payload(request);
    must(Array.isArray(p.findings)&&p.findings.length<=15,'invalid_browser_findings');
    const findings=p.findings.map(f=>{
      must(['high','medium','low'].includes(f.severity) &&
        typeof f.title==='string'&&f.title.length>=3&&f.title.length<=150 &&
        typeof f.evidence==='string'&&f.evidence.length>=10&&f.evidence.length<=1000,'invalid_browser_finding');
      return {severity:f.severity,kind:'reproducible_browser_test',title:f.title,evidence:f.evidence};
    });
    await recordFindings(sql,projectId,findings,'playwright_browser');
    return json({stored:findings.length,method:'playwright_browser'});
  }
  if(rest==='audit'&&method==='POST'){
    await allowedSubscription(sql,user);must(!project.suspended,'instance_suspended',403);
    must(await reserveQuota(sql,user.id,'audits',30),'monthly_audit_quota_exhausted',429);
    const findings=virtualCustomerHeuristics(project.spec);
    await recordFindings(sql,projectId,findings,'static_heuristic');
    return json({method:'static_heuristic',browserNavigationPerformed:false,findings,disclaimer:'This checks structured website content; Playwright browser testing is a separate runner.'});
  }
  if(rest==='research'&&method==='POST'){
    must(env.ENABLE_EXTERNAL_RESEARCH==='true','external_research_disabled',403);
    await allowedSubscription(sql,user);must(await reserveQuota(sql,user.id,'research',10),'research_quota_exhausted',429);
    const p=await payload(request);let source;
    try{source=new URL(String(p.url||''));}catch{return error('invalid_research_url');}
    must(source.protocol==='https:'&&permittedSources.has(source.hostname)&&!source.username&&!source.password&&!source.port&&source.pathname.length<180,'source_not_allowlisted');
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6000);
    let data;
    try{const response=await fetch(source.href,{redirect:'error',signal:controller.signal,headers:{Accept:'text/html'}});
      must(response.ok && (response.headers.get('content-type')||'').includes('text/html'),'source_not_html');
      must(Number(response.headers.get('content-length')||0)<130000,'source_too_large');
      data=await readBoundedText(response,130000);
    }finally{clearTimeout(timeout);}
    const title=(data.match(/<title[^>]*>([\s\S]{1,250}?)<\/title>/i)||[])[1]||source.hostname;
    const excerpt=data.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1500);
    await sql`INSERT INTO research_sources(id,project_id,url,title,excerpt) VALUES (${uuid()},${projectId},${source.href},${title.slice(0,250)},${excerpt})`;
    return json({source:source.href,title:title.slice(0,250),excerpt,notice:'Research-only; not deployed, not neural training evidence.'});
  }
  if(rest==='learning'&&method==='GET'){
    const agents=await projectAgents(sql,projectId);
    const candidates=await sql`SELECT pc.id,pc.agent_id,pc.base_version,pc.evaluation-'rollbackPolicy' AS evaluation,pc.status,pc.created_at FROM policy_candidates pc JOIN agents a ON a.id=pc.agent_id WHERE a.project_id=${projectId} ORDER BY pc.created_at DESC LIMIT 20`;
    return json({agents:agents.filter(a=>a.is_core).map(a=>({id:a.id,role:a.role,policyVersion:a.policy?.version||1,verifiedSamples:a.policy?.samples||0})),candidates});
  }
  const feedback=rest.match(/^agents\/([0-9a-f-]{36})\/feedback$/i);
  if(feedback&&method==='POST'){
    await allowedSubscription(sql,user);
    const a=(await sql`SELECT id,role FROM agents WHERE id=${feedback[1]} AND project_id=${projectId} LIMIT 1`)[0];
    must(a,'core_agent_not_found',404);
    const p=await payload(request);const example=normalizeInput(p.input);must(validateTrainingLabel(a.role,p.label),'invalid_training_label');
    await sql`INSERT INTO learning_examples(id,agent_id,submitted_by,input,label) VALUES (${uuid()},${a.id},${user.id},${example},${p.label})`;
    return json({recorded:true,trained:false,notice:'Owner-labelled example stored. No weights changed.'},201);
  }
  const training=rest.match(/^agents\/([0-9a-f-]{36})\/train$/i);
  if(training&&method==='POST'){
    await allowedSubscription(sql,user);
    const a=(await sql`SELECT id,role,policy FROM agents WHERE id=${training[1]} AND project_id=${projectId} LIMIT 1`)[0];
    must(a,'core_agent_not_found',404);
    const examples=await sql`SELECT input,label FROM learning_examples WHERE agent_id=${a.id} ORDER BY created_at ASC LIMIT 500`;
    const candidate=prepareCandidate(a.policy,examples);
    const candidateId=uuid();
    await sql`INSERT INTO policy_candidates(id,agent_id,base_version,proposed_policy,evaluation) VALUES (${candidateId},${a.id},${a.policy.version},${JSON.stringify(candidate.policy)}::jsonb,${JSON.stringify(candidateEvaluation(candidate,a.policy))}::jsonb)`;
    return json({candidateId,evaluation:candidate.evaluation,activePolicyUnchanged:true});
  }
  const promote=rest.match(/^policies\/([0-9a-f-]{36})\/promote$/i);
  if(promote&&method==='POST'){
    await allowedSubscription(sql,user);
    return json(await releasePolicy(sql,{scope:'customer',candidateId:promote[1],projectId,actorId:user.id}));
  }
  const rollbackPolicy=rest.match(/^policies\/([0-9a-f-]{36})\/rollback$/i);
  if(rollbackPolicy&&method==='POST'){
    await allowedSubscription(sql,user);
    return json(await releasePolicy(sql,{scope:'customer',candidateId:rollbackPolicy[1],projectId,actorId:user.id,rollback:true}));
  }
  return error('route_not_found',404);
}
async function runtimeRoute(sql,unit,rest,method,request,env,user) {
  if(!rest&&method==='GET') {
    await scheduleAssessment(sql,unit);
    return json(await operations(sql,unit));
  }
  if(rest==='settings'&&method==='POST')return json(await configureMission(sql,unit,await payload(request)));
  if(rest==='cycle'&&method==='POST') {
    must(await reserveQuota(sql,user.id,'runtime_cycles',30),'runtime_cycle_quota_exhausted',429);
    await scheduleAssessment(sql,unit,{priority:100,key:'manual-'+uuid()});
    return json(await runLocalJobs(sql,unit.id,env));
  }
  if(rest==='runner-token'&&method==='POST') {
    must(await reserveQuota(sql,user.id,'runner_tokens',30),'runner_token_quota_exhausted',429);
    must(unit.kind==='customer','customer_runner_only',400);
    const token=randomToken(32);await issueBrowserToken(sql,unit,await sha256(token),user.id);
    return json({token,expiresInSeconds:3600,scope:'browser_journey',notice:'One project, browser jobs only. Store securely; never paste into chat.'},201);
  }
  if(rest==='retry'&&method==='POST') {
    must(await reserveQuota(sql,user.id,'runtime_retries',30),'runtime_retry_quota_exhausted',429);
    const p=await payload(request);must(routeId.test(p.jobId||''),'invalid_job_id');
    // Owner retries only local transient failures; missing providers cannot become queued by request.
    const rows=await sql`UPDATE somas_runtime_jobs SET status='queued',blocker=NULL,attempts=0,next_run_at=now()
      WHERE id=${p.jobId} AND unit_id=${unit.id} AND status IN ('blocked','failed') AND kind IN ('assess_mission','package_application') RETURNING id`;
    must(rows.length,'job_not_retryable',409);return json({queued:true});
  }
  const artifact=rest.match(/^artifacts\/([0-9a-f-]{36})$/i);
  if(artifact&&method==='GET') {
    const row=(await sql`SELECT id,kind,body,digest FROM somas_runtime_artifacts WHERE id=${artifact[1]} AND unit_id=${unit.id}`)[0];
    must(row,'artifact_not_found',404);
    return json(row.body,200,{'content-disposition':`attachment; filename="somas-${row.kind}-${row.id}.json"`});
  }
  return error('route_not_found',404);
}
export default {
  async scheduled(event,env,ctx){
    ctx.waitUntil(missionTick(env).catch(e=>reportFailure(e,'mission_scheduled_work')));
    ctx.waitUntil(cronEvolutionTick(env).catch(e=>reportFailure(e,'scheduled_work')));
  },
  async fetch(request,env){
    const trace={stage:'request'};
    try{return await handle(request,env,trace);}catch(e){
      if(e.status)return error(e.message,e.status);
      if(e.message==='cross_scope_evolution_forbidden')return error(e.message,403);
      if(['root_agent_not_found','customer_unit_not_found'].includes(e.message))return error(e.message,404);
      if(['root_policy_not_promotable','policy_not_promotable'].includes(e.message))return error(e.message,409);
      if(['invalid_evolution_kind','invalid_training_label'].includes(e.message))return error(e.message,400);
      if(['description_must_be_8_to_2500_chars','password_must_be_12_to_128_chars','title_too_short','invalid_template','too_many_sections','invalid_site_spec','at_least_5_verified_examples_required'].includes(e.message))return error(e.message,400);
      if(['proposal_not_approvable','release_not_found'].includes(e.message))return error(e.message,409);
      if(e.message==='free_project_limit_3')return error(e.message,409);
      if(e.code==='23505')return error('duplicate_record',409);
      const failure=reportFailure(e,trace.stage);
      return json({error:failure.code,requestId:failure.requestId},failure.status,{'x-request-id':failure.requestId});
    }
  }
};
