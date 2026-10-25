# SOMAS v3 design update

This release updates the existing v2.4 project from the supplied 26 October design. It does not enable operational AI. No production deployment or remote push was made.

## Route checklist

| Route | Result |
|---|---|
| `/` | New two-concept headline; existing interactive destination carousel; seven public navigation entries |
| All public pages | Accessible first-visit role invitation, 30-day local dismissal, reopen button, interactive demo disclosure |
| `/platform/` | Exactly two primary choices with moving 3D scenes and pause controls |
| `/platform/root-manager/` | Dedicated existing ten-agent campus with new pearl-shell avatars, concurrent states, 5× replay and inspector |
| `/platform/create-manager/` | Five-step mission, organization, intelligence, tools/limits and consent workflow |
| `/platform/managers/?id=…` | Browser-local saved scenario, 3D preview, twenty-action illustrative trace and deletion |
| `/network/` | Compact 36% desktop scene; full supplied directory; state/industry distributions; source-date ranges and task/event/claim charts |
| `/looking-for/` | Investor, Engineer and Contributor opportunities |
| `/join/?role=…` | Distinct role context, existing categorized backend application form and meeting link |
| `/videos/`, `/discussions/`, `/contact/` | Existing films, real community and private inquiries/meeting requests preserved |
| `/admin/` | Approved admin structure and server permissions retained |
| `/idea/` | Redirects to Dashboard; no About navigation or internal links |

## Deliberate demo boundaries and remaining design differences

- Manager scenarios are stored locally, not in authenticated cloud workspaces. Anyone using the same browser profile can access them. No BYOK input, provider calls, tools, spending or real execution exists. The earlier demo-only instruction takes precedence over the document's live-mode API proposal.
- The visual preview reuses ten standard characters. The configured team cap and use case are saved settings; it does not generate a custom rig/team composition. The twenty-action trace is illustrative rather than task-to-gesture choreography.
- Network source totals and charts are genuine aggregates of synthetic records. Full-history totals are 120,000 tasks, 240,000 events and 15,000 claims. Source decision counts are not verified outcomes. Historical ranges end at the last source date, not wall-clock now.
- Source task/event/claim organization mismatches remain disclosed. No deployed consensus, signing or chain finality is implied.
- The existing point-cloud population renderer is retained rather than replaced with InstancedMesh. All 10,000 Sub-SOMAS records remain addressable in the directory.
- Existing video library is preserved; the larger proposed category/search/caption redesign and new Terms content are not included.
- Meeting requests remain requests requiring founder review; no external calendar reservation or automatic email confirmation.

## Validation

42 tests: 41 passed, 1 optional native PostgreSQL migration test skipped. Existing PostgreSQL-WASM community/admin authorization tests pass. Syntax checks and Cloudflare dry-run pass.

Browser: invitation first appearance/dismiss/reopen, five wizard steps, save and reopen, dedicated Root route with ten agent controls, no About links, full-history chart 240,000 events, desktop scene width 35.5%. Mobile iframe shows responsive stacked scene/analytics and functioning directory. QA browser uses software rendering, so GPU performance and a physical Windows laptop remain unverified.

Before screenshot: `somas-network-v24.jpg`. After: `somas-v3-network.jpg`, `somas-v3-welcome.jpg`, `somas-v3-platform.jpg` supplied alongside release.

## Run locally

Copy the complete release over the existing project while preserving your private environment files. Run `npm ci`, `npm run check`, then `npm run dev`. No new production migration is required. Do not publish until the owner approves.
