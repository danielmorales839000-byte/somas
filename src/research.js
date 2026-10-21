import {database,recordFindings,uuid} from './database.js';
import {virtualCustomerHeuristics} from './agents.js';
import {readBoundedText} from './http.js';
/** Cron: bounded, non-LLM checks; never deploy or train automatically. */
export async function cronEvolutionTick(env){
  const sql=database(env);
  const projects=await sql`SELECT p.id,p.spec,p.active_release FROM projects p
    JOIN subscriptions s ON s.workspace_id=p.workspace_id
    LEFT JOIN instance_checks c ON c.project_id=p.id
    WHERE p.suspended=false AND s.status IN ('trial','active')
      AND (c.checked_at IS NULL OR c.checked_at < now()-interval '24 hours' OR c.last_release<>p.active_release)
    ORDER BY c.checked_at NULLS FIRST LIMIT 3`;
  let audited=0;
  for(const p of projects){
    const f=virtualCustomerHeuristics(p.spec);
    await recordFindings(sql,p.id,f,'scheduled_static_heuristic');
    await sql`INSERT INTO instance_checks(project_id,last_release,checked_at,findings_count) VALUES (${p.id},${p.active_release},now(),${f.length})
      ON CONFLICT(project_id) DO UPDATE SET last_release=EXCLUDED.last_release,checked_at=EXCLUDED.checked_at,findings_count=EXCLUDED.findings_count`;
    audited++;
  }
  if(env.ENABLE_EXTERNAL_RESEARCH==='true'){
    const target=projects[0];
    if(target){
      try{
        const url='https://developer.mozilla.org/en-US/docs/Web/Accessibility';
        const response=await fetch(url,{redirect:'error',headers:{accept:'text/html'},signal:AbortSignal.timeout(6000)});
        if(response.ok && Number(response.headers.get('content-length')||0)<130000){
          const body=await readBoundedText(response,130000);
          const title='MDN accessibility documentation';
          const excerpt=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1200);
          await sql`INSERT INTO research_sources(id,project_id,url,title,excerpt) VALUES (${uuid()},${target.id},${url},${title},${excerpt})`;
        }
      }catch(e){console.error('scheduled research skipped:',e.message);}
    }
  }
  return {audited};
}
