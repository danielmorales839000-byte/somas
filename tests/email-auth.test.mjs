import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAPI} from '../lib/server.mjs';
import {OWNER_EMAIL} from '../lib/membership.mjs';
import {testDatabase} from './helpers/database.mjs';

function setup(){
 const {db,sqlite}=testDatabase(),emails=[];
 const env={DB:db,SOMAS_ADMIN_USER_ID:'existing-owner',APP_DATA_KEY:'fixture-email-login-encryption',RESEND_API_KEY:'fixture-email-provider',MAIL_FROM:'SOMAS <hello@example.test>'};
 const mailFetcher=async(_url,options)=>{emails.push(JSON.parse(options.body));return Response.json({id:'fixture-'+emails.length})};
 function client(identity=null){const jar={};return {jar,async call(path,method='GET',data,origin='https://somas.test',send=mailFetcher){
  const headers={Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';'),Origin:origin};
  if(identity){headers['oai-authenticated-user-id']=identity.id;headers['oai-authenticated-user-email']=identity.email;}
  if(data)headers['Content-Type']='application/json';
  const response=await handleAPI(new Request('https://somas.test/api/'+path,{method,headers,body:data?JSON.stringify(data):undefined}),env,{mailFetcher:send});
  const cookies=response.headers.getSetCookie();for(const cookie of cookies){const [name,value]=cookie.split(';')[0].split('=');jar[name]=value}
  return {status:response.status,data:await response.json(),cookies};
 },async begin(data,origin='https://somas.test',send=mailFetcher){
  const start=await this.call('auth/email/start','POST',data,origin,send);if(start.status!==200)return start;
  const delivery=await this.call('auth/email/status','POST',{id:start.data.id,email:start.data.email},origin,send);return {...start,data:{...start.data,...delivery.data}};
 }} }
 const code=()=>emails.at(-1).text.match(/Verification code: (\d{8})/)[1];
 async function login(c,email='alice@example.test',next){const start=await c.begin({email});assert.equal(start.status,200);return c.call('auth/email/verify','POST',{id:start.data.id,email,code:code(),next})}
 return {env,db,sqlite,emails,client,code,login};
}

test('anonymous users sign up by email code directly into a private user workspace without a password or Manager role',async()=>{
 const t=setup(),c=t.client();assert.equal((await c.call('me')).status,401);
 const start=await c.begin({email:' Alice@Example.Test ',role:'manager'});assert.equal(start.status,200);assert.equal(start.data.email,'alice@example.test');assert.deepEqual(t.emails.at(-1).to,['alice@example.test']);
 assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);assert.ok(!JSON.stringify(start.data).includes(t.code()));assert.match(start.cookies[0],/Secure; HttpOnly; SameSite=Lax/);
 const verified=await c.call('auth/email/verify','POST',{id:start.data.id,email:start.data.email,code:t.code(),next:'https://elsewhere.test'});
 assert.equal(verified.status,200);assert.equal(verified.data.next,'/?screen=dashboard');assert.match(verified.cookies[0],/^__Host-somas_session=/);assert.match(verified.cookies[0],/Path=\/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax/);
 const me=(await c.call('me')).data;assert.equal(me.authMethod,'email');assert.equal(me.emailVerified,true);assert.equal(me.isAdmin,false);assert.equal(me.isOwner,false);
 assert.equal(t.sqlite.prepare('SELECT role FROM users').get().role,'user');assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM manager_requests').get().n,0);
 const session=t.sqlite.prepare('SELECT token_hash FROM email_sessions').get();assert.ok(!JSON.stringify(verified.data).includes(c.jar['__Host-somas_session']));assert.notEqual(session.token_hash,c.jar['__Host-somas_session']);
 assert.equal((await c.call('projects')).status,200);assert.equal((await c.call('admin/users')).status,403);assert.equal((await c.call('email-setup')).status,403);
 assert.equal((await c.call('manager-request','POST',{reason:'I can help support other users.'})).status,201);assert.deepEqual(t.emails.at(-1).to,[OWNER_EMAIL]);assert.equal((await c.call('me')).data.isAdmin,false);
});

test('email codes require the matching browser and mailbox, expire, limit attempts, and are single use under concurrency',async()=>{
 const t=setup(),c=t.client(),other=t.client();const start=await c.begin({email:'alice@example.test'}),code=t.code(),data={id:start.data.id,email:start.data.email,code};
 assert.equal((await other.call('auth/email/verify','POST',data)).status,400);other.jar['__Host-somas_login']='a'.repeat(64);assert.equal((await other.call('auth/email/verify','POST',data)).status,400);
 assert.equal((await c.call('auth/email/verify','POST',{...data,email:'other@example.test'})).status,400);
 const results=await Promise.all([c.call('auth/email/verify','POST',data),c.call('auth/email/verify','POST',data)]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,1);
 assert.equal((await c.call('auth/email/verify','POST',data)).status,400);
 const u=setup(),d=u.client(),s=await d.begin({email:'alice@example.test'});const good=u.code(),wrong=good==='00000000'?'11111111':'00000000';for(let i=0;i<5;i++)assert.equal((await d.call('auth/email/verify','POST',{id:s.data.id,email:s.data.email,code:wrong})).status,400);assert.equal((await d.call('auth/email/verify','POST',{id:s.data.id,email:s.data.email,code:good})).status,400);
 const v=setup(),e=v.client(),a=await e.begin({email:'alice@example.test'});v.sqlite.prepare('UPDATE verification_challenges SET expires=0').run();assert.equal((await e.call('auth/email/verify','POST',{id:a.data.id,email:a.data.email,code:v.code()})).status,400);
});

