# SOMAS 2.4 — kinetic 3D demonstration

This is an integrated update to 2.3, not a separate prototype. No production deployment or Git push was performed.

## New templates

**SOMAS Platform:** the rectangular office slab is replaced by a circular coordination campus. Nine specialist stations surround the central Root Manager hub. Instruction/report packets flow between the hub and the specialists.

**SOMAS Network:** a central Root exchange tower is surrounded by up to 24 modeled organizations sampled deterministically from the supplied filtered organization catalog. Domain-specific miniature habitats depict restaurant/commerce/hotel awnings, home/farm plots, and school/business towers. The 10,000-participant point overview remains behind these selectable representative habitats. Filtered populations rebuild both the point layer and modeled sample. The other catalog records remain available through the full explorer.

The older six concept landmark buildings are hidden when supplied examples are modeled; invisible landmarks are excluded from picking. The source examples retain their original IDs and metadata.

## Movement and speed

- Headquarters and network start at 5× simulation time; 0.5×, 1× and 2× remain available for inspection.
- About/narrative and companion previews retain their normal 1× default.
- Headquarters and network loop continuously until paused. Replay resets the deterministic simulation clock.
- Four-person reporting cohorts overlap: approach Root, confer at distinct positions around the hub, and return to their own stations. Other agents continue their scoped work, learning or verification activities.
- A live-in-scene counter shows how many specialists are currently reporting. This is a simulated choreography count, not operational telemetry.
- Pause stops the scenario clock and all packet/actor motion. Camera controls remain usable. Reduced-motion preferences start the simulations paused.

## Many network exchanges

48 independent animated lanes depict instructions (blue), reports (teal), verification requests (violet) and example receipts (amber). Arcs connect sampled source organizations to one another and to Root, with moving packet heads. Origin/destination identities come from the supplied organization catalog.

These flows are synthetic visual choreography. They are not actual blockchain transactions, signatures, consensus, provider execution or source task/claim joins. The original dataset consistency notice remains visible. The separate 24-step verification walkthrough remains available alongside the continuous exchange demonstration.

Selecting a packet or an exchange in the activity feed opens an inspector with scenario reference, source/destination, purpose and provenance. The inspector links to the corresponding source organization details. A synchronized list of the modeled organizations provides accessible selection without precise 3D picking.

## Preserved

The entire 2.3 corpus (100,000 generated people; 10,000 Sub-SOMAS; 80,010 agents; 120,000 tasks; 240,000 events; 15,000 claims; 1,500 illustrative chain records), real community, private inquiries, meeting requests, server-authorized administrator workspace, videos, contact details, sharing/feedback controls and persistent demo notice are retained.

No provider key, additional dependency, new migration or operational AI backend is introduced. The same Cloudflare Worker name and Neon configuration are retained.

## Validation

- 39 tests: 38 pass, 0 failures, 1 optional native PostgreSQL test skipped.
- New tests verify 48 distinct deterministic flows, four transaction types, valid participant identities, reporting cohorts, conference hold/return motion and replay consistency.
- Existing full-corpus provenance/count and genuine SQL/community/admin tests pass.
- Syntax checks and a Cloudflare dry-run pass.
- Browser verification: 5× default, 24 modeled source examples + 10,000 points + 48 flows, exchange inspector/source-record drill-down, restaurant filtering (819 matching participants), multiple Root reporters, pause and speed controls, and accessible modeled-organization selection.
- WebGL is disabled in the QA browser. The software-rendered 3D fallback is exercised; GPU rendering still requires a WebGL-capable device check. Character models remain procedural articulated rigs, not imported Blender assets.

## Use the complete ZIP

Copy its contents into your existing `somas` folder, preserving `.git`, `.env` and `.dev.vars`. Run `npm ci`, `npm run check`, then `npm run dev` to review. Inspect `/root-somas/` and `/network/`. Publish only when ready by committing and pushing to Daniel's `main`; that push may trigger Cloudflare production deployment.
