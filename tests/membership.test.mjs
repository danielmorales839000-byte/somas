import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/database.mjs';
import {handleAPI} from '../lib/server.mjs';
import {OWNER_EMAIL,drainMail} from '../lib/membership.mjs';
import {shareKit} from '../public/share-content.mjs';
function setup(){
 const {sqlite,db}=testDatabase(),emails=[];
 const env={DB:db,SOMAS_ADMIN_USER_ID:'owner',APP_DATA_KEY:'fixture-membership-encryption-only',RESEND_API_KEY:'fixture-email-key',MAIL_FROM:'SOMAS <hello@example.test>'};
 const mailFetcher=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return Response.json({id:'fixture-email-'+emails.length})};
 const emailFor=id=>id==='owner'?OWNER_EMAIL:id+'@example.test';
 async function call(path,method='GET',data,id='alice',email=emailFor(id),mail=mailFetcher){const headers={'oai-authenticated-user-id':id,'oai-authenticated-user-email':email,'oai-authenticated-user-full-name':id,Origin:'https://somas.test'};if(data)headers['Content-Type']='application/json';const r=await handleAPI(new Request('https://somas.test/api/'+path,{method,headers,body:data?JSON.stringify(data):undefined}),env,{mailFetcher:mail});return{status:r.status,data:await r.json()}}
 const code=()=>emails.at(-1).body.text.match(/Verification code: (\d{8})/)[1];
 async function verify(id='alice'){const sent=await call('auth/send-verification','POST',{},id);assert.equal(sent.status,200);return call('auth/verify-email','POST',{id:sent.data.id,code:code()},id)}
 return{env,sqlite,db,emails,call,code,verify,mailFetcher};
}

