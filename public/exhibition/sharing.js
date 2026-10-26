export const sharePlatforms=['X','Reddit','LinkedIn','Facebook','Telegram','WhatsApp','Email','Threads','Instagram','YouTube','TikTok','Discord'];
export function postIdea(concept,platform,url){
 const ideas={
  overview:['What if your next project had its own organized AI team?','SOMAS explores two ideas: a self-organizing, trainable AI organization led by a Manager, and a network where independent AI organizations collaborate and verify selected outcomes.'],
  platform:['One goal. An AI team that organizes around it.','The SOMAS Platform concept combines specialized agents, a coordinating Manager, feedback, and measurable learning to continuously improve a goal-driven application under human control.'],
  network:['What if independent AI organizations could work together?','The SOMAS Network concept connects independent Managers for scoped collaboration, with proposed blockchain-based records for selected verification outcomes. Private work stays outside the public ledger.'],
  contributors:['Help shape the future of organized AI.','SOMAS is exploring self-organizing AI teams and collaboration between independent organizations. Constructive criticism, use cases, engineers, researchers, and early collaborators are welcome.']
 };
 const [title,body]=ideas[concept]||ideas.overview;
 if(platform==='X')return {title,text:({overview:'SOMAS: self-organizing, trainable AI teams + a network where independent AI organizations collaborate. Explore the concept demo and share your feedback.',platform:'One goal. A Manager-led AI team that organizes, learns, and improves. SOMAS is a concept demo of goal-driven AI organizations under human control.',network:'Independent AI organizations. Cross-Manager collaboration. Proposed blockchain-based verification. Explore the SOMAS Network concept demo.',contributors:'Interested in self-organizing AI teams and collaboration between AI organizations? Explore the SOMAS concept demo. Feedback and early collaborators welcome.'}[concept]||'Explore the SOMAS concept demo.')+'\n'+url};
 const question=platform==='Reddit'?'\n\nWhat would you need to see before trusting a system like this? I would appreciate specific criticism and useful first use cases.':'';
 return {title,text:title+'\n\n'+body+'\n\nThis is a concept demonstration; AI execution and blockchain activity are simulated, not a live autonomous service.'+question+'\n\nExplore: '+url};
}
export function shareDestination(platform,text,title,url){
 const q=encodeURIComponent;
 switch(platform){
 case 'X':return 'https://x.com/intent/tweet?text='+q(text);
 case 'Reddit':return 'https://www.reddit.com/submit?title='+q(title)+'&text='+q(text);
 case 'Facebook':return 'https://www.facebook.com/sharer/sharer.php?u='+q(url);
 case 'LinkedIn':return 'https://www.linkedin.com/sharing/share-offsite/?url='+q(url);
 case 'Telegram':return 'https://t.me/share/url?url='+q(url)+'&text='+q(text);
 case 'WhatsApp':return 'https://wa.me/?text='+q(text);
 case 'Email':return 'mailto:?subject='+q(title)+'&body='+q(text);
 default:return {Threads:'https://www.threads.net/',Instagram:'https://www.instagram.com/',YouTube:'https://www.youtube.com/',TikTok:'https://www.tiktok.com/',Discord:'https://discord.com/channels/@me'}[platform];
 }
}
export function mountSharing(){
 const dialog=document.querySelector('#share-dialog');if(!dialog)return;
 dialog.innerHTML=`<button class="dialog-close" aria-label="Close sharing">×</button><p class="eyebrow">SHARE THE IDEA</p><h2>Give the vision a voice.</h2><p>Choose a concept. Start with a suggested post. Make it yours.</p><div class="share-compose-controls"><label>Concept<select id="share-concept"><option value="overview">Both SOMAS ideas</option><option value="platform">SOMAS Platform</option><option value="network">SOMAS Network</option><option value="contributors">Invite contributors</option></select></label><label>Platform<select id="share-platform">${sharePlatforms.map(x=>`<option>${x}</option>`).join('')}</select></label></div><label>Post title<input id="share-title" maxlength="300"></label><label>Your post<textarea id="share-text" rows="7"></textarea></label><div class="share-draft-tools"><button id="share-regenerate" class="secondary">Use suggested post</button><span id="share-count" class="fine" aria-live="polite"></span></div><p id="share-guidance" class="fine"></p><div class="share-publish-actions"><button id="copy-share" class="primary">Copy post</button><a id="open-share" class="secondary" target="_blank" rel="noopener noreferrer">Open platform ↗</a><button id="native-share" class="secondary">Share on your device</button></div><p class="fine">Review before publishing. Some platforms accept only a link; paste your copied text there. Instagram, YouTube, TikTok, Threads and Discord open for manual posting. Video platforms require your own video.</p><p id="share-status" role="status"></p>`;
 const $=s=>dialog.querySelector(s),url=location.origin;
 const sync=()=>{const platform=$('#share-platform').value,text=$('#share-text').value;$('#open-share').href=shareDestination(platform,text,$('#share-title').value,url);$('#open-share').textContent='Open '+platform+' ↗';$('#share-count').textContent=Array.from(text).length+' characters';$('#share-guidance').textContent=platform==='X'?'Keep your post concise; X applies its own character and link counting.':platform==='Reddit'?'Choose a relevant community and check its rules before posting.':platform==='LinkedIn'||platform==='Facebook'?'This platform shares the link. Copy and paste the suggested post into its composer.':'Your draft remains editable. Review it in the selected platform before publishing.';};
 const suggest=()=>{const d=postIdea($('#share-concept').value,$('#share-platform').value,url);$('#share-title').value=d.title;$('#share-text').value=d.text;$('#share-status').textContent='';sync();};
 const copy=async()=>{try{await navigator.clipboard.writeText($('#share-text').value);$('#share-status').textContent='Copied. Paste and review before publishing.';}catch{$('#share-text').focus();$('#share-text').select();$('#share-status').textContent='Press Ctrl+C or Command+C to copy your post.';}};
 $('#share-concept').onchange=suggest;$('#share-platform').onchange=suggest;$('#share-regenerate').onclick=suggest;$('#share-text').oninput=sync;$('#share-title').oninput=sync;$('#copy-share').onclick=copy;
 $('#native-share').onclick=async()=>{if(!navigator.share)return copy();try{await navigator.share({title:$('#share-title').value,text:$('#share-text').value});}catch(e){if(e.name!=='AbortError')await copy();}};
 dialog.querySelector('.dialog-close').onclick=()=>dialog.close();document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>dialog.showModal());suggest();
}
