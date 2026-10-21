/** Optional autonomous browser runner. Runs on a developer machine or CI, not inside Worker.
 * Required environment: SOMAS_BASE_URL, SOMAS_PROJECT_ID, SOMAS_EMAIL, SOMAS_PASSWORD
 * Commands: npx playwright install chromium; npm run virtual-customer
 */
import {chromium,request as pwRequest} from '@playwright/test';
const required=['SOMAS_BASE_URL','SOMAS_PROJECT_ID','SOMAS_EMAIL','SOMAS_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
const base=new URL(process.env.SOMAS_BASE_URL);
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('SOMAS_BASE_URL must be HTTPS');
const api=await pwRequest.newContext({baseURL:base.origin,extraHTTPHeaders:{'x-somas-request':'1','content-type':'application/json'}});
const login=await api.post('/api/auth/login',{data:{email:process.env.SOMAS_EMAIL,password:process.env.SOMAS_PASSWORD}});
if(!login.ok())throw new Error(`Login failed: ${login.status()}`);
const details=await api.get(`/api/projects/${process.env.SOMAS_PROJECT_ID}`);
if(!details.ok())throw new Error('Not authorized to test this project');
const project=(await details.json()).project;
const browser=await chromium.launch({headless:true});
const findings=[];
try{
  for(const viewport of [{width:1366,height:900},{width:375,height:812}]){
    const page=await browser.newPage({viewport});
    const issues=[];
    page.on('pageerror',e=>issues.push(e.message.slice(0,250)));
    const url=`${base.origin}/s/${project.slug}`;
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    if(!response?.ok())findings.push({severity:'high',title:'Application page unavailable',evidence:`Page HTTP status ${response?.status()||'no response'} at ${url}`});
    if(await page.locator('h1').count()!==1)findings.push({severity:'medium',title:'Missing or repeated page heading',evidence:`Expected one H1 at ${viewport.width}px viewport`});
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    if(width>viewport.width+2)findings.push({severity:'medium',title:'Horizontal overflow',evidence:`Document width ${width}px exceeds viewport ${viewport.width}px`});
    if(await page.locator('.hero a.button').count()){
      await page.locator('.hero a.button').click({timeout:5000}).catch(e=>issues.push(`CTA click: ${e.message.slice(0,170)}`));
      if(await page.locator('#contact').count()===0)findings.push({severity:'high',title:'CTA target missing',evidence:`Primary call-to-action has no contact target at ${viewport.width}px viewport`});
    }
    for(const issue of issues.slice(0,5))findings.push({severity:'high',title:'Browser runtime error',evidence:`${viewport.width}px viewport: ${issue}`});
    await page.close();
  }
  if(findings.length){const result=await api.post(`/api/projects/${project.id}/browser-findings`,{data:{findings:findings.slice(0,15)}});
    if(!result.ok())throw new Error(`Report rejected: ${result.status()} ${await result.text()}`);}
  console.log(JSON.stringify({tested:project.slug,findings:findings.length,reported:true},null,2));
}finally{await browser.close();await api.dispose();}