test('signup verification gates workspace; codes are private, single-use and bound to an account',async()=>{
 const t=setup();assert.equal((await t.call('me')).data.emailVerified,false);assert.equal((await t.call('projects','POST',{requirement:'Build a site for my restaurant.'})).status,403);
 const sent=await t.call('auth/send-verification','POST',{}),value=t.code();assert.equal(sent.status,200);assert.equal(t.emails[0].body.to[0],'alice@example.test');assert.equal(t.emails[0].body.from,t.env.MAIL_FROM);assert.ok(!JSON.stringify(sent.data).includes(value));
 const stored=t.sqlite.prepare('SELECT * FROM verification_challenges WHERE id=?').get(sent.data.id);assert.notEqual(stored.code_hash,value);assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:value},'bob')).status,400);
 assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:value})).status,200);assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:value})).status,400);assert.equal((await t.call('me')).data.emailVerified,true);
 assert.equal((await t.call('projects','POST',{requirement:'Build a site for my restaurant.'})).status,201);
});
test('verification expires, has an attempt limit, throttles resends, and resets when the signed-in email changes',async()=>{
 const t=setup(),sent=await t.call('auth/send-verification','POST',{});assert.equal((await t.call('auth/send-verification','POST',{})).status,429);
 for(let i=0;i<5;i++)assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:'not-code'})).status,400);
 for(let i=0;i<5;i++)assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:'wrong000'})).status,400);
 // Valid-shaped wrong values consume attempts, without depending on a random generated value.
 const wrong=t.code()==='00000000'?'11111111':'00000000';for(let i=0;i<5;i++)assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:wrong})).status,400);
 assert.equal((await t.call('auth/verify-email','POST',{id:sent.data.id,code:t.code()})).status,400);
 const u=setup(),s=await u.call('auth/send-verification','POST',{});u.sqlite.prepare('UPDATE verification_challenges SET expires=0 WHERE id=?').run(s.data.id);assert.equal((await u.call('auth/verify-email','POST',{id:s.data.id,code:u.code()})).status,400);
 const v=setup();await v.verify();assert.equal((await v.call('me','GET',null,'alice','changed@example.test')).data.emailVerified,false);
});
test('manager applicants never receive the owner code and cannot approve themselves',async()=>{
 const t=setup();await t.verify();await t.verify('owner');const request=await t.call('manager-request','POST',{reason:'I will moderate and support this service.'});const code=t.code();assert.equal(request.status,201);assert.deepEqual(t.emails.at(-1).body.to,[OWNER_EMAIL]);assert.ok(!JSON.stringify(request.data).includes(code));
 assert.equal((await t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code})).status,403);
 const bad=code==='00000000'?'11111111':'00000000';assert.equal((await t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code:bad},'owner')).status,400);
 assert.equal((await t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code},'owner')).status,200);assert.equal((await t.call('me')).data.isAdmin,true);
 assert.equal((await t.call('admin/users')).status,200);assert.equal((await t.call('admin/manager-requests')).status,403);
 assert.equal((await t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code},'owner')).status,404);
 assert.equal((await t.call('admin/users/alice/access','POST',{action:'revoke-manager'},'owner')).status,200);assert.equal((await t.call('admin/users')).status,403);
});
test('manager approvals are bound to the exact applicant; only configured owner identity and mailbox can approve',async()=>{
 const t=setup();await t.verify();await t.verify('bob');await t.verify('owner');const a=await t.call('manager-request','POST',{reason:'I want to manage community reports.'});const aCode=t.code();const b=await t.call('manager-request','POST',{reason:'I want to help with support requests.'},'bob');
 assert.equal((await t.call('admin/manager-requests/'+b.data.id,'POST',{action:'approve',code:aCode},'owner')).status,400);
 assert.equal((await t.call('admin/manager-requests/'+a.data.id,'POST',{action:'approve',code:aCode},'owner','wrong@example.test')).status,403);
 assert.equal((await t.call('me','GET',null,'bob',OWNER_EMAIL)).data.isOwner,false);
});
test('the replacement owner mailbox receives approvals and the old mailbox no longer grants ownership',async()=>{
 assert.equal(OWNER_EMAIL,'williamkevin999999@gmail.com');
 const t=setup();await t.verify('owner');assert.equal((await t.call('me','GET',null,'owner')).data.isOwner,true);
 const previous=await t.call('me','GET',null,'owner','danielmorales839000@gmail.com');assert.equal(previous.data.isOwner,false);assert.equal(previous.data.isAdmin,false);assert.equal(previous.data.emailVerified,false);
});
test('suspension blocks work and protected operations; owner cannot be suspended',async()=>{
 const t=setup();await t.verify();await t.verify('owner');assert.equal((await t.call('admin/users/owner/access','POST',{action:'suspend'},'owner')).status,403);
 assert.equal((await t.call('admin/users/alice/access','POST',{action:'suspend'},'owner')).status,200);assert.equal((await t.call('projects')).data.error.code,'account_suspended');assert.equal((await t.call('auth/send-verification','POST',{})).status,403);
 assert.equal((await t.call('admin/users/alice/access','POST',{action:'activate'},'owner')).status,200);assert.equal((await t.call('projects')).status,200);
});
test('opinions email the owner with verified submitter Reply-To, retaining a retryable encrypted notification',async()=>{
 const t=setup();await t.verify();const opinion=await t.call('opinions','POST',{message:'Please make the team activity easier to understand.'});assert.equal(opinion.status,201);assert.equal(opinion.data.notification,'accepted');const draft=opinion.data.emailDraft;assert.equal(draft.recipient,'williamkevin999999@gmail.com');assert.equal(draft.senderEmail,'alice@example.test');assert.equal(draft.requiresSend,true);const link=new URL(draft.url);assert.equal(link.protocol,'mailto:');assert.equal(link.pathname,draft.recipient);assert.equal(link.searchParams.get('subject'),'SOMAS opinion');assert.match(link.searchParams.get('body'),/Please make the team activity easier to understand/);assert.equal(link.searchParams.has('from'),false);const mail=t.emails.at(-1).body;assert.deepEqual(mail.to,[OWNER_EMAIL]);assert.equal(mail.reply_to,'alice@example.test');assert.equal(mail.from,t.env.MAIL_FROM);assert.ok(mail.text.includes('Please make'));
 const u=setup();await u.verify();let attempts=0;const failure=async()=>{attempts++;throw Error('temporary transport failure')};const queued=await u.call('opinions','POST',{message:'Please improve the dashboard.'},'alice',undefined,failure);assert.equal(queued.status,201);assert.equal(queued.data.notification,'retry');assert.equal(u.sqlite.prepare('SELECT COUNT(*) n FROM opinions').get().n,1);const row=u.sqlite.prepare("SELECT * FROM mail_outbox WHERE kind='opinion'").get();assert.ok(!row.payload.includes('Please improve'));u.sqlite.prepare('UPDATE mail_outbox SET next_at=0 WHERE id=?').run(row.id);await drainMail(u.env,u.mailFetcher);assert.equal(u.emails.at(-1).key,'somas/'+row.id);assert.equal(u.sqlite.prepare('SELECT status FROM mail_outbox WHERE id=?').get(row.id).status,'accepted');
});
test('missing email setup is explicit and never silently verifies a user or loses an opinion',async()=>{
 const t=setup();delete t.env.RESEND_API_KEY;assert.equal((await t.call('auth/send-verification','POST',{})).data.error.code,'email_not_configured');assert.equal((await t.call('me')).data.emailVerified,false);assert.equal(t.emails.length,0);
 t.env.RESEND_API_KEY='fixture';await t.verify();delete t.env.RESEND_API_KEY;const r=await t.call('opinions','POST',{message:'Please connect the email sender.'});assert.equal(r.data.notification,'pending_setup');assert.equal(t.sqlite.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status='queued'").get().n,1);
});
test('activities are admin-only, paginated, and never contain verification codes or provider keys',async()=>{
 const t=setup();await t.verify();await t.verify('owner');await t.call('activity','POST',{screen:'share',platform:'x'});assert.equal((await t.call('admin/activity')).status,403);const feed=await t.call('admin/activity','GET',null,'owner');assert.equal(feed.status,200);assert.ok(feed.data.events.some(e=>e.action==='share.open'&&e.resource==='x'));assert.ok(!JSON.stringify(feed.data).includes(t.code()));assert.ok(!JSON.stringify(feed.data).includes(t.env.RESEND_API_KEY));assert.equal((await t.call('admin/mail')).status,403);
 for(let i=0;i<105;i++)t.sqlite.prepare('INSERT INTO activity VALUES(?,?,?,?,?,?)').run('page-'+String(i).padStart(4,'0'),'alice','page.view','dashboard',200,Date.now()+1000);
 const first=(await t.call('admin/activity?user=alice','GET',null,'owner')).data;assert.equal(first.events.length,100);assert.ok(first.next);const second=(await t.call('admin/activity?user=alice&cursor='+encodeURIComponent(first.next),'GET',null,'owner')).data;assert.ok(second.events.length>=5);assert.ok(second.events.every(e=>!first.events.some(x=>x.id===e.id)));
});
test('social share descriptions use only the public homepage and accurately distinguish the Network concept',()=>{
 const kit=shareKit('https://somas.test/?business=private-project&secret=private');assert.equal(kit.url,'https://somas.test/');assert.ok(!kit.caption.includes('private'));assert.match(kit.caption,/proposed SOMAS Network/);assert.match(kit.caption,/Network research concept/);assert.equal(kit.channels.length,8);assert.match(kit.channels.find(c=>c.id==='youtube').mode,/Copy/);assert.throws(()=>shareKit('javascript:alert(1)'));
});

test('concurrent approval and email verification consume their codes once',async()=>{
 const t=setup(),sent=await t.call('auth/send-verification','POST',{}),code=t.code();const checked=await Promise.all([t.call('auth/verify-email','POST',{id:sent.data.id,code}),t.call('auth/verify-email','POST',{id:sent.data.id,code})]);assert.equal(checked.filter(r=>r.status===200).length,1);
 await t.verify('owner');const request=await t.call('manager-request','POST',{reason:'I can assist with moderation requests.'}),approvalCode=t.code();const approved=await Promise.all([t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code:approvalCode},'owner'),t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code:approvalCode},'owner')]);assert.equal(approved.filter(r=>r.status===200).length,1);assert.equal((await t.call('me')).data.isAdmin,true);
});

