import {api} from './community.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderContactThread(host,id){
 host.textContent='Loading conversation…';
 try{
  const data=await api('/api/contact/conversations/'+id);
  host.innerHTML=`<h3>${esc(data.thread.subject||'Your message')}</h3><div class="private-message-log" aria-label="Private conversation"><article class="message-bubble"><strong>${esc(data.thread.name||'Visitor')}</strong><small>${esc(new Date(data.thread.created_at).toLocaleString())}</small><p>${esc(data.thread.message)}</p></article>${data.replies.map(r=>`<article class="message-bubble ${r.from_staff?'staff-message':''}"><strong>${r.from_staff?'SOMAS team':'Visitor'}</strong><small>${esc(new Date(r.created_at).toLocaleString())}</small><p>${esc(r.body)}</p></article>`).join('')}</div>${data.next?'<p class="fine">Showing the latest 100 replies.</p>':''}<form class="private-reply-form"><label>Reply<textarea name="body" required minlength="2" maxlength="5000" rows="3"></textarea></label><button class="primary">Send reply</button><p role="status"></p></form>`;
  host.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),status=f.querySelector('[role=status]');b.disabled=true;try{const r=await api('/api/contact/conversations/'+id,'POST',{body:f.elements.body.value});await renderContactThread(host,id);host.querySelector('[role=status]').textContent=r.notification==='accepted'?'Reply saved. Email notification accepted.':'Reply saved. Email notification was not confirmed.';}catch(err){status.textContent=err.message;b.disabled=false;}};
 }catch(e){host.textContent=e.message;}
}
export async function mountContactInbox(){
 const host=document.querySelector('#contact-conversations'),newMessage=document.querySelector('#contact-new-message');if(!host)return;
 let loading=false;
 const load=async()=>{if(loading)return;loading=true;const draft=host.querySelector('textarea')?.value||'';
 try{const data=await api('/api/contact/conversations');const threads=data.threads;
  if(!threads.length){host.innerHTML='<div class="support-empty"><p>Start a conversation below. Your message will be sent to the SOMAS team.</p></div>';newMessage.hidden=false;return;}
  newMessage.hidden=true;
  const founder=document.querySelector('.founder-links a[href="/contact/#public-form"]');if(founder)founder.href='/contact/#support-message';
  const messages=[...threads.map(t=>({body:t.message,from_staff:false,created_at:t.created_at})),...(data.replies||[])].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
  host.innerHTML=`<div class="support-chat-toolbar"><span>Private conversation · verified account</span><button class="text-button" id="refresh-chat">Refresh</button></div><div class="support-chat-log" role="log" aria-label="Conversation with SOMAS">${messages.map(m=>`<article class="support-bubble ${m.from_staff?'from-somas':'from-you'}"><strong>${m.from_staff?'SOMAS team':'You'}</strong><p>${esc(m.body)}</p><small>${esc(new Date(m.created_at).toLocaleString())}</small></article>`).join('')}</div><form class="support-composer"><label class="sr-only" for="support-message">Message to SOMAS</label><textarea id="support-message" name="body" rows="2" required minlength="2" maxlength="5000" placeholder="Write a message to SOMAS…"></textarea><button class="primary">Send ↗</button><p role="status"></p></form><p class="fine muted">Replies come from our team. This is not an AI chatbot. Showing up to 50 initial messages and 200 replies.</p>`;
  host.querySelector('textarea').value=draft;host.querySelector('#refresh-chat').onclick=load;
  const log=host.querySelector('.support-chat-log');log.scrollTop=log.scrollHeight;
  host.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),status=f.querySelector('[role=status]');b.disabled=true;try{const r=await api('/api/contact/conversations/'+threads[0].id,'POST',{body:f.elements.body.value});f.elements.body.value='';await load();host.querySelector('[role=status]').textContent=r.notification==='accepted'?'Sent. Owner email notification accepted.':'Message saved. Email delivery was not confirmed.';}catch(err){status.textContent=err.message;b.disabled=false;}};
 }catch(e){newMessage.hidden=false;host.innerHTML='<div class="support-empty"><p>Send your message below. Our team will reply here after you sign in with a verified account matching your email.</p><a href="/account/">Sign in to view your conversation ↗</a></div>';if(!/verified_sign_in_required|Sign in/.test(e.message)){const error=document.createElement('p');error.textContent=e.message;host.append(error);}}
 finally{loading=false;}};
 await load();addEventListener('somas:contact-saved',load);
}
