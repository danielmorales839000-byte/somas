# SOMAS 2.3 — supplied synthetic exhibition

This release extends the existing 2.2 project. It retains the attached design's bright 3D worlds, ten-agent headquarters, destination navigation, real community, inquiry forms and private administrator workspace. It does not deploy or modify production.

## Source and scope

The supplied `SOMAS_3D_Platform_Demo_Design_Specification(3).docx` retains the prior specification's fourteen sections and Nomadian-inspired visual direction. This update applies its inspectable records, meaningful concurrency, Root/Sub distinction and source-labeling requirements to the supplied synthetic data. It does not claim that the remaining Blender asset pipeline from the design has been completed.

Source dataset ZIP SHA-256:
`886cdf154ae7fd97b3944a5eefa91d9256670ef6a95d3bfc204096581d68541f`.

Exactly 566,511 supplied records are packaged:

| Kind | Records |
|---|---:|
| Generated people | 100,000 |
| Root SOMAS | 1 |
| Sub-SOMAS organizations | 10,000 |
| Agents | 80,010 |
| Tasks | 120,000 |
| Events | 240,000 |
| Claims | 15,000 |
| Illustrative linked records | 1,500 |

No generated people are registered as accounts. No synthetic posts, private messages, meeting requests or real adoption numbers are inserted into Neon. The site sends no mail to example.invalid addresses. Provider names, tokens and USD values are supplied synthetic estimates, never actual provider calls or invoices.

## Visitor experience

- Homepage shows explicitly labeled generated-population counts and an entry into the explorer.
- `/network/` adds a lightweight point cloud for the 10,000 supplied Sub-SOMAS organizations. Seven larger concept landmarks retain the separate coherent verification replay. Point positions are illustrative, not actual geography or a real network topology.
- Network and `/examples/` expose the same full dataset browser: search, domain/country filter, organization state, name/learning ordering, and 25-row pagination.
- Select an organization to inspect its supplied identity, goal, parent, generated owner, creation time, example age and normalized learning value. Tabs show its agents, tasks, events and claims.
- Select a generated person to inspect the supplied profile. Names and example.invalid addresses are explicitly fictional and are not contact links.
- The chain view covers all 1,500 supplied illustrative SHA-256 records. It remains clearly labeled as not blockchain consensus.
- Root headquarters displays all ten supplied Root agent snapshot states and learning values separately from the reliability replay.
- The replay is now a 39.2-second, 28-action cycle at 1×. Multiple agents work, think, verify, collaborate and learn concurrently; overlapping event assignments drive reporting and movement. All tracks are deterministic and stop together on pause.
- Real community accounts, threads, votes, reports, notifications, contact submissions, meeting requests and administrator authorization are preserved.

## Source consistency limitation

Every one of the 240,000 source event rows and 15,000 source claim rows references a task whose organization differs from the row's organization. These source records are preserved verbatim, grouped by their own declared organization. They are not silently rewritten, joined into supposedly verified evidence, or represented as authentic work history. The browser's Data origin section and detail drawer disclose this limitation.

The separate 24-step network scenario remains the coherent explanation of work, submission, evaluation, decision, recording and learning. The source dataset is an exhibition snapshot, not a replay log proving that scenario occurred.

## Packaging and performance

`public/exhibition/dataset/` contains static JSON snapshots, approximately 149 MiB on disk including filesystem allocation. People use a compact search index and 100 pages of 1,000 records. Organizations use a compact index and one detail file each. Chain records use 100-record pages. Only the active catalog and selected detail pages load; the full task/event corpus is not downloaded on the homepage or at startup. The client caches a bounded set of detail pages. Rendered tables contain at most 25 rows.

The Cloudflare dry-run recognizes approximately 10,190 static assets, with the same small Worker backend. All individual files are below 25 MiB. A first deployment uploads more assets than the earlier small demo and may take longer. The full ZIP includes these generated static files; no Python command is required to run or deploy it.

To regenerate from the exact supplied ZIP, use:
`python scripts/build-exhibition-dataset.py /path/to/source.zip`.
This script never connects to a database. It validates provenance and counts before producing manifest and detail files.

## Review and publish

1. Extract the complete ZIP over the existing project, retaining `.git`, `.env` and `.dev.vars`.
2. Run `npm ci`, `npm run check`, then `npm run dev`.
3. Inspect `/`, `/root-somas/`, `/network/` and `/examples/`; verify the SIMULATED labels.
4. No new migration or provider key is required. Existing migrations 004/005 and production DATABASE_URL / ADMIN_USER_ID continue to support genuine community workflows.
5. Only when ready to publish, commit and push the reviewed files to Daniel's `main`. Cloudflare may automatically deploy that push. This package has not been pushed or deployed.

## Verification

37 tests: 36 pass, 0 failures, 1 optional native PostgreSQL test skipped. Tests count every packaged organization detail, agent, task, event, claim and generated user and check synthetic provenance and reserved email domains. Existing isolated PostgreSQL/Neon-HTTP integration tests still verify genuine community and private administrator workflows.

Browser checks cover organization filters, organization/agent/task drill-down, the last user DU-100000, the last illustrative record 1500, source disclaimers, the 10,000-point population, concurrent agent states, and the supplied Root snapshot. Mobile layout and GPU/fallback limits remain documented in SPATIAL_3D_RELEASE.md. WebGL is unavailable in this QA browser; the software 3D renderer is exercised instead. No hosted Neon or production functionality was re-tested.
