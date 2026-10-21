const enc=new TextEncoder();
function hex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function randomToken(bytes=32){const array=new Uint8Array(bytes);crypto.getRandomValues(array);return [...array].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function sha256(text){return hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));}
export async function derivePassword(password,salt,iterations=120000){
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations,hash:'SHA-256'},key,256));
}
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>128) throw new Error('password_must_be_12_to_128_chars');
  const salt=randomToken(16);return `pbkdf2-sha256$120000$${salt}$${await derivePassword(password,salt)}`;
}
export async function verifyPassword(password,stored){
  if(typeof stored!=='string'||!/^pbkdf2-sha256\$\d+\$[0-9a-f]+\$[0-9a-f]+$/.test(stored)) return false;
  const [algorithm,iter,salt,expected]=stored.split('$');
  const iterations=Number(iter);if(iterations<50000||iterations>300000) return false;
  const actual=await derivePassword(password,salt,iterations);
  if(actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export function cookieForSession(token,url,maxAgeSeconds=604800){
  const secure=new URL(url).protocol==='https:'?'; Secure':'';
  return `somas_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}
export function clearCookie(url){return cookieForSession('',url,0);}
export function sessionCookie(request){return /(?:^|;\s*)somas_session=([0-9a-f]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1]||null;}
export function checkMutationOrigin(request){
  if(['GET','HEAD','OPTIONS'].includes(request.method))return true;
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return false;
  return request.headers.get('x-somas-request')==='1';
}
