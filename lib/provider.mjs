import {fixedEndpointFetch} from './http.mjs';
import {AppError} from './domain.mjs';
export const PROVIDERS={
 groq:{name:'Groq',base:'https://api.groq.com/openai/v1',keys:'https://console.groq.com/keys'},
 gemini:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta/openai',keys:'https://aistudio.google.com/api-keys'},
 openai:{name:'OpenAI',base:'https://api.openai.com/v1',keys:'https://platform.openai.com/api-keys'},
 anthropic:{name:'Anthropic Claude',base:'https://api.anthropic.com/v1',keys:'https://platform.claude.com/settings/keys'},
 openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1',keys:'https://openrouter.ai/settings/keys'}
};
export const BASE=PROVIDERS.groq.base;
export function providerConfig(provider='groq'){if(!Object.hasOwn(PROVIDERS,provider))throw new AppError('Choose a supported API provider.');return PROVIDERS[provider]}
function headers(key,provider){return provider==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:'Bearer '+key,'Content-Type':'application/json'}}
async function request(url,options,fetcher,name){try{return await fixedEndpointFetch(fetcher,url,{...options,signal:AbortSignal.timeout(25000)})}catch{throw new AppError(name+' connection interrupted. The same task will retry automatically.',502,'provider_network')}}
export async function modelCatalog(key,fetcher=fetch,provider='groq'){
 const cfg=providerConfig(provider),models=[];if(provider==='openrouter'){const check=await request(cfg.base+'/key',{headers:headers(key,provider)},fetcher,cfg.name);if(check.status===401||check.status===403)throw new AppError('OpenRouter did not accept this API key.',400,'invalid_key');if(!check.ok)throw new AppError('Could not verify the OpenRouter key.',502,'provider_unavailable')}let after='';for(let page=0;page<10;page++){
 const r=await request(cfg.base+'/models'+after,{headers:headers(key,provider)},fetcher,cfg.name);
 if(r.status===401||r.status===403)throw new AppError(cfg.name+' did not accept this API key.',400,'invalid_key');
 if(!r.ok)throw new AppError('Could not load '+cfg.name+' models (HTTP '+r.status+').',502,'provider_unavailable');
 const x=await r.json();for(const m of x.data||[]){if(m.active===false||typeof m.id!=='string')continue;const id=m.id;
 if(provider==='groq'&&/whisper|orpheus|guard|tts|compound/i.test(id))continue;
 if(provider==='gemini'&&(!/^gemini-/.test(id)||/image|tts|audio|embedding|robotics|computer-use|live|vision/i.test(id)))continue;
 if(provider==='openai'&&(!/^(gpt-|o[1-9])/.test(id)||/image|audio|realtime|transcribe|tts|search|codex|deep-research|chat-latest|instruct|computer-use|pro(?:-|$)/i.test(id)))continue;
 if(provider==='openrouter'&&m.architecture?.output_modalities&&!m.architecture.output_modalities.includes('text'))continue;
 models.push(id)}if(provider!=='anthropic'||!x.has_more||!x.last_id)break;after='?after_id='+encodeURIComponent(x.last_id)}
 if(!models.length)throw new AppError('No supported text models are available for this key.');return [...new Set(models)].sort();
}
export function chooseModels(models,provider='groq'){const pick=list=>list.find(x=>models.includes(x))||models[0];const preferences={groq:['llama-3.3-70b-versatile','openai/gpt-oss-20b','llama-3.1-8b-instant'],gemini:['gemini-2.5-flash','gemini-2.5-flash-lite'],openai:['gpt-4.1-mini','gpt-4o-mini'],anthropic:[],openrouter:['openrouter/free']};return {manager:pick(preferences[provider]||[]),worker:pick(preferences[provider]||[])}}
export async function infer(key,model,prompt,fetcher=fetch,provider='groq'){
 const cfg=providerConfig(provider),claude=provider==='anthropic';
 const messages=[{role:'system',content:prompt.system},{role:'user',content:JSON.stringify(prompt.input)}];
 const payload=claude?{model,system:prompt.system,messages:messages.slice(1),max_tokens:4000}:{model,messages,response_format:{type:'json_object'},...(provider==='groq'||provider==='openai'?{max_completion_tokens:4000}:{max_tokens:4000})};
 const r=await request(cfg.base+(claude?'/messages':'/chat/completions'),{method:'POST',headers:headers(key,provider),body:JSON.stringify(payload)},fetcher,cfg.name);
 if(r.status===429){const raw=r.headers.get('retry-after'),seconds=Number(raw),date=Date.parse(raw||'');throw new AppError(cfg.name+' quota reached. Work will resume after the retry time.',429,'provider_quota',Math.max(30,Math.min(86400,raw&&Number.isFinite(seconds)?seconds:Number.isFinite(date)?Math.ceil((date-Date.now())/1000):60)))}
 if(r.status===401||r.status===403)throw new AppError('Reconnect your '+cfg.name+' key in Settings.',401,'provider_auth');
 if(!r.ok){let code='';try{const e=await r.json();code=String(e.error?.code||e.error?.type||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70)}catch{}if(code==='json_validate_failed')throw new AppError(cfg.name+' rejected malformed JSON. Retrying the same task.',502,'invalid_output');throw new AppError(cfg.name+' request failed (HTTP '+r.status+(code?', '+code:'')+'). '+(r.status>=500?'Retrying automatically.':'Check your model and account in Settings.'),502,r.status>=500?'provider_unavailable':'provider_configuration')}
 const x=await r.json(),usage=x.usage,result={provider,model:x.model||model,requestId:x.id||r.headers.get('request-id')||null,usage:{input:usage?.prompt_tokens??usage?.input_tokens??0,output:usage?.completion_tokens??usage?.output_tokens??0,available:!!usage},providerCost:provider==='openrouter'&&typeof usage?.cost==='number'?usage.cost:null};
 const fail=message=>{const e=new AppError(message,502,'invalid_output');e.response=result;throw e};
 if((claude?x.stop_reason!=='end_turn':x.choices?.[0]?.finish_reason!=='stop'))fail('The model output was incomplete. Retrying this task.');
 const content=claude?(x.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(''):x.choices[0].message.content;
 try{result.output=JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{fail('The model returned invalid JSON. Retrying with format guidance.')}return result;
}
export async function seal(key,secret,owner){if(!key)throw new AppError('Server encryption is not configured.',503,'setup_required');const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const k=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},k,new TextEncoder().encode(secret));return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(ciphertext))})}
export async function unseal(key,box,owner){if(!key)throw new AppError('Server encryption is not configured.',503,'setup_required');try{const x=JSON.parse(box),material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)),k=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(x.iv),additionalData:new TextEncoder().encode(owner)},k,new Uint8Array(x.data)))}catch{throw new AppError('Reconnect your API key in Settings.',503,'credential_unavailable')}}
