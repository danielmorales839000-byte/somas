import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'runtime-browser.spec.js',workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:8788',browserName:'chromium',launchOptions:process.env.SOMAS_TEST_BROWSER_PATH?{executablePath:process.env.SOMAS_TEST_BROWSER_PATH,args:JSON.parse(process.env.SOMAS_TEST_BROWSER_ARGS||'[]')}:{ }},
  webServer:{command:'node scripts/dev-isolated.mjs',url:'http://127.0.0.1:8788/health',reuseExistingServer:false,timeout:30000},
  reporter:'list',outputDir:'test-results/runtime'
});
