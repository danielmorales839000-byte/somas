export async function notifyOwner(sql,env,subject,body,deliver){
 if(!env.SOMAS_OWNER_EMAIL)return 'not_configured';
 try{const send=deliver||(await import('./google.js')).sendMail;await send(sql,env,env.SOMAS_OWNER_EMAIL,'SOMAS · '+subject,body);return 'accepted';}
 catch{return 'failed';}
}