test('resends invalidate earlier codes and rate limits, invalid input, and cross-origin calls do not send mail',async()=>{
 const t=setup(),c=t.client();assert.equal((await c.begin({email:'bad'})).status,400);assert.equal((await c.begin({email:'alice@example.test'},'https://evil.test')).status,403);assert.equal(t.emails.length,0);
 const start=await c.begin({email:'alice@example.test'}),old=t.code();assert.equal((await c.begin({email:'alice@example.test'})).status,429);
 t.sqlite.prepare('UPDATE verification_challenges SET created=created-61000').run();const resend=await c.begin({email:'alice@example.test'});assert.equal(resend.status,200);const recent=t.code();assert.equal((await c.call('auth/email/verify','POST',{id:start.data.id,email:start.data.email,code:old})).status,400);
 assert.equal((await c.call('auth/email/verify','POST',{id:resend.data.id,email:resend.data.email,code:recent},'https://evil.test')).status,403);assert.equal((await c.call('auth/email/verify','POST',{id:resend.data.id,email:resend.data.email,code:recent})).status,200);
 t.sqlite.prepare("UPDATE login_limits SET count=100 WHERE key='global'").run();const before=t.emails.length;assert.equal((await c.begin({email:'different@example.test'})).status,429);assert.equal(t.emails.length,before);
});

test('sessions survive reload, isolate users and projects, expire and revoke on logout; suspension is enforced immediately',async()=>{
 const t=setup(),a=t.client(),b=t.client();await t.login(a);const project=await a.call('projects','POST',{requirement:'Build a website for my local restaurant.'});assert.equal(project.status,201);
 await t.login(b,'bob@example.test');assert.equal((await b.call('projects/'+project.data.project.id)).status,404);assert.equal((await a.call('projects')).data.projects.length,1);
 assert.equal((await a.call('auth/email/logout','POST',{},'https://evil.test')).status,403);assert.equal((await a.call('projects')).status,200);
 const old=a.jar['__Host-somas_session'];assert.equal((await a.call('auth/email/logout','POST',{})).status,200);a.jar['__Host-somas_session']=old;assert.equal((await a.call('projects')).status,401);
 const id=(await b.call('me')).data.user.id;t.sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(id);assert.equal((await b.call('projects')).status,403);assert.equal((await b.call('me')).data.status,'suspended');t.sqlite.prepare("UPDATE users SET status='active' WHERE id=?").run(id);t.sqlite.prepare('UPDATE email_sessions SET expires=0').run();assert.equal((await b.call('projects')).status,401);
});

test('verified email login preserves the configured owner identity and existing projects without trusting a claimed email',async()=>{
 const t=setup(),c=t.client();const now=Date.now();t.sqlite.prepare('INSERT INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?)').run('existing-owner','Owner','former@example.test',now,now);
 const noCode=await c.begin({email:OWNER_EMAIL});assert.equal((await c.call('admin/users')).status,401);assert.equal((await c.call('auth/email/verify','POST',{id:noCode.data.id,email:OWNER_EMAIL,code:t.code()})).status,200);
 const me=(await c.call('me')).data;assert.equal(me.user.id,'existing-owner');assert.equal(me.user.email,'former@example.test');assert.equal(me.isOwner,true);assert.equal(me.verificationEmail,OWNER_EMAIL);assert.equal((await c.call('admin/users')).status,200);
 assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,1);
});

test('missing sender never creates a session or claims a successful sign-in',async()=>{
 const t=setup(),c=t.client();delete t.env.RESEND_API_KEY;assert.equal((await c.call('auth/email/config')).data.configured,false);const result=await c.begin({email:'alice@example.test'});assert.equal(result.status,503);assert.match(result.data.error.message,/couldn’t send your code/);assert.doesNotMatch(result.data.error.message,/owner|sender|setup/i);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,0);assert.equal(t.emails.length,0);
});


