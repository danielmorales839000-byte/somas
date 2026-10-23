const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function validate(data){if(!data||typeof data!=='object')return 'Invalid submission.';if(typeof data.email!=='string'||data.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))return 'Enter a valid email address.';if(typeof data.message!=='string'||data.message.trim().length<10||data.message.length>4000)return 'Write a message between 10 and 4,000 characters.';if(data.consent!==true)return 'Please agree to storage so we can respond.';if(typeof data.name!=='string'||data.name.length>100)return 'Name is too long.';if(!['AI teams','Network','Both','Collaboration'].includes(data.interest))return 'Choose an interest.';if(typeof data.id!=='string'||! /^[0-9a-f-]{36}$/i.test(data.id))return 'Invalid request identifier.';return null}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function authorized(req,env){const h=req.headers.get('Authorization')||'';if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<20||!h.startsWith('Basic '))return false;let credentials;try{credentials=atob(h.slice(6))}catch{return false}return (await digest(credentials))===(await digest('owner:'+env.ADMIN_PASSWORD))}
const locked=()=>new Response('Owner sign-in required.',{status:401,headers:{'WWW-Authenticate':'Basic realm="SOMAS owner inbox", charset="UTF-8"','Cache-Control':'no-store'}});
export default{async fetch(req,env){const url=new URL(req.url);try{
if(url.pathname==='/api/contact'){
if(req.method!=='POST')return json({error:'Method not allowed.'},405);
if(req.headers.get('Origin')!==url.origin)return json({error:'Submit this form from the SOMAS website.'},403);
if(!req.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
if(Number(req.headers.get('Content-Length'))>20000)return json({error:'Message too large.'},413);
const raw=await req.text();if(new TextEncoder().encode(raw).length>20000)return json({error:'Message too large.'},413);let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid submission.'},400)}
if(data?.website)return json({ok:true});const error=validate(data);if(error)return json({error},400);
if(!env.DB)return json({error:'Feedback is temporarily unavailable. Please email the founder.'},503);
const day=new Date().toISOString().slice(0,10),ip=req.headers.get('CF-Connecting-IP')||'local',key=await digest(day+':'+ip+':'+env.ADMIN_PASSWORD);
if(await env.DB.prepare('SELECT id FROM feedback WHERE id = ?').bind(data.id).first())return json({ok:true});
const rate=await env.DB.prepare('INSERT INTO rate_limits (key, day, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,day).first();if(rate.count>5)return json({error:'Daily message limit reached. Please email the founder or try tomorrow.'},429);
await env.DB.prepare('INSERT OR IGNORE INTO feedback (id,name,email,interest,message,consent,created_at) VALUES (?,?,?,?,?,1,?)').bind(data.id,data.name.trim(),data.email.trim(),data.interest,data.message.trim(),new Date().toISOString()).run();
await env.DB.prepare('DELETE FROM rate_limits WHERE day < ?').bind(day).run();return json({ok:true},201);
}
if(url.pathname==='/owner'||url.pathname.startsWith('/api/owner/')){
if(!await authorized(req,env))return locked();
if(url.pathname==='/owner'){const asset=await env.ASSETS.fetch(new Request(new URL('/inbox.html',url),req));const response=new Response(asset.body,asset);response.headers.set('Cache-Control','no-store');return response;}
if(!env.DB)return json({error:'Database not configured.'},503);
if(url.pathname==='/api/owner/feedback'&&req.method==='GET'){const before=url.searchParams.get('before')||'9999';const rows=await env.DB.prepare('SELECT * FROM feedback WHERE created_at < ? ORDER BY created_at DESC LIMIT 101').bind(before).all();return json({items:rows.results.slice(0,100),next:rows.results.length>100?rows.results[99].created_at:null})}
if(url.pathname==='/api/owner/feedback'&&req.method==='DELETE'){if(req.headers.get('Origin')!==url.origin||req.headers.get('X-SOMAS-Action')!=='delete')return json({error:'Forbidden'},403);await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(url.searchParams.get('id')||'').run();return json({ok:true})}
return json({error:'Not found'},404);
}
if(url.pathname==='/inbox.html')return new Response('Not found',{status:404});
return env.ASSETS.fetch(req);
}catch(error){console.error('SOMAS request failed',error?.name||'Error');return json({error:'Temporarily unavailable. Please try again or email the founder.'},503)}}};