test('approved human Managers can manage ordinary users and project execution, but cannot change owner access or approve managers',async()=>{
 const t=setup();await t.verify();await t.verify('owner');await t.verify('bob');const request=await t.call('manager-request','POST',{reason:'I will help review users and support projects.'});await t.call('admin/manager-requests/'+request.data.id,'POST',{action:'approve',code:t.code()},'owner');
 const project=(await t.call('projects','POST',{requirement:'Build a school website for our community.'},'bob')).data.project;
 assert.equal((await t.call('projects/'+project.id)).data.project.readOnly,true);
 assert.equal((await t.call('admin/projects/'+project.id+'/control','POST',{action:'pause'})).status,200);assert.equal(t.sqlite.prepare('SELECT paused FROM projects WHERE id=?').get(project.id).paused,1);
 assert.equal((await t.call('admin/projects/'+project.id+'/control','POST',{action:'resume'})).status,200);assert.equal(t.sqlite.prepare('SELECT paused FROM projects WHERE id=?').get(project.id).paused,0);
 assert.equal((await t.call('admin/users/bob/access','POST',{action:'suspend'})).status,200);assert.equal((await t.call('admin/projects/'+project.id+'/control','POST',{action:'resume'})).status,409);
 assert.equal((await t.call('admin/users/owner/access','POST',{action:'suspend'})).status,403);assert.equal((await t.call('admin/users/alice/access','POST',{action:'revoke-manager'})).status,403);
 assert.equal((await t.call('root')).data.project.readOnly,true);
 assert.equal((await t.call('admin/manager-requests')).status,403);
});

