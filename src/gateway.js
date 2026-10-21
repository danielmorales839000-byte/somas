/** Central, budgeted model gateway. Provider secrets exist only as Worker secrets. */
export async function callGateway(env, messages) {
  if(env.ENABLE_LLM !== 'true') return {enabled:false,reason:'llm_disabled'};
  const groq = Boolean(env.GROQ_API_KEY);
  const openrouter = Boolean(env.OPENROUTER_API_KEY);
  if(!groq && !openrouter)return {enabled:false,reason:'no_provider_secret'};
  const provider=groq?'groq':'openrouter';
  const url=groq?'https://api.groq.com/openai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';
  const model=groq?'llama-3.1-8b-instant':'openai/gpt-oss-20b:free';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(url,{
      method:'POST',headers:{Authorization:`Bearer ${groq?env.GROQ_API_KEY:env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages,max_tokens:300,temperature:0.2}),signal:controller.signal
    });
    if(!response.ok)throw new Error(`provider_http_${response.status}`);
    const json=await response.json();
    const answer=json?.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim())throw new Error('empty_provider_response');
    return {enabled:true,provider,model,answer:answer.slice(0,2500),usage:json.usage||{}};
  }finally{clearTimeout(timeout);}
}
export function localAssistantReply(spec,request,team,revision){
  if(revision.supported)return `I understood your request for ${spec.title}. The Manager selected ${team.specialists.join(', ').replaceAll('_',' ')}. A safe preview is prepared; please review and approve it before the live site changes.`;
  return `I understood the request and assigned the Manager's team: ${team.specialists.join(', ').replaceAll('_',' ')}. This change requires a coding/integration worker, so I recorded it for engineering. Nothing was changed on the live website.`;
}
