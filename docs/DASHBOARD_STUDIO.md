# SOMAS v5.1 — Organization Studio

The supplied terminal screenshot is used as a layout reference: agent roster, compact overview metrics, central activity visualization, contextual panels and a chronological event log. SOMAS keeps its light palette, logo, seven public navigation destinations, original cartoon team, public actions and real backend services. Trading symbols, balances, trade outcomes, copied artwork and Grok branding are not used.

The dashboard at `/` is integrated with the existing deterministic Root scenario controller. Selecting an agent in the roster or scene updates its profile and selection state. Scenario selection updates the goal. Pause, replay, 0.5/1/2× speed, seek and agent event filtering use the same browser-local model as Root SOMAS. Metrics show ten modeled roles, scenario action and $0 actual AI spend; none measure production adoption or real AI performance.

The Network panel leads to the existing source-backed synthetic Network demonstration; its separate Manager diagram is conceptual. No provider calls or blockchain transactions are introduced. The page preserves Share the vision, Schedule a Meeting, Give feedback and account navigation.

## Browser checks

- Selected Platform Engineer from the roster and observed its profile.
- Switched to Quality issue and observed its corresponding goal.
- Sought to the last action and observed 24/24, then reset to the first action.
- Desktop content width matched scroll width (1348px).
- Fixed a mobile grid minimum-width issue. In a 390px QA iframe, usable viewport width was 375px; outer dashboard 343px, roster/main 341px, stage 317px and scene 311px. Only the roster scrolls horizontally.
- Relevant existing frontend/model tests: 13 passed, zero failed. Changed JS modules pass syntax checks. This is not a new full backend-suite run; backend code is unchanged in this dashboard task. Earlier Calendar diagnostics are retained in the complete package.

No production push or deployment was performed. No new database migration, dependency or credential is required for this UI update.

## Install

For an existing v5 checkout, copy the dashboard update files into the project root. The complete archive also includes the prior community and Calendar diagnostic changes. Preserve `.git`, environment files and deployed secrets. Run `npm ci` and `npm run check`, review the site, then commit and push `main` only when ready for Cloudflare's automatic deployment. Package version is 5.1.0.

Google Calendar availability still depends on the owner enabling the Calendar API in the correct Cloud project, authorizing Google and saving booking hours. This dashboard does not resolve that external configuration by itself.
