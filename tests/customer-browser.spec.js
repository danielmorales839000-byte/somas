// Optional, real browser test. Run against a created SOMAS instance:
// TEST_SITE_URL=https://your-worker.workers.dev/s/your-slug npx playwright test tests/customer-browser.spec.js
import {test,expect} from '@playwright/test';
const target=process.env.TEST_SITE_URL;
test.skip(!target,'Set TEST_SITE_URL to your own SOMAS public site');
test('Virtual Customer navigates primary site and CTA',async({page})=>{
  await page.goto(target,{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toBeVisible();
  const cta=page.locator('.hero a.button');await expect(cta).toBeVisible();
  await cta.click();await expect(page.locator('#contact')).toBeInViewport();
});
test('Virtual Customer checks mobile layout',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto(target,{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toBeVisible();
  const documentWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  const viewportWidth=await page.evaluate(()=>window.innerWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth+2);
});
