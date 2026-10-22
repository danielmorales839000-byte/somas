import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html'],'/preview.css':['preview.css','text/css'],'/preview.js':['preview.js','application/javascript'],'/model.js':['model.js','application/javascript'],'/preview-data.json':['preview-data.json','application/json']};
createServer(async(req,res)=>{
 const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end();return;}
 try{res.writeHead(200,{'content-type':file[1],'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(new URL(file[0],import.meta.url)));}catch{res.writeHead(500);res.end('Generate local preview-data.json first.');}
}).listen(8789,'127.0.0.1',()=>console.log('Read-only design preview: http://127.0.0.1:8789'));
