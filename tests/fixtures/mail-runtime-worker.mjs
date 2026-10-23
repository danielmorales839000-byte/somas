import {handleAPI} from '../../lib/server.mjs';
export default {async fetch(req,env){
 if(new URL(req.url).pathname==='/runtime-redirect-repro'){
  try{new Request('https://api.resend.com/emails',{redirect:'error'});return Response.json({rejected:false})}
  catch(error){return Response.json({rejected:true,name:error.name})}
 }
 return handleAPI(req,env);
}};
