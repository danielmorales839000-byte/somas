import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8789');await page.getByRole('heading',{name:'SOMAS platform',exact:true}).waitFor();
 assert.equal(await page.locator('.agent-card').count(),3);assert.equal(await page.locator('.graph-node').count(),3);assert.equal(await page.locator('.graph svg path').count(),0);
 assert.equal(await page.locator('#request').isDisabled(),true);
 await page.screenshot({path:'design/command-center/preview-root-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Inspect Manager: Not scheduled',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#agent-detail').isVisible(),false);
 const options=await page.locator('#instance option').evaluateAll(nodes=>nodes.map(n=>n.value));await page.locator('#instance').selectOption(options[1]);await page.getByRole('heading',{name:'Appointment Studio',exact:true}).waitFor();
 assert.match(await page.locator('#mission').textContent(),/booking/);await page.screenshot({path:'design/command-center/preview-customer-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Inspect Virtual Customer: Not scheduled',exact:true}).click();await page.screenshot({path:'design/command-center/preview-agent-inspector.png',fullPage:true});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:'design/command-center/preview-customer-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 const forbidden=await page.request.get('http://127.0.0.1:8789/.env');assert.equal(forbidden.status(),404);
 assert.deepEqual(errors,[]);console.log('PASS: Root/customer switching, real agent counts, inspector/Escape, disabled mutation controls, mobile overflow, reduced motion and static-file allowlist. Four screenshots captured.');
}finally{await browser.close();}
