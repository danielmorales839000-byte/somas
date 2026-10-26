# SOMAS v5 — bright 2D concept exhibition

This release updates the existing Cloudflare Worker + Neon application. It does not provision AI agents, train models, run tools or create blockchain transactions. Authentication, community, private conversations, contributor applications and meeting services remain backend features.

## Design and routes

- Dashboard: two visual entry points for Platform and Network.
- Root SOMAS: original ten-character SVG room, a centered Manager, six simultaneous instruction/report packets, independent articulated motion, keyboard-selectable agents, three deterministic 24-step scenarios, pause, replay, seek, speed and scenario links.
- Agent profiles: goal, current assignment, role, created date, no-provider/no-spend disclosure and a synthetic evaluation score. Scores increase only at action 19's defined evaluation event; replay reverses the projection correctly.
- Platform portals, Manager wizard review and saved Manager preview use the same original SVG rigs instead of loading the 3D renderer. Saved team size remains a scenario setting, not a deployed organization.
- Network: all 10,001 supplied source organizations represented by category clusters. Expanded clusters draw at most 48 participants. Search/category/status/date filters apply consistently to table, cluster counts and metrics. Paginated table exposes every record. CSV is labeled synthetic.
- Filter date windows end at the latest source organization creation timestamp. They are historical source windows, not live activity.
- Global activity history is separate from organization filters. All-time aggregates reconcile to 120,000 tasks, 240,000 events and 15,000 claims. No unsupported organization/event joins are asserted.
- Six-beat verification story: Work → Submit → Route → Check → Verdict → Record. This is an explanatory animation, not verification by a live chain.
- About is removed from navigation and its old route redirects to Dashboard. Seven public navigation destinations remain. Join SOMAS opens the optional dismissible invitation. A slim blue persistent simulation notice replaces the former red notice.

## Assets and runtime

All cartoon characters and room illustrations in `public/exhibition/v5/characters.js` are original project SVG code. No third-party character artwork or Rive assets were copied. The recommended Rive/React Flow approaches were evaluated against this buildless application; SVG and Canvas 2D avoid adding a React/runtime migration. These are not Rive implementations.

Paused Root scenes avoid repeated SVG paints. SVG element references are cached and message paths reuse DOM nodes. Network visualization uses Canvas, not 10,001 DOM nodes. Disconnected scenes release animation resources; reduced-motion users start Root playback paused and network packet animation disabled. Table and cluster controls provide alternatives to canvas pointer navigation.

## Verification and limitations

Run `npm ci` and `npm run check`. The suite exercises real isolated PostgreSQL-WASM SQL and mocked Neon HTTP/Google interfaces. It does not prove production Gmail delivery or production Neon configuration.

Browser QA: ten accessible agent selectors; pause and profile selection; combined Finance/Collaborating filter returns 110 organizations; ID search narrows to SUB-00001; details show the corresponding goal and source ID; source history reconciles all-time totals. Browser QA also verified evaluation rewind (Cost Controller 76 → 78 → 76), per-agent timeline filtering, the six-stage verification sequence reaching Record, all-time source history totals, a 7-day organization window of 160 source records, and mobile navigation. The 390px iframe had a 375px usable content width and equal scroll width, with no horizontal overflow. Browser extension metadata errors were observed; they were not application errors. No native-device profiling or production integrations were tested.

The cloud browser reported approximately 1 fps during initial Root observations. This environment is not evidence of 60 fps smoothness on user devices. No 60 fps or mobile-device performance guarantee is made. Native-device profiling remains advisable before publication.

## Installation

Copy the full project into the existing SOMAS checkout, preserving its `.git`, local environment files and Cloudflare secrets. Do not replace those with somebody else's credentials. Run `npm ci` then `npm run check`.

No v5 schema migration is introduced. If the earlier private Contact conversation update has not been applied, apply `db/007_contact_conversations.sql` through the existing Neon migration procedure before enabling private conversation replies. It is additive. Do not delete or recreate production data.

No production push or deployment was performed. Pushing `main` can trigger the existing Cloudflare GitHub deployment; do it only when ready.

## Discussion content update

Removed the redundant COMMUNITY / My community strip. Replaced all 55 static example conversations and their 165 replies with English discussion of SOMAS goals, organization, trainable filters, evaluation, application evolution, Assistant/Virtual Customer roles, independent participants, cross-Manager collaboration and blockchain evidence. Fictional examples remain labeled; existing real visitor posts and database records are unchanged. Browser category filtering and strip removal verified. Full check: 72 passed, 1 skipped, 0 failures.
