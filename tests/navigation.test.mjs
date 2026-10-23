import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r))};
function browser({search='',workspace=true,accountDetails={},opinionResponse=null,emailSetup=null,signinSetup=null,signInOptions=null,emailLogin=false,passwordAuth=false,emailLoginError=null,emailDelivery=null,meUnauthorized=false,optionsUnavailable=false,storage=new Map()}={}){const docEvents={},winEvents={},nodes=new Map(),intervals=new Map();let timer=0,pendingProjects=null,workspaceVisible=workspace;const requests=[];const location={pathname:'/',search,origin:'https://somas.test',href:'https://somas.test/'};const get=id=>{if(id==='workspace-root'&&!workspaceVisible)return null;if(!nodes.has(id))nodes.set(id,{dataset:id==='workspace-root'&&passwordAuth?{emailAuthMode:'password',independent:'true'}:{},innerHTML:'',textContent:'',value:'',hidden:true,focus(){this.focused=true},querySelector(){return null}});return nodes.get(id)};const document={getElementById:get,addEventListener(n,fn){(docEvents[n]??=[]).push(fn)}};const window={addEventListener(n,fn){(winEvents[n]??=[]).push(fn)}};const history={pushState(_state,_title,url){const x=new URL(url,location.href);location.search=x.search;location.href=x.href}};const fetch=async (path,options={})=>{requests.push(path);if(path.endsWith('/auth/options')&&optionsUnavailable)return Response.json({error:{message:'Unavailable'}},{status:503});if(path.endsWith('/auth/options'))return Response.json(signInOptions||{providers:['google','microsoft','github'].map(id=>({id,configured:true}))});if(path.endsWith('/auth/email/status')&&emailLogin)return Response.json(emailDelivery||{delivery:'accepted'});if(emailLogin&&path.endsWith('/auth/email/config'))return Response.json({configured:true});if(emailLogin&&path.endsWith('/auth/email/start')&&emailLoginError)return Response.json({error:{message:emailLoginError,code:'email_not_configured'}},{status:503});if(emailLogin&&path.endsWith('/auth/email/start'))return Response.json({id:'fixture-login',email:'alice@example.test',delivery:'queued',expires:Date.now()+15*60000});if(passwordAuth&&path.endsWith('/auth/email/login'))return Response.json({verified:true,next:'/?screen=dashboard'});if(emailLogin&&path.endsWith('/auth/email/verify'))return Response.json({verified:true,next:'/?screen=dashboard'});if(path.endsWith('/signin-setup')&&signinSetup)return Response.json(signinSetup);if(path.endsWith('/email-setup')&&emailSetup)return Response.json(emailSetup);if(path.endsWith('/opinions')&&opinionResponse)return Response.json(options.method==='POST'?opinionResponse:{opinions:[]});if(path.split('?')[0].endsWith('/me')&&meUnauthorized)return Response.json({error:{message:'Sign in'}},{status:401});if(path.split('?')[0].endsWith('/me'))return Response.json({signedIn:true,connected:false,models:[],...accountDetails});if(path.endsWith('/projects')){if(pendingProjects)return pendingProjects;return Response.json({projects:[]})}throw Error('Unexpected request: '+path)};const context=vm.createContext({document,window,location,history,fetch,URL,URLSearchParams,Response,AbortController,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout,clearTimeout,Date,console,setInterval(fn){const n=++timer;intervals.set(n,fn);return n},clearInterval(n){intervals.delete(n)}});vm.runInContext(readFileSync('public/app.js','utf8'),context);return {context,get,intervals,docEvents,winEvents,location,history,requests,setWorkspace(visible){workspaceVisible=visible},async clickConnect(){const button={id:'',dataset:{},hasAttribute:n=>n==='data-open-connect'};await docEvents.click[0]({target:{closest:()=>button},preventDefault(){}})},deferProjects(){let release;pendingProjects=new Promise(r=>release=r);return ()=>{pendingProjects=null;release(Response.json({projects:[]}))}}}}
test('Connect AI opens and focuses the key form without a document reload',async()=>{const b=browser();await flush();assert.match(b.get('app').innerHTML,/data-open-connect/);await b.clickConnect();assert.equal(b.location.search,'?screen=connect');assert.match(b.get('app').innerHTML,/id="groq-key"/);assert.equal(b.get('groq-key').focused,true);assert.equal(b.intervals.size,0)});
test('a dashboard refresh already in flight cannot replace the key form or erase input',async()=>{const b=browser();await flush();const release=b.deferProjects(),refresh=[...b.intervals.values()][0],pending=refresh();await b.clickConnect();const before=b.get('app').innerHTML;b.get('groq-key').value='fixture-only-not-a-real-key';release();await pending;assert.equal(b.get('app').innerHTML,before);assert.equal(b.get('groq-key').value,'fixture-only-not-a-real-key')});
test('soft query navigation and browser Back render the matching screen',async()=>{const b=browser();await flush();b.history.pushState({},'','/?screen=connect');b.winEvents['somas:navigate'][0]();await flush();assert.match(b.get('app').innerHTML,/id="groq-key"/);b.location.search='';b.winEvents.popstate[0]();await flush();assert.match(b.get('app').innerHTML,/Your AI team/);assert.doesNotMatch(b.get('app').innerHTML,/id="groq-key"/)});

