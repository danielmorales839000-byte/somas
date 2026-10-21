/** Paddle integration prepared for a merchant-approved checkout. Never accept client billing status. */
const encoder=new TextEncoder();
export async function verifyPaddleSignature(body,header,secret,nowSeconds=Math.floor(Date.now()/1000)) {
  if(!secret||!header||!body)return false;
  const m=header.match(/(?:^|;)\s*ts=(\d{9,12})(?:;|$)/);
  const h=header.match(/(?:^|;)\s*h1=([0-9a-f]{64})(?:;|$)/i);
  if(!m||!h)return false;
  const ts=Number(m[1]);if(Math.abs(nowSeconds-ts)>300)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${m[1]}:${body}`)));
  const expected=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(expected.length!==h[1].length)return false;
  let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^h[1].toLowerCase().charCodeAt(i);
  return mismatch===0;
}
export function paddleStatusToSomas(status){
  return ({active:'active',trialing:'trial',past_due:'past_due',canceled:'canceled',paused:'suspended'})[status]||null;
}
export async function createPaddleCheckout(env,workspaceId){
  if(!env.PADDLE_API_KEY||!env.PADDLE_PRICE_ID)throw new Error('billing_not_configured');
  const base=env.PADDLE_SANDBOX==='true'?'https://sandbox-api.paddle.com':'https://api.paddle.com';
  const response=await fetch(`${base}/transactions`,{
    method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.PADDLE_API_KEY}`},
    body:JSON.stringify({items:[{price_id:env.PADDLE_PRICE_ID,quantity:1}],collection_mode:'automatic',custom_data:{workspace_id:workspaceId}})
  });
  if(!response.ok)throw new Error(`paddle_checkout_http_${response.status}`);
  const result=await response.json();
  const checkoutUrl=result?.data?.checkout?.url;
  if(typeof checkoutUrl!=='string'||!checkoutUrl.startsWith('https://'))throw new Error('paddle_default_payment_link_required');
  return checkoutUrl;
}
