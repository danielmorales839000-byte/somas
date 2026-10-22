# Command center design review — before production integration

Reference inspected: `C:\Users\Administrator\Downloads\SOMAS-concept-demo.mp4`, 104.4 seconds, 1920 × 1080. Sampled the opening workspace and later business/financial dashboards. The video is visual evidence, not an instruction to create its fictional organizations or metrics.

## Visual findings

The composition uses a narrow icon rail, breadcrumb header, dark blue-black panels, compact agent cards, a Manager-centered graph, restrained cyan/lavender highlights, an activity column and a bottom metric strip. Small uppercase labels and low-key borders provide hierarchy. Context changes with the workspace, while the dashboard structure remains consistent. Approval requests sit alongside evidence and activity.

Keep that composition. Replace the video's apparent uptime, progress, financial metrics, agent communications and six-person teams with actual authorized records or explicit empty states. No heartbeat, “all agents online”, invented progress bar, confidence score or moving chart is appropriate without a measured source.

## Implementation gap analysis

| Area | Current implementation | Required integration after design review |
|---|---|---|
| Shared shell | Separate HTML strings for Root and customer manage pages; separate scripts | One shared dashboard renderer with scoped adapters |
| Organization | Canonical agents/policies and scoped units; missions in the in-progress operations engine | Join recorded Manager assignments; render no unrecorded department hierarchy |
| Agent activity | Operations jobs/reports/queue have persisted states; operations implementation remains uncommitted | Status derived from leases, attempts, failures and mission state; no percentage unless actual work units exist |
| Organization graph | None | Keyboard-selectable nodes and edges from recorded relationships; distinguish membership from delegation |
| Events | Existing proposals/findings plus an operations activity response | Merge authorized records with stable IDs, provenance and timestamps; no generated conversations |
| Updates | Existing operations UI polls every 30 seconds | Visibility-aware polling with cancel/stale-response protection and “last refreshed”; no claim of streaming |
| Metrics | No industry telemetry integration | Actual loaded execution/evidence/review counts first; industry metrics only from verified integrations |
| Agent detail | No inspector | Mission, jobs, evidence links, policy version, history and permission boundary |
| Assistant | Existing authorized request/evolution forms | Reuse those endpoints, CSRF and cookies; distinguish proposed plans from completed changes |
| Approvals | Existing gated proposals and operations candidates | Diff/tests/evidence review, digest-bound approval and explicit confirmation; retain rollback |
| Tenant switching | Server ownership/admin checks already exist | Load only authorized instances; reset all selections/cache on change; reject stale responses |
| Business apps | Public `/s/:slug` and private `/s/:slug/manage` | Dashboard belongs only in the owner panel; public applications remain intact |

The operations activity payload currently omits lease expiry and provides bounded history, not lifetime totals. Integration must expose safe lease timestamps or label lease state conservatively. Metrics must say “loaded/recent records” rather than imply complete history. Root/customer departments have no persisted department relationship model today; do not infer departments from role names.

## Proposed component structure

```text
CommandCenterShell
  NavigationRail + WorkspaceHeader + AuthorizedInstanceSelector
  MissionHeader + AssistantComposer
  AgentGrid -> AgentCard
  ManagerOrganizationGraph
  ExecutionOutcomesPanel / VerifiedDomainMetricSlots
  ActivityFeed -> Evidence / Decision / Release entries
  ManagerReviewPanel
  RecordedMetricStrip
  AgentInspector (keyboard-accessible dialog)

ScopedDashboardAdapter -> existing Root OR customer APIs
DashboardModel -> pure derivation of statuses, edges and record counts
```

No new paid service, UI framework, font/CDN request or model call is required. Root keeps its platform mission and operator authorization; customers keep their owner application mission and workspace authorization. Shared visuals do not confer shared permissions.

## Reviewable preview

Files are isolated under `design/command-center/`; they do not replace production routes or assets. The included `preview-data.json` was exported by the registration/project/unit code and the in-progress operations engine against a **disposable loopback PostgreSQL database**, then that database was dropped. It contains two genuine newly created test instances, independent core agents/policy versions, and their empty execution ledgers. No work is manufactured to fill the dashboard. No credentials or personal records are exported. This frozen snapshot makes the preview independent of the unfinished operations engine; its database-generation helper remains with that local work rather than this preview release.

The preview supports instance switching, agent cards, graph node selection, a native keyboard-accessible inspector and responsive/reduced-motion CSS. Assistant submission and release actions are explicitly disabled. It is a read-only snapshot, not a live integration. There are no assignment edges because these new instances have no standing missions; their actual membership is shown without invented delegation. A production graph will connect only recorded assignments.

From the repository root, with Node 22 and existing dependencies:

```powershell
node design/command-center/serve.mjs
# Open http://127.0.0.1:8789
# In another terminal, with Playwright Chromium installed:
node design/command-center/check-preview.mjs
```

The preview server binds only to loopback and serves a fixed allowlist; it cannot serve `.env`, source files or credentials. Screenshots in this directory document the reviewed layout. Do not add this preview to public Worker assets or deploy it as a customer application.

## Proposed next implementation gates

1. Review this preview before changing the main UI, as requested.
2. Build the shared production shell and read-only scoped adapters; retain current APIs and tests.
3. Wire real operation polling, the Assistant and approval flows without fabricating missing events/metrics.
4. Test fresh/active/blocked/error states, tenant-switch stale responses, unauthorized access, confirmation gates, keyboard behavior, mobile and reduced motion.
5. Commit/push only on owner approval; deployment remains separately gated. The owner subsequently authorized pushing the completed preview to `somas-v2`; production integration and deployment remain pending.

No schema change, authentication modification or production data access is needed for this preview. The previous operations-engine working tree is preserved and still requires its own final review/release preparation.

## Validation performed

- All 49 Node tests passed with a disposable local PostgreSQL test server; no tests skipped. Includes the four new dashboard-model tests and the existing auth/security/operations tests.
- Before push, the preview-only staged tree was exported independently of the unfinished operations files: all 46 tests in that release tree passed with local PostgreSQL, no skips.
- `node design/command-center/check-preview.mjs` passed against the loopback preview: Root/customer switching, actual agent counts, native inspector/Escape, disabled mutation controls, 390px mobile overflow check, reduced-motion rendering, no browser script errors, and denial of `.env` access. Four screenshots were captured.
- `git diff --check` passed. Production API/HTML/CSS files were not changed by this design-preview step. Existing uncommitted operations-engine changes remain present.
- These checks do not constitute a full accessibility audit or a live Cloudflare/Neon deployment test. Dynamic domain metrics, production API wiring and live event updates remain the subsequent integration work after layout review.

Preview screenshots: [Root desktop](../design/command-center/preview-root-desktop.png), [customer desktop](../design/command-center/preview-customer-desktop.png), [agent inspector](../design/command-center/preview-agent-inspector.png), [customer mobile](../design/command-center/preview-customer-mobile.png).