test('clicking Connect AI again keeps the entered key',async()=>{const b=browser();await flush();await b.clickConnect();b.get('groq-key').value='fixture-only-not-a-real-key';const before=b.get('app').innerHTML;await b.clickConnect();assert.equal(b.get('app').innerHTML,before);assert.equal(b.get('groq-key').value,'fixture-only-not-a-real-key')});

test('public homepage never starts the workspace API or polling',async()=>{const b=browser({workspace:false});await flush();assert.equal(b.requests.length,0);assert.equal(b.intervals.size,0)});
test('explicit dashboard route continues refreshing projects',async()=>{const b=browser({search:'?screen=dashboard'});await flush();const before=b.requests.filter(x=>x==='/api/projects').length;await [...b.intervals.values()][0]();await [...b.intervals.values()][0]();assert.equal(b.requests.filter(x=>x==='/api/projects').length,before+2);assert.match(b.get('app').innerHTML,/Your AI team/)});
test('returning from the homepage resumes the same workspace route',async()=>{const b=browser({search:'?screen=dashboard'});await flush();b.setWorkspace(false);b.winEvents['somas:suspend'][0]();assert.equal(b.intervals.size,0);const before=b.requests.length;b.setWorkspace(true);b.winEvents['somas:navigate'][0]();await flush();assert.ok(b.requests.length>before);assert.equal(b.intervals.size,1)});
test('ordinary workspace visitors have no Root administration link',async()=>{const b=browser({search:'?screen=dashboard'});await flush();assert.doesNotMatch(b.get('app').innerHTML,/href="\?screen=(root|users)"/);b.history.pushState({},'','/?screen=root');b.winEvents['somas:navigate'][0]();await flush();assert.match(b.get('app').innerHTML,/Administrator access required/);assert.ok(!b.requests.some(x=>x==='/api/root'))});

test('suspended workspace handlers leave public-page keys and forms alone',async()=>{const b=browser();await flush();b.setWorkspace(false);b.winEvents['somas:suspend'][0]();const original=b.get('modal-root').innerHTML;for(const key of ['Escape','Tab'])assert.doesNotThrow(()=>b.docEvents.keydown[0]({key}));let prevented=false;await b.docEvents.submit[0]({preventDefault(){prevented=true}});assert.equal(prevented,false);assert.equal(b.get('modal-root').innerHTML,original)});

test('sign-in from a workspace opens email sign-in and retains the workspace',async()=>{const b=browser({search:'?screen=connect'});await flush();const login=new URL(vm.runInContext('signIn()',b.context),'https://somas.test');assert.equal(login.searchParams.get('screen'),'login');assert.equal(login.searchParams.get('next'),'/?screen=connect')});

test('unverified accounts see verification before any projects or AI work load',async()=>{const b=browser({search:'?screen=dashboard',accountDetails:{verificationRequired:true,emailVerified:false,mailConfigured:false,user:{email:'fixture@example.test'}}});await flush();assert.match(b.get('app').innerHTML,/Verify your account/);assert.match(b.get('app').innerHTML,/Email delivery is not connected/);assert.ok(!b.requests.some(x=>x==='/api/projects'||x==='/api/work'));assert.equal(b.intervals.size,0)});
test('suspended accounts cannot start the dashboard execution loop',async()=>{const b=browser({search:'?screen=dashboard',accountDetails:{status:'suspended',connected:true}});await flush();assert.match(b.get('app').innerHTML,/Account suspended/);assert.ok(!b.requests.some(x=>x==='/api/projects'||x==='/api/work'));assert.equal(b.intervals.size,0)});

