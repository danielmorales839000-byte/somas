import {fixedEndpointFetch} from './http.mjs';
const utf8=value=>new TextEncoder().encode(value);
const b64=value=>btoa(String.fromCharCode(...utf8(value)));
function mailError(code,message,uncertain=false){const error=new Error(code);error.mailCode=code;error.publicMessage=message;error.uncertain=uncertain;return error}
export async function sendGmail(sender,payload,id,fetcher=fetch){
 let response;
 try{response=await fixedEndpointFetch(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:sender.clientId,client_secret:sender.clientSecret,refresh_token:sender.refreshToken}).toString()})}catch{throw mailError('gmail_network','Google could not be reached. The saved email will retry.')}
 if(!response.ok)throw mailError('gmail_reconnect','Google rejected the sending connection. The owner needs to reconnect Gmail.');
 const token=await response.json();if(!token.access_token)throw mailError('gmail_reconnect','The owner needs to reconnect Gmail.');
 const email=value=>typeof value==='string'&&!/[\r\n<>]/.test(value)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
 if(!email(sender.email)||!email(payload.to)||(payload.replyTo&&!email(payload.replyTo)))throw mailError('mail_address_invalid','The email address is invalid.');
 const message=[`From: SOMAS <${sender.email}>`,`To: ${payload.to}`,...(payload.replyTo?[`Reply-To: ${payload.replyTo}`]:[]),`Subject: =?UTF-8?B?${b64(payload.subject)}?=`,`Message-ID: <somas-${id.replace(/[^A-Za-z0-9-]/g,'')}@somas.invalid>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(payload.text).match(/.{1,76}/g).join('\r\n')].join('\r\n');
 // A lost send response may still mean delivery. Do not automatically replay.
 try{response=await fixedEndpointFetch(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:b64(message).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')})})}catch{throw mailError('gmail_send_uncertain','Google did not confirm delivery. Check your inbox before requesting a new code.',true)}
 if(!response.ok)throw mailError(response.status===429?'gmail_rate_limit':response.status===403?'gmail_permission':'gmail_rejected',response.status===429?'Gmail is busy. Delivery will retry.':response.status===403?'Google did not allow sending. The owner needs to enable Gmail API and approve the send-mail permission.':'Gmail rejected this email. The owner needs to check the connection.');
 let result;try{result=await response.json()}catch{throw mailError('gmail_send_uncertain','Google did not confirm delivery. Check your inbox before requesting a new code.',true)}
 if(!result.id)throw mailError('gmail_send_uncertain','Google did not confirm delivery. Check your inbox before requesting a new code.',true);
 return result;
}
