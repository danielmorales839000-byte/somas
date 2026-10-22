/** External, one-project read-only browser executor. The short-lived token cannot read owner APIs.
 * Env: SOMAS_BASE_URL, SOMAS_RUNNER_TOKEN, SOMAS_TARGET_ORIGIN. No production credentials in browser.
 */
import {chromium} from '@playwright/test';
const base=new URL(process.env.SOMAS_BASE_URL||'');
const target=new URL(process.env.SOMAS_TARGET_ORIGIN||'');
const token=process.env.SOMAS_RUNNER_TOKEN;
const local=url=>process.env.SOMAS_ALLOW_LOCAL_TEST==='true'&&['localhost','127.0.0.1'].includes(url.hostname);
for(const url of [base,target])if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||(url.protocol!=='https:'&&!local(url)))throw new Error('An explicit HTTPS origin is required');
if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('A short-lived scoped runner token is required');
async function call(path,data) {
  const response=await fetch(base.origin+'/api/runner/'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Runner request rejected: '+response.status);
  return response.json();
}
const {job}=await call('claim',{});
if(!job){console.log('No browser job available');process.exit(0);}
if(job.payload.origin!==target.origin||!/^\/s\/[a-z0-9-]{1,70}$/.test(job.payload.path||''))throw new Error('Job target does not match the explicitly authorized application');
const browser=await chromium.launch({headless:true,...(process.env.SOMAS_ALLOW_LOCAL_TEST==='true'&&process.env.SOMAS_TEST_BROWSER_PATH?{executablePath:process.env.SOMAS_TEST_BROWSER_PATH,args:JSON.parse(process.env.SOMAS_TEST_BROWSER_ARGS||'[]')}:{})});
const checks=[];
const lease={jobId:job.id,leaseToken:job.leaseToken};
try {
  for(const viewport of [{width:1366,height:900},{width:375,height:812}]) {
    await call('heartbeat',lease);
    const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
    // No control-plane cookies or credentials enter the browser. Foreign-origin subrequests are denied.
    await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===target.origin&&url.pathname===job.payload.path?route.continue():route.abort();});
    const page=await context.newPage();let runtimeErrors=0;page.on('pageerror',()=>runtimeErrors++);
    const response=await page.goto(target.origin+job.payload.path,{waitUntil:'domcontentloaded',timeout:25000});
    checks.push({name:`Release ${viewport.width}px`,passed:Number(response?.headers()['x-somas-release'])===job.payload.release,evidence:`Expected release ${job.payload.release}; observed ${response?.headers()['x-somas-release']||'unavailable'}`});
    const headings=await page.locator('h1').count();
    checks.push({name:`HTTP ${viewport.width}px`,passed:response?.status()===200,evidence:`GET ${job.payload.path}; HTTP ${response?.status()||'unavailable'}; source release ${job.payload.release}`});
    checks.push({name:`Heading ${viewport.width}px`,passed:headings===1,evidence:`Expected one main heading; observed ${headings}`});
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    checks.push({name:`Responsive ${viewport.width}px`,passed:width<=viewport.width+2,evidence:`Document width ${width}; viewport ${viewport.width}`});
    const cta=page.locator('.hero a.button');
    if(await cta.count()) {
      const href=await cta.getAttribute('href');
      if(href?.startsWith('#')){await cta.click();checks.push({name:`CTA ${viewport.width}px`,passed:await page.locator(href).count()===1,evidence:`Clicked primary CTA; target ${href}`});}
    }
    checks.push({name:`Runtime ${viewport.width}px`,passed:runtimeErrors===0,evidence:`Observed ${runtimeErrors} page exceptions`});
    await context.close();
  }
  await call('report',{...lease,report:{method:'playwright_browser',checks}});
  console.log(JSON.stringify({jobId:job.id,checks:checks.length,passed:checks.every(c=>c.passed),reported:true,missionVerified:false}));
}finally{await browser.close();}