test('saving an opinion offers the user email draft without claiming it has been sent',async()=>{
 const b=browser({opinionResponse:{saved:true,notification:'pending_setup',emailDraft:{recipient:'williamkevin999999@gmail.com',senderEmail:'alice@example.test',url:'mailto:williamkevin999999@gmail.com?subject=SOMAS%20opinion&body=Hello',requiresSend:true}}});await flush();
 b.get('opinion-message').value='Please improve the activity display.';
 await b.docEvents.submit[0]({preventDefault(){},target:{id:'opinion-form',querySelector(){return null}}});
 const html=b.get('modal-root').innerHTML;assert.match(html,/Opinion saved/);assert.match(html,/Send from my email/);assert.match(html,/williamkevin999999@gmail.com/);assert.match(html,/alice@example.test/);assert.match(html,/mailto:williamkevin999999@gmail.com/);assert.match(html,/Opening the draft does not send it/);assert.match(html,/notification is queued/);
});

test('locked owner sees the replacement verification inbox and an accessible email setup route',async()=>{
 const accountDetails={verificationRequired:true,emailVerified:false,canConfigureEmail:true,mailConfigured:false,verificationEmail:'williamkevin999999@gmail.com',user:{email:'former@example.test'}};
 const b=browser({accountDetails});await flush();assert.match(b.get('app').innerHTML,/williamkevin999999@gmail.com/);assert.match(b.get('app').innerHTML,/href="\?screen=email-setup"/);assert.doesNotMatch(b.get('app').innerHTML,/former@example.test/);
 const setup=browser({search:'?screen=email-setup',accountDetails,emailSetup:{configured:false,from:'',managed:false,verificationEmail:'williamkevin999999@gmail.com'}});await flush();assert.match(setup.get('app').innerHTML,/Email delivery/);assert.match(setup.get('app').innerHTML,/id="sender-key"[^>]+type="password"/);assert.ok(!setup.requests.includes('/api/projects'));
});
test('ordinary unverified visitors cannot open the owner sender setup',async()=>{
 const b=browser({search:'?screen=email-setup',accountDetails:{verificationRequired:true,emailVerified:false,canConfigureEmail:false}});await flush();assert.match(b.get('app').innerHTML,/Only the existing site owner/);assert.ok(!b.requests.includes('/api/email-setup'));
});

test('email signup has a two-step email/code flow, no password or Manager signup, then opens the workspace',async()=>{
 const b=browser({search:'?screen=login',emailLogin:true});await flush();let html=b.get('app').innerHTML;assert.match(html,/id="email-login-start"/);assert.match(html,/type="email"/);assert.doesNotMatch(html,/type="password"|Become a Manager|Apply as|Continue with ChatGPT/);assert.equal(b.requests.includes('/api/me'),false);
 b.get('signin-email').value='alice@example.test';await b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-start',querySelector(){return null}}});html=b.get('app').innerHTML;assert.match(html,/id="email-login-verify"/);assert.match(html,/Verification code/);assert.match(html,/Verify →/);assert.ok(b.get('signin-code').focused);
 b.get('signin-code').value='12345678';await b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-verify',querySelector(){return null}}});assert.equal(b.location.href,'/?screen=dashboard');
});


test('signup renders immediately without sender setup and Continue submits even when delivery is unavailable',async()=>{
 const b=browser({search:'?screen=signup',emailLogin:true,emailLoginError:'We couldn’t send your code. Please try again later.'});
 // No configuration request can delay or disable the public form.
 let html=b.get('app').innerHTML;
 assert.match(html,/<button class="primary" type="submit">Continue →<\/button>/);
 assert.doesNotMatch(html,/Service owner setup|site owner|connect a sender|signin-with-chatgpt/);
 assert.deepEqual(b.requests,[]);
 const button={disabled:false};b.get('signin-email').value='alice@example.test';
 const submit=()=>b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-start',querySelector(){return button}}});
 const pending=submit();assert.equal(button.disabled,true);await pending;
 assert.equal(button.disabled,false);assert.match(b.get('form-error').textContent,/couldn’t send your code/);
 assert.equal(b.get('signin-email').value,'alice@example.test');
 assert.doesNotMatch(b.get('app').innerHTML,/email-login-verify/);
 assert.ok(!b.requests.includes('/api/auth/email/config'));
 b.get('form-error').textContent='Previous error';const retry=submit();assert.equal(b.get('form-error').textContent,'');await retry;
 assert.equal(b.requests.filter(x=>x==='/api/auth/email/start').length,2);
});


