import handler from 'vinext/server/fetch-handler';
import {handleAPI,handleRunner} from '../lib/server.mjs';
import {independentRequest,independentEnvironment} from '../lib/independent-runtime.mjs';
import {emailEnvironment} from '../lib/membership.mjs';

export default {
  async fetch(incoming: Request, bindings: any, ctx: ExecutionContext) {
    const request=independentRequest(incoming), path=new URL(request.url).pathname;
    if(path==='/healthz')return Response.json({ok:true,service:'SOMAS',hosting:'cloudflare-neon'});
    if(path==='/signin-with-chatgpt')return Response.redirect(new URL('/?screen=login',request.url),302);
    if(path==='/signout-with-chatgpt')return Response.redirect(new URL('/?screen=login',request.url),302);
    try{
      if(path.startsWith('/api/')||path==='/readyz'){
        const env=await independentEnvironment(bindings);
        if(path==='/readyz'){
          if(!env.APP_DATA_KEY||!env.SOMAS_ADMIN_USER_ID)throw Error('configuration');
          await env.DB.prepare('SELECT challenge_id FROM password_signups LIMIT 1').all();
          return Response.json({ready:true,database:'neon'});
        }
        return await handleAPI(request,env,{defer:(promise:Promise<unknown>)=>ctx.waitUntil(promise)});
      }
      // Framework pages receive no platform identity or database secrets in props.
      return await handler.fetch(request,bindings,ctx);
    }catch{
      return Response.json({error:{code:'service_unavailable',message:'SOMAS is temporarily unavailable. Please try again.'}},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  },
  async scheduled(_event:ScheduledController,bindings:any,ctx:ExecutionContext){
    ctx.waitUntil((async()=>{
      const env=await emailEnvironment(await independentEnvironment(bindings));
      await handleRunner(new Request('https://runner.internal/api/runner',{method:'POST',headers:{'X-SOMAS-Runner-Authorization':env.SOMAS_RUNNER_TOKEN}}),env);
    })());
  }
};
