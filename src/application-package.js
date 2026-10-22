import {canonicalJson} from './integrity.js';
import {renderSite} from './agents.js';
import {sha256} from './auth.js';

/** Only the existing validated, typed renderer runs here. No generated JS is executed. */
export async function applicationPackage(project) {
  const name=`somas-app-${project.id.replaceAll('-','').slice(0,24)}`;
  const html=renderSite(project.spec,project.slug)
    .replace(/<a[^>]*href="\/s\/[^\"]*\/manage"[^>]*>[\s\S]*?<\/a>/g,'');
  const files={
    'src/index.js':`const html = ${JSON.stringify(html)};\nexport default { async fetch(request) { const path=new URL(request.url).pathname; if(path==='/health')return Response.json({ok:true,application:${JSON.stringify(project.id)},version:${Number(project.active_release)}}); if(!['/','/index.html'].includes(path))return new Response('Not found',{status:404}); return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}}); }};\n`,
    'wrangler.json':JSON.stringify({name,main:'src/index.js',compatibility_date:'2026-10-21',workers_dev:true},null,2),
    'README.md':`# ${name}\n\nApplication: ${project.id}\nSource release: ${project.active_release}\n\nThis independent, static content application has its own Worker and routing. It contains no control-plane credentials or management API. It does not implement unverified business workflows. Review the artifact before deployment. No hosting or deployment is included in this package.\n`
  };
  return {format:'somas.application.v1',applicationId:project.id,sourceRelease:project.active_release,
    workerName:name,files,digest:await sha256(canonicalJson(files)),status:'prepared',
    limitations:['Static content release only; arbitrary code and business workflows require an isolated coding provider.',
      'A separate Worker deployment and health check are required before an independent URL exists.']};
}
