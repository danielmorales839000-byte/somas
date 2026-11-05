# SOMAS v5.2 — Random Network demonstration

The Network dashboard defaults to an animated browser-local simulation. A fresh random seed is selected for each visit. The source snapshot is available separately and is never modified. The figures are not real users, organizations, training outcomes, token prices or blockchain activity.

## Random events

- Create a Sub-Manager and assign eight modeled agents.
- Retire a Sub-Manager and remove its eight modeled agents from the active population.
- Change a participant's state.
- Submit a pending work claim.
- Approve or reject a pending claim through a modeled review outcome.
- Add an illustrative block reference after every three review outcomes.

Random event intervals are 0.7–1.8 seconds. Each event advances an accelerated scenario clock by 20–99 seconds. All metrics derive from the same event state. Organization totals equal the sum of participant-state counts, and agent totals equal ten Root agents plus eight per Sub-Manager. Root cannot be retired. A small labeled representative lifecycle sample shows created, active and retired manager cards; it is not a list of all Network participants. Existing pool representatives replenish the visible sample after retirements; this does not create additional organizations or increment creation counts.

Work counts are current claim outcomes grouped by their latest recorded decision time. A pending claim changes to approved or rejected instead of being counted twice. Exact source claim timestamps seed the simulation, and time windows roll as the simulation clock advances. Charts, period totals and claim outcome counts reconcile. Illustrative block references beginning `sim-` are not cryptographic verification or live chain hashes.

Pause/Resume, Next random event and Reset replay are available. Reset recreates the same seed and event sequence for that visit. Source snapshot switches back to original source aggregates. The loop suspends event generation in a hidden document, stops after its DOM host is removed and caps a session at 10,000 events to bound memory. Reduced-motion visitors start paused. Real accounts, posts, messages, bookings and stored Manager records are not changed or deleted by this demonstration. Actual AI spending remains zero; the unit definition and undefined token price are not randomized.

## Verification

18 relevant tests passed. New tests exercise 240 seeded events, require all event types, reconcile population/status/agent totals and every window's claim outcomes/chart bins, confirm unchanged source data, verify seeded replay, protect Root and enforce the session limit.

Browser inspection observed 27 random events with two creations, six retirements, approved and pending claims, changing organization/agent counts and two new illustrative blocks. Returning to Source snapshot / All time still showed exactly 9,000 approved claims. The initial long browser action batch timed out; inspection resumed in the existing tab and verified its resulting state. No application failure was inferred from that automation timeout. A subsequent run showed six creations, six retirements and 37 events with active and retired sample cards. Mobile Pause/Next controls worked; usable width and scroll width both remained 375px.

This is a dashboard simulation; the separate Network source explorer continues to show its original corpus. No production push or deployment occurred. No database migration, dependency or key is introduced. Use `npm ci` and `npm run check` before committing the release.
