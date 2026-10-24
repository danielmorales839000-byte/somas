# SOMAS visual demo v2 — update your deployed project

Copy the contents of this update into D:\work\somas and replace matching files. Keep your existing wrangler.jsonc, database UUID, Worker name, secrets, worker.mjs, schema.sql, package.json and package-lock.json. This update does not include those configuration files and requires no database migration or setup command.

Run:

```bat
cd /d D:\work\somas
npm run build
npm test
git add public scripts/check.mjs UPDATE-v2.md
git commit -m "Launch visual SOMAS demos with 52 simulated actions"
git push
```

Your existing Cloudflare GitHub connection deploys it automatically. Keep its existing deploy command `npx wrangler deploy`. Wait for deployment success before refreshing.

Pages:
- `/`: interactive mission-control introduction, not a long vertical landing page.
- `/team.html`: 26-step AI organization simulation with pause, back, next, speed, restart and action explorer. Project preview, approval and learning state evolve.
- `/network.html`: 26-step manager collaboration simulation with peers, permissions, signatures and chained records.
- Both supplied videos are available from Watch films.
- Share and Feedback stay visible across all pages, including the owner inbox and privacy page.

Sharing: Facebook share dialog; native device sharing when supported; editable post and copy controls; Instagram/YouTube copy + open. Visitors review and publish themselves. This is not an authenticated social publishing integration and never claims to have published a post. YouTube uploads require the user's video file and account.

Feedback uses the existing /api/contact and D1 owner inbox. No visitor signup or email verification. No AI calls or live blockchain. Every demo is labeled as simulated. Reduced-motion preference disables autoplay; controls still work.
