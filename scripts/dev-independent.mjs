process.env.SOMAS_DEPLOY_TARGET='cloudflare-neon';
process.argv=[process.execPath,new URL('./run-framework.mjs',import.meta.url).pathname,'dev',...process.argv.slice(2)];
await import('./run-framework.mjs');