test('social account verification opens the workspace without falsely requiring a Microsoft mailbox code',async()=>{
 const b=browser({search:'?screen=dashboard',accountDetails:{accountVerified:true,emailVerified:false,verificationRequired:true,authMethod:'microsoft'}});await flush();assert.match(b.get('app').innerHTML,/Your AI team/);assert.doesNotMatch(b.get('app').innerHTML,/Verify your account/);assert.ok(b.requests.includes('/api/projects'));
});


test('pending delivery is not claimed as sent and status updates preserve a typed code',async()=>{
 const b=browser({search:'?screen=login',emailLogin:true,emailDelivery:{delivery:'accepted',message:''}});await flush();b.get('signin-email').value='alice@example.test';await b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-start',querySelector(){return null}}});assert.match(b.get('app').innerHTML,/Sending your code/);assert.doesNotMatch(b.get('app').innerHTML,/Check your email/);b.get('signin-code').value='1234';await [...b.intervals.values()][0]();await flush();assert.equal(b.get('signin-code').value,'1234');assert.equal(b.get('signin-heading').textContent,'Check your email.');assert.equal(b.intervals.size,0);
});
test('connected Google enables the Gmail consent button only on owner email setup',async()=>{
 const b=browser({search:'?screen=email-setup',accountDetails:{canConfigureEmail:true,emailVerified:false},emailSetup:{googleConfigured:true,configured:false,provider:'resend',from:''}});await flush();assert.match(b.get('app').innerHTML,/href="\/api\/auth\/oauth\/google\/start\?purpose=gmail"/);assert.match(b.get('app').innerHTML,/Connect Gmail/);assert.match(b.get('app').innerHTML,/placeholder="Leave blank to keep the saved secret"/);
});


test('refresh restores a pending email challenge without storing the typed verification code',async()=>{
 const storage=new Map(),b=browser({search:'?screen=login',emailLogin:true,storage});await flush();b.get('signin-email').value='alice@example.test';
 await b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-start',querySelector(){return null}}});await flush();b.get('signin-code').value='12345678';
 assert.equal(storage.size,1);assert.ok(![...storage.values()][0].includes('12345678'));
 const restored=browser({search:'?screen=login',storage});await flush();assert.match(restored.get('app').innerHTML,/email-login-verify/);assert.match(restored.get('app').innerHTML,/alice@example.test/);assert.equal(restored.get('signin-code').value,'');assert.ok(!restored.requests.includes('/api/auth/email/start'));
});
test('expired stored challenges are cleared instead of restoring an unusable code form',async()=>{
 const storage=new Map([['somas.email-login.v1',JSON.stringify({email:'alice@example.test',challenge:{id:'expired',delivery:'accepted',expires:Date.now()-1000}})]]);
 const b=browser({search:'?screen=login',storage});await flush();assert.match(b.get('app').innerHTML,/email-login-start/);assert.equal(storage.size,0);
});
test('slow signup responses cannot replace another page and duplicate form submissions share one request',async()=>{
 const storage=new Map(),b=browser({search:'?screen=login',emailLogin:true,storage});await flush();const original=b.context.fetch;let release,count=0;
 b.context.fetch=(path,options)=>{if(path==='/api/auth/email/start'){count++;return new Promise(resolve=>release=resolve)}return original(path,options)};
 const button={disabled:false},form={id:'email-login-start',querySelector(){return button}},event={preventDefault(){},target:form};b.get('signin-email').value='alice@example.test';
 const pending=b.docEvents.submit[0](event);await b.docEvents.submit[0](event);assert.equal(count,1);assert.equal(button.disabled,true);
 b.location.search='?screen=connect';b.winEvents.popstate[0]();await flush();const html=b.get('app').innerHTML;
 release(Response.json({id:'delayed-request',email:'alice@example.test',delivery:'queued',expires:Date.now()+15*60000}));await pending;
 assert.equal(b.get('app').innerHTML,html);assert.equal(storage.size,0);assert.equal(button.disabled,false);
});
test('changing email discards the saved challenge and ignores an old delivery response',async()=>{
 const storage=new Map(),b=browser({search:'?screen=login',emailLogin:true,storage});await flush();const original=b.context.fetch;let release;
 b.context.fetch=(path,options)=>path==='/api/auth/email/status'?new Promise(resolve=>release=resolve):original(path,options);
 b.get('signin-email').value='alice@example.test';await b.docEvents.submit[0]({preventDefault(){},target:{id:'email-login-start',querySelector(){return null}}});
 const change={id:'change-login-email',dataset:{}};await b.docEvents.click[0]({target:{closest:()=>change},preventDefault(){}});const html=b.get('app').innerHTML;assert.match(html,/email-login-start/);assert.equal(storage.size,0);
 release(Response.json({delivery:'accepted'}));await flush();assert.equal(b.get('app').innerHTML,html);assert.equal(storage.size,0);
});
test('signed-out workspace routes lead to sign-in and preserve their destination',async()=>{
 const b=browser({search:'?screen=new',meUnauthorized:true});await flush();assert.equal(b.location.href,'/?screen=login&next='+encodeURIComponent('/?screen=new'));assert.ok(!b.requests.includes('/api/projects'));
});


