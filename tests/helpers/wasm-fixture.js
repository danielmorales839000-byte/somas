/** PostgreSQL/WASM integration. SQL executes in PGlite, transactions are serialized.
 * This deliberately does NOT establish native concurrent-connection or hosted Neon behavior.
 */
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {neonConfig} from '@neondatabase/serverless';
export async function withWasm(run) {
  const db=new PGlite();await db.waitReady;
  const previous=neonConfig.fetchFunction;
  let pending=Promise.resolve();
  const serial=fn=>{const result=pending.then(fn);pending=result.catch(()=>{});return result;};
  const query=async(text,values=[])=>{
    if(typeof text==='object'){values=text.values||[];text=text.text;}
    const results=values.length?await db.query(text,values):((await db.exec(text)).at(-1)||{rows:[]});
    return {...results,rowCount:results.affectedRows??results.rows.length};
  };
  neonConfig.fetchFunction=async (_target,options)=>serial(async()=>{
    const body=JSON.parse(options.body),batch=!!body.queries;
    try {
      if(batch)await db.exec('BEGIN');
      const results=[];
      for(const {query:sql,params} of body.queries||[body]) {
        const result=await db.query(sql,params||[]);
        results.push({fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rowCount:result.affectedRows??result.rows.length,
          rows:result.rows.map(row=>result.fields.map(f=>{const v=row[f.name];return v==null?null:v instanceof Date?v.toISOString().replace('T',' ').replace('Z','+00'):typeof v==='object'?JSON.stringify(v):String(v);}))});
      }
      if(batch)await db.exec('COMMIT');
      return Response.json(batch?{results}:results[0]);
    } catch(error) {
      if(batch)await db.exec('ROLLBACK');
      return Response.json({message:error.message,code:error.code},{status:400});
    }
  });
  try {return await run({pool:{query:(...args)=>serial(()=>query(...args))},migrate:async file=>{const contents=await readFile('db/'+file,'utf8');return serial(()=>db.exec(contents));}});}
  finally{neonConfig.fetchFunction=previous;await db.close();}
}
