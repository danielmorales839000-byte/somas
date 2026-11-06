# Release validation — SOMAS 6.1

- `npm run check`: 97 tests, 96 passed, 0 failed, 1 skipped. All syntax checks passed.
- New tests cover bounded send limits, duplicate extraction, encrypted recipient storage, no account/subscription creation, authorization, cross-origin rejection, explicit send confirmation, individual Gmail envelopes, idempotent queue processing, unsubscribe suppression, cancellation and uncertain-send resume behavior.
- Database tests use isolated PostgreSQL in WASM with a Neon HTTP adapter; Gmail API responses are mocked. No hosted Neon database or live Gmail delivery was tested.
- Browser QA exercised the actual new module against isolated SQL: DOCX upload with three addresses became two unique recipients, draft review showed the message and list, Broadcast automatically processed both recipients and finished at 2 accepted / 0 remaining.
- No production deployment, production changes or real outgoing messages were performed.

## Version 6.1.1

The admin navigation no longer has Imported Contacts. New workflow tests invoke the same client orchestration used by the single Broadcast button and verify analyze → create campaign → start sending, plus failure-before-send behavior. No new browser run or live emails were performed for this UI simplification.

Final 6.1.1 checks: 100 tests, 99 passed, 0 failed, 1 skipped; syntax checks passed.