test('public sharing works anonymously without creating identities; verified sharing records only its platform',async()=>{
 const t=setup(),anonymous=await handleAPI(new Request('https://somas.test/api/share-event',{method:'POST',headers:{Origin:'https://somas.test','Content-Type':'application/json'},body:JSON.stringify({platform:'facebook'})}),t.env);assert.equal(anonymous.status,200);assert.equal((await anonymous.json()).recorded,false);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
 await t.verify();const r=await t.call('share-event','POST',{platform:'instagram'});assert.equal(r.data.recorded,true);assert.ok(t.sqlite.prepare("SELECT id FROM activity WHERE action='share.open' AND resource='instagram'").get());
});


test('owner can securely connect a sender before verification and verify the new inbox while signed in with the former address',async()=>{
 const t=setup();delete t.env.RESEND_API_KEY;delete t.env.MAIL_FROM;
 const ownerCall=(path,method='GET',data)=>t.call(path,method,data,'owner','danielmorales839000@gmail.com');
 let me=(await ownerCall('me')).data;assert.equal(me.canConfigureEmail,true);assert.equal(me.isOwner,false);assert.equal(me.verificationEmail,OWNER_EMAIL);
 assert.equal((await ownerCall('admin/users')).status,403);assert.equal((await ownerCall('projects')).status,403);
 const key='re_fixture_sender_connection_key',from='SOMAS <hello@example.test>';
 const saved=await ownerCall('email-setup','POST',{key,from});assert.equal(saved.status,200);assert.ok(!JSON.stringify(saved.data).includes(key));
 const row=t.sqlite.prepare('SELECT secret FROM email_sender').get();assert.ok(row.secret);assert.ok(!row.secret.includes(key));assert.ok(!row.secret.includes(from));
 const config=(await ownerCall('email-setup')).data;assert.equal(config.from,from);assert.equal(config.configured,true);assert.ok(!JSON.stringify(config).includes(key));
 const sent=await ownerCall('auth/send-verification','POST',{});assert.equal(sent.data.delivery,'accepted');assert.deepEqual(t.emails.at(-1).body.to,[OWNER_EMAIL]);
 assert.equal((await ownerCall('auth/verify-email','POST',{id:sent.data.id,code:t.code()})).status,200);
 me=(await ownerCall('me')).data;assert.equal(me.emailVerified,true);assert.equal(me.isOwner,true);assert.equal(me.user.email,'danielmorales839000@gmail.com');
 const opinion=await ownerCall('opinions','POST',{message:'Please make signup simpler.'});assert.equal(opinion.data.emailDraft.senderEmail,OWNER_EMAIL);assert.equal(t.emails.at(-1).body.reply_to,OWNER_EMAIL);
 assert.equal((await ownerCall('admin/users')).status,200);assert.ok(!JSON.stringify((await ownerCall('admin/activity')).data).includes(key));
});

test('sender setup never grants ordinary users access or bypasses verification and rejects malformed credentials',async()=>{
 const t=setup();delete t.env.RESEND_API_KEY;delete t.env.MAIL_FROM;
 assert.equal((await t.call('email-setup')).status,403);assert.equal((await t.call('email-setup','POST',{key:'re_fixture_sender_connection_key',from:'hello@example.test'},'alice',OWNER_EMAIL)).status,403);
 const ownerCall=data=>t.call('email-setup','POST',data,'owner');
 assert.equal((await ownerCall({key:'bad',from:'hello@example.test'})).status,400);
 assert.equal((await ownerCall({key:'re_fixture_sender_connection_key',from:'hello@example.test\r\nBcc: other@example.test'})).status,400);
 assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sender').get().n,0);
 const blocked=await handleAPI(new Request('https://somas.test/api/email-setup',{method:'POST',headers:{'oai-authenticated-user-id':'owner',Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify({key:'re_fixture_sender_connection_key',from:'hello@example.test'})}),t.env);assert.equal(blocked.status,403);
 assert.equal((await t.call('projects')).status,403);
});

test('provider authorization failures explain sender setup without leaking credentials or claiming delivery',async()=>{
 const t=setup(),r=await t.call('auth/send-verification','POST',{},'owner',undefined,async()=>Response.json({message:'secret-provider-response'},{status:403}));
 assert.equal(r.data.delivery,'failed');assert.match(r.data.message,/verify the sending domain/);assert.ok(!JSON.stringify(r.data).includes('secret-provider-response'));assert.equal((await t.call('me','GET',null,'owner')).data.emailVerified,false);
});
