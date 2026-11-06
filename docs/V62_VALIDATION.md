# SOMAS 6.2 validation

- `npm run check`: 108 tests, 107 passed, 0 failed, 1 skipped; source syntax checks passed.
- New actual-SQL tests cover separate personal Gmail credentials, send-only OAuth scopes, PKCE, browser/user state binding, callback replay rejection, encryption, cross-administrator send rejection, owner sender compatibility, campaign sender freezing and password-confirmed disconnect.
- Browser QA used isolated test accounts and PostgreSQL in WASM, not a production database. Confirmed: management navigation, My Gmail status/actions, owner/personal selector changes, member welcome/profile/meeting links and section search results. The recruitment popup defect on account pages was corrected and rechecked.
- Existing core account, community, simulations, document parser and broadcast tests remain passing.
- OAuth and Gmail HTTP responses were mocked. No production deployment, credential entry, live consent flow or real email sends occurred.
- Screenshots show example.test fixture identities, not evidence that Roman's live Gmail is connected.