test('a timed-out Continue request releases the button and preserves the entered email',async()=>{
 const b=browser({search:'?screen=login',emailLogin:true});await flush();const original=b.context.fetch;let timeout;
 b.context.setTimeout=fn=>{timeout=fn;return 999};b.context.clearTimeout=()=>{};
 b.context.fetch=(path,options)=>path==='/api/auth/email/start'?new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))):original(path,options);
 const button={disabled:false},form={id:'email-login-start',querySelector(){return button}};b.get('signin-email').value='alice@example.test';
 const pending=b.docEvents.submit[0]({preventDefault(){},target:form});assert.equal(button.disabled,true);timeout();await pending;
 assert.equal(button.disabled,false);assert.equal(b.get('signin-email').value,'alice@example.test');assert.match(b.get('form-error').textContent,/timed out/);assert.doesNotMatch(b.get('app').innerHTML,/email-login-verify/);
});


test('signup and login expose only the email code form, with no social buttons or availability calls',async()=>{
 for(const screen of ['signup','login']){const b=browser({search:'?screen='+screen});await flush();const html=b.get('app').innerHTML;assert.match(html,/8-digit verification code/);assert.match(html,/email-login-start/);assert.doesNotMatch(html,/Continue with|Google|Microsoft|GitHub|social-options|signin-setup/);assert.deepEqual(b.requests,[])}
});
test('owner email setup remains accessible without a mailbox code and old provider links redirect to it',async()=>{
 const b=browser({search:'?screen=email-setup',accountDetails:{canConfigureEmail:true,emailVerified:false,verificationRequired:true},emailSetup:{configured:false,provider:'resend',from:''}});await flush();assert.match(b.get('app').innerHTML,/Email delivery/);assert.match(b.get('app').innerHTML,/gmail-app-form/);assert.ok(!b.requests.includes('/api/projects'));
 const old=browser({search:'?screen=signin-setup'});await flush();assert.equal(old.location.href,'/?screen=email-setup');
 const anonymous=browser({search:'?screen=email-setup',meUnauthorized:true});await flush();assert.match(anonymous.get('app').innerHTML,/OWNER EMAIL SETTINGS/);assert.ok(anonymous.get('app').innerHTML.includes('/signin-with-chatgpt?return_to='+encodeURIComponent('/?screen=email-setup')));
});


test('independent login uses a password and never requests an email code',async()=>{
 const b=browser({search:'?screen=login',emailLogin:true,passwordAuth:true});await flush();assert.match(b.get('app').innerHTML,/id="password-login"/);assert.match(b.get('app').innerHTML,/autocomplete="current-password"/);assert.doesNotMatch(b.get('app').innerHTML,/id="email-login-start"|No password needed/);
 b.get('signin-email').value='alice@example.test';b.get('signin-password').value='a sufficiently long password';await b.docEvents.submit[0]({preventDefault(){},target:{id:'password-login',querySelector(){return null}}});
 assert.equal(b.location.href,'/?screen=dashboard');assert.deepEqual(b.requests,['/api/auth/email/login']);
});

test('independent signup takes a new password and then opens the verification step',async()=>{
 const storage=new Map(),b=browser({search:'?screen=signup',emailLogin:true,passwordAuth:true,storage});await flush();assert.match(b.get('app').innerHTML,/id="password-signup"/);assert.match(b.get('app').innerHTML,/autocomplete="new-password"/);
 b.get('signin-email').value='alice@example.test';b.get('signin-password').value='a sufficiently long password';await b.docEvents.submit[0]({preventDefault(){},target:{id:'password-signup',querySelector(){return null}}});
 assert.match(b.get('app').innerHTML,/id="email-login-verify"/);assert.ok(!JSON.stringify([...storage]).includes('sufficiently'));assert.ok(!b.requests.includes('/api/auth/email/login'));
});
