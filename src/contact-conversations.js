import {database} from './database.js';
import {accessUser,staff,v4} from './access.js';
import {json,payload,requireThat,rateLimit} from './community.js';
import {notifyOwner} from './owner-notifications.js';
import {sendMail} from './google.js';
export async function contactConversations(req,env){
 const sql=database(env),user=await accessUser(req,sql,env);requireThat(v4(env)&&user&&user.verified_at,'verified_sign_in_required',401);
 const isStaff=staff(user,env),url=new URL(req.url);
 if(url.pathname==='/api/contact/conversations'&&req.method==='GET'){
  const threads=await sql`SELECT id,kind,payload->>'subject' AS subject,payload->>'message' AS message,payload->>'name' AS name,created_at FROM public_submissions WHERE kind='contact' AND lower(payload->>'email')=lower(${user.email}) ORDER BY created_at DESC LIMIT 50`;
  return json({threads,limit:50});
 }
 const id=url.pathname.match(/^\/api\/contact\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];requireThat(id,'not_found',404);
 const [thread]=await sql`SELECT id,payload,created_at FROM public_submissions WHERE id=${id}::uuid AND kind='contact' AND (${isStaff} OR lower(payload->>'email')=lower(${user.email}))`;
 requireThat(thread,'conversation_not_found',404);
 if(req.method==='GET'){
  const before=url.searchParams.get('before')||'9999-12-31T23:59:59Z';requireThat(Number.isFinite(Date.parse(before)),'invalid_cursor');
  const rows=await sql`SELECT id,body,from_staff,created_at FROM contact_replies WHERE submission_id=${id}::uuid AND created_at<${before}::timestamptz ORDER BY created_at DESC,id DESC LIMIT 101`;
  const more=rows.length>100;return json({thread:{id:thread.id,subject:thread.payload.subject,message:thread.payload.message,name:thread.payload.name,created_at:thread.created_at},replies:rows.slice(0,100).reverse(),next:more?rows[99].created_at:null});
 }
 if(req.method==='POST'){
  const p=await payload(req);requireThat(typeof p.body==='string'&&p.body.trim().length>=2&&p.body.trim().length<=5000,'invalid_message');await rateLimit(sql,'contact-reply:'+user.id,30);
  const rid=crypto.randomUUID();await sql`INSERT INTO contact_replies(id,submission_id,sender_user_id,from_staff,body) VALUES(${rid}::uuid,${id}::uuid,${user.id},${isStaff},${p.body.trim()})`;
  let notification;
  if(isStaff){try{await sendMail(sql,env,thread.payload.email,'SOMAS · Reply to your message',p.body.trim()+'\n\nSign into SOMAS Contact Us to see your private conversation.');notification='accepted';}catch{notification='failed';}}
  else notification=await notifyOwner(sql,env,'New private conversation reply',p.body.trim());
  return json({saved:true,id:rid,notification},201);
 }
 return json({error:'method_not_allowed'},405);
}