test('existing verified accounts retain their projects; ambiguous mailbox links are rejected rather than merged',async()=>{
 const t=setup(),c=t.client(),now=Date.now();t.sqlite.prepare('INSERT INTO users(id,name,email,joined,last_seen,verified_email,email_verified_at) VALUES(?,?,?,?,?,?,?)').run('legacy-user','Existing user','alice@example.test',now,now,'alice@example.test',now);
 await t.login(c);assert.equal((await c.call('me')).data.user.id,'legacy-user');assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,1);
 const u=setup(),d=u.client();for(const id of ['one','two'])u.sqlite.prepare('INSERT INTO users(id,name,email,joined,last_seen,verified_email,email_verified_at) VALUES(?,?,?,?,?,?,?)').run(id,id,'same@example.test',now,now,'same@example.test',now);
 const start=await d.begin({email:'same@example.test'});assert.equal((await d.call('auth/email/verify','POST',{id:start.data.id,email:start.data.email,code:u.code()})).status,409);assert.equal(u.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,0);assert.equal(u.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,2);
});

test('rejected email delivery is visible and never returns a code, account, or session',async()=>{
 const t=setup(),c=t.client();const r=await c.begin({email:'alice@example.test'},'https://somas.test',async()=>Response.json({message:'private-provider-error'},{status:403}));
 assert.equal(r.data.delivery,'failed');assert.match(r.data.message,/verify the sending domain/);assert.ok(!JSON.stringify(r.data).includes('private-provider-error'));assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,0);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
});


test('email start returns the saved challenge and browser cookie before contacting a mail provider',async()=>{
 const t=setup(),c=t.client();const start=await c.call('auth/email/start','POST',{email:'alice@example.test'});
 assert.equal(start.status,200);assert.equal(start.data.delivery,'queued');assert.equal(t.emails.length,0);assert.ok(c.jar['__Host-somas_login']);assert.equal(t.sqlite.prepare('SELECT status FROM mail_outbox').get().status,'queued');
 const sent=await c.call('auth/email/status','POST',{id:start.data.id,email:start.data.email});assert.equal(sent.data.delivery,'accepted');assert.equal(t.emails.length,1);
 assert.equal((await c.call('auth/email/verify','POST',{id:start.data.id,email:start.data.email,code:t.code()})).status,200);
});
test('resending cancels previously queued code emails so background delivery cannot send an invalid old code',async()=>{
 const t=setup(),c=t.client();const old=await c.call('auth/email/start','POST',{email:'alice@example.test'});
 t.sqlite.prepare('UPDATE verification_challenges SET created=created-61000').run();
 const latest=await c.call('auth/email/start','POST',{email:'alice@example.test'});
 const oldMail=t.sqlite.prepare('SELECT status,payload FROM mail_outbox WHERE id=?').get(old.data.id);assert.equal(oldMail.status,'expired');assert.equal(oldMail.payload,'');
 const {drainMail}=await import('../lib/membership.mjs');await drainMail(t.env,async(_url,input)=>{t.emails.push(JSON.parse(input.body));return Response.json({id:'fixture-delivery'})});
 assert.equal(t.emails.length,1);assert.equal(t.sqlite.prepare('SELECT status FROM mail_outbox WHERE id=?').get(latest.data.id).status,'accepted');
});


test('trusted hosting owner can recover setup and verify the owner mailbox while testing another SOMAS login',async()=>{
 const t=setup(),c=t.client({id:'existing-owner',email:'former@example.test'});await t.login(c);
 const ordinary=(await c.call('me')).data;assert.equal(ordinary.isOwner,false);assert.notEqual(ordinary.user.id,'existing-owner');
 const owner=(await c.call('me?context=owner-setup')).data;assert.equal(owner.canConfigureEmail,true);assert.equal(owner.user.id,'existing-owner');assert.equal((await c.call('email-setup')).status,200);
 const challenge=await c.call('auth/send-verification?context=owner-setup','POST',{});assert.equal(challenge.status,200);assert.deepEqual(t.emails.at(-1).to,[OWNER_EMAIL]);
 assert.equal((await c.call('auth/verify-email?context=owner-setup','POST',{id:challenge.data.id,code:t.code()})).status,200);
 assert.equal((await c.call('me?context=owner-setup')).data.isOwner,true);assert.equal((await c.call('me')).data.user.id,ordinary.user.id);assert.equal((await c.call('admin/users')).status,403);
 const outsider=t.client();await t.login(outsider,'outsider@example.test');assert.equal((await outsider.call('me?context=owner-setup')).data.canConfigureEmail,false);assert.equal((await outsider.call('email-setup')).status,403);
});


test('Resend domain and test-recipient rejections stop retrying and show a safe actionable reason',async()=>{
 for(const [message,expected] of [['The gmail.com domain is not verified.',/domain is not verified/],['You can only send testing emails to your own email address.',/restricted to test recipients/]]){
  const t=setup(),c=t.client();let calls=0;const fetcher=async()=>{calls++;return Response.json({message},{status:403})};
  const result=await c.begin({email:'alice@example.test'},'https://somas.test',fetcher);assert.equal(result.data.delivery,'failed');assert.match(result.data.message,expected);
  t.sqlite.prepare('UPDATE mail_outbox SET next_at=0').run();const status=await c.call('auth/email/status','POST',{id:result.data.id,email:result.data.email},'https://somas.test',fetcher);assert.equal(status.data.delivery,'failed');assert.equal(calls,1);
 }
});
