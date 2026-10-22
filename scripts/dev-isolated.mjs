/** Isolated integration server: disposable PostgreSQL/WASM + the actual Worker handlers.
 * NEVER reads DATABASE_URL or provider credentials from the host environment.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import worker from '../src/index.js';
import {withWasm} from '../tests/helpers/wasm-fixture.js';
const port=Number(process.env.SOMAS_LOCAL_PORT||8788),origin=`http://127.0.0.1:${port}`;
await withWasm(async({pool,migrate})=>{
  for(const file of ['001_initial.sql','002_operations.sql','003_recursive_units.sql','004_mission_runtime.sql'])await migrate(file);
  const env={DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require',PUBLIC_CONTROL_ORIGIN:origin,
    ASSETS:{async fetch(request){
      const pathname=new URL(request.url).pathname;
      const file=resolve('public',pathname==='/'?'index.html':pathname.slice(1));
      if(!file.startsWith(resolve('public')+'/'))return new Response('Not found',{status:404});
      try{return new Response(await readFile(file),{headers:{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream'}});}
      catch{return new Response('Not found',{status:404});}
    }}};
  const server=createServer(async(req,res)=>{
    try {
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      const response=await worker.fetch(new Request(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )}),env);
      // Root authorization is limited to this named disposable account in the test database.
      if(req.url==='/api/auth/register'&&response.status===201) {
        const data=await response.clone().json();if(data.user.email==='qa-owner@example.test')env.ADMIN_USER_ID=data.user.id;
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(500);res.end('Isolated test server failure');}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));console.log('Isolated SOMAS test server listening on '+origin);
  await new Promise(r=>{process.once('SIGTERM',r);process.once('SIGINT',r);});
  await new Promise(r=>server.close(r));
});
