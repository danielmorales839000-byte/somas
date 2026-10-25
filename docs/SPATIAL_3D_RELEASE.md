# SOMAS spatial concept exhibition

Design source: SOMAS_3D_Platform_Demo_Design_Specification (25 October 2026).
Base source: Daniel's `main`, dd5a5e7c55e0d29caad2f4e182e60f3d418d8380.
Implementation extends the existing Workers + Neon project. Production has not been deployed or modified.

## What changed

- Pearl-white spatial shell, persistent red demo notice, top navigation, and persistent Share / Feedback actions.
- Homepage with centered 3D destination, previous/next perspective cards, seven motion previews, keyboard and swipe selection, and a motion pause control.
- Root headquarters: ten original full-body articulated characters, role accessories, desks, central coordination hub, validation and lounge space. Select by character or accessible roster. Orbit, pan, zoom, reset, follow, pause, replay, speed and step controls.
- A deterministic 28-action reliability cycle with instruction/report packets, work, report, walking, learning, validation, celebration and rest gestures. Inspector includes responsibility, sample identity age, named example rubric, history, provenance, and zero provider use.
- Network: seven spatial organizations with independent missions; Universe / Organization / Verification camera modes, goal search, node selection, organization detail dialog, and a 24-action work → submit → evaluate → decide → record → learn replay. Directional packets follow the protocol phase. Receipts are clearly labeled demo references.
- Two-chapter visual About story, miniature cinema, four collaboration stations, assistant reception, and six-category discussion constellation. The real discussion list remains the accessible selection and reading surface.
- Meeting requests validate a future time and IANA timezone, convert to UTC, and save as private contact records. They are requests, not automatic bookings.
- `/admin/` provides actual user, message and meeting lists, counts, search of loaded records, private review-state changes and audit history. Every request checks the server-side ADMIN_USER_ID. Discussion moderation is retained.
- Non-WebGL browsers use a software-projected 3D fallback with the same world geometry and camera controls. Non-HTTPS previews can generate inquiry idempotency IDs without crypto.randomUUID.

## Real and simulated

Real: community authentication, discussions/replies/votes/reports/moderation, private inquiries, meeting requests, admin data and review state.
Simulated: all AI characters, tasks, organizations, evaluation values, project previews, network claims and verification. No provider integration, AI execution, runner, training, signing, consensus, blockchain or deployment service was added.

No analytics are invented. Unique visitors and page views are explicitly not tracked. Country and last-login history are not collected for community accounts and are not fabricated. The admin workspace returns the latest 100 users and 100 inquiries; search operates on that loaded subset.

## Asset and design boundaries

The ten original characters use a procedural joint hierarchy (hips, head, shoulder, elbow and leg groups), not imported Blender/GLB skin-and-bone assets. They share geometry/materials and differ in palette, accessories and height. They do not yet have production animation clips, lip animation or artist-authored clothing. The document's full Blender character-production pipeline remains future art work.

Homepage thumbnails are lightweight CSS motion studies; the center uses the active 3D scene. They are not seven rendered MP4 loops. Sub-organization drill-down is a readable concept-team dialog, not a separate fully modeled interior. The About sequence uses short captions and text alternatives rather than a rendered 45-second film. Existing founder videos remain available with click-to-load YouTube and local MP4 playback.

Administrator confirmation is a private review state. No confirmation email, external calendar invitation, availability synchronization, automatic reply or social publishing is sent. Social controls retain share/copy/open-platform behavior.

HANCOM Nomadian is artistic inspiration only; no third-party characters or screenshots are copied. Three.js 0.186.1 is bundled locally with its MIT license in public/exhibition/vendor/. No external CDN is required for 3D. Browser assets are loaded on demand when an active scene is present.

## Deployment / local use

1. Copy the ZIP contents into the existing somas checkout. Do not replace `.git`, `.env` or `.dev.vars`.
2. Run `npm ci`, then `npm run check`.
3. Run `npm run dev` for local review. `/` is the spatial homepage; `/root-somas/` is the headquarters; `/network/` is the network; `/admin/` is the private admin workspace.
4. Existing Neon migrations 004 and 005 must already be applied for real workflows. This update introduces no new migration and does not drop tables.
5. Retain DATABASE_URL and ADMIN_USER_ID on the existing Worker. The Worker name remains somas-cloudflare-neon.
6. When ready to publish, commit and push the current project to Daniel's `main`. This may automatically deploy via Cloudflare. Do not push until you intend to publish.

No production credentials or disposable QA fixtures are included in the archive.

## Validation

- 35 tests: 34 passed, 0 failed, 1 optional native PostgreSQL test skipped (requires explicit disposable local database).
- Real SQL via isolated PostgreSQL-WASM + Neon HTTP transport validates meeting storage, admin authorization, UTC fields, review states and audit history, alongside all existing community workflows.
- Syntax checks and Cloudflare dry-run pass. No deployment was performed.
- Browser QA: carousel next/keyboard selection, agent inspector, replay stepping, phase selection, network drill-down, chapter switch, meeting submission and admin persistence, mobile menu and headquarters at 390px.
- WebGL is disabled in the QA browser. Software-rendered 3D was visually inspected; GPU rendering remains to be verified on a WebGL-capable device. Third-party YouTube streaming and hosted Neon were not re-tested.
