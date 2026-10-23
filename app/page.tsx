'use client';
import {useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import Homepage from '../components/landing/Homepage';
import {safeContinuePath} from '../lib/login-flow.mjs';
export default function Home(){
 const search=useSearchParams().toString();
 const query=new URLSearchParams(search);
 const welcome=query.get('welcome')==='1';
 const workspace=!welcome&&(query.has('screen')||query.has('business'));
 useEffect(()=>{
  if(!workspace){window.dispatchEvent(new Event('somas:suspend'));return}
  if(document.getElementById('somas-script')){window.dispatchEvent(new Event('somas:navigate'));return}
  const script=document.createElement('script');script.id='somas-script';script.src='/app.js?v=guided-cloudflare-setup-2';document.body.appendChild(script);
 },[search,workspace]);
 if(!workspace)return <Homepage welcome={welcome} continueTo={safeContinuePath(query.get('next'))}/>;
 return <div id="workspace-root" data-email-auth-mode={process.env.NEXT_PUBLIC_SOMAS_INDEPENDENT==='true'?'password':'code'} data-independent={process.env.NEXT_PUBLIC_SOMAS_INDEPENDENT==='true'?'true':'false'}><div id="app"><main className="empty-state"><div>Opening SOMAS…</div></main></div><div id="modal-root"/><div id="toast" className="toast" role="status" hidden/></div>;
}
