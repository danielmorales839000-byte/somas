export function showDisclosure(){
 const d=document.createElement('dialog');d.className='demo-disclosure';d.setAttribute('aria-label','Demo disclosure');d.innerHTML='<h2>Demo disclosure</h2><p>AI activity, learning and network records are simulated. Community accounts, saved inquiries and connected Calendar bookings are real services. No AI execution or live blockchain is connected.</p><button class="primary" autofocus>Close</button>';document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
}
