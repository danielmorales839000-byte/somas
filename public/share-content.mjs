export function shareKit(origin){
 const url=new URL('/',origin);if(!['https:','http:'].includes(url.protocol))throw new Error('A web URL is required.');
 const link=url.origin+'/',title='SOMAS — Your goal. An AI organization.';
 const text='Discover SOMAS: AI organizations led by a Manager, with specialist teams working toward your goals. Explore SOMAS Platform and the proposed SOMAS Network connecting independent organizations. Platform MVP; Network research concept.';
 const caption=text+'\n\n'+link+'\n\n#SOMAS #ArtificialIntelligence #AIAgents';
 const channels=[
  {id:'facebook',name:'Facebook',mode:'Share link',url:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(link)},
  {id:'x',name:'X',mode:'Prepared post',url:'https://twitter.com/intent/tweet?text='+encodeURIComponent('One goal. An AI organization. Discover SOMAS Platform and its vision for a separate decentralized SOMAS Network. Platform MVP; Network research concept.')+'&url='+encodeURIComponent(link)},
  {id:'linkedin',name:'LinkedIn',mode:'Share link',url:'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(link)},
  {id:'whatsapp',name:'WhatsApp',mode:'Prepared message',url:'https://wa.me/?text='+encodeURIComponent(caption)},
  {id:'telegram',name:'Telegram',mode:'Prepared message',url:'https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(text)},
  {id:'reddit',name:'Reddit',mode:'Prepared link',url:'https://www.reddit.com/submit?url='+encodeURIComponent(link)+'&title='+encodeURIComponent(title)},
  {id:'instagram',name:'Instagram',mode:'Copy caption & open',url:'https://www.instagram.com/'},
  {id:'youtube',name:'YouTube',mode:'Copy description & open',url:'https://studio.youtube.com/'}
 ];return {url:link,title,text,caption,channels};
}
