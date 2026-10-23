// Short-lived, audience-bound tickets. Redemption and sessions live in the
// project's Durable Object; SOMAS cookies never cross root-domain boundaries.
export async function signature(secret,value){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function mintTeamTicket(secret,project,host){
 const payload=btoa(JSON.stringify({project,host,expires:Date.now()+60000,nonce:crypto.randomUUID()}));
 return payload+'.'+await signature(secret,'team-access:'+payload);
}
export async function verifyTeamTicket(secret,ticket,project,host){
 try{const [payload,mac,...extra]=String(ticket).split('.');if(extra.length||!mac||!(/^[a-f0-9]{64}$/).test(mac))return null;
 const expected=await signature(secret,'team-access:'+payload);let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^mac.charCodeAt(i);if(diff)return null;
 const x=JSON.parse(atob(payload));return x.project===project&&x.host===host&&typeof x.nonce==='string'&&Number.isFinite(x.expires)&&x.expires>Date.now()&&x.expires<=Date.now()+65000?x:null;
 }catch{return null}
}
