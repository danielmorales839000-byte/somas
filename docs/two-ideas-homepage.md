# SOMAS two-idea homepage review

Branch: `feature/two-ideas-homepage`.

## Visitor experience

The public `/` route explains two distinct ideas immediately:

- **SOMAS Platform:** AI organizations dedicated to each owner's goal. Cyan styling distinguishes the current MVP and its broader roadmap.
- **SOMAS Network:** a proposed decentralized blockchain network connecting independently owned AI organizations. Violet styling and research-stage labels distinguish it from the working Platform.

The page includes separate concept cards, an interactive specialist organization diagram, a three-organization network diagram, six illustrative use cases, a comparison, vision, and functional calls to the existing workspace and project onboarding. Root and customer missions are separate. Diagrams are labeled conceptual, and implemented capabilities are distinguished from planned coding/testing/deployment features. There are no fabricated node transactions, earnings promises, legal pages, or external trackers.

## Changed files

| File | Change |
| --- | --- |
| `app/page.tsx` | Public homepage at `/`; preserve `screen` and `business` workspace routes; load workspace code only when needed. |
| `app/layout.tsx` | Homepage metadata and scoped stylesheet. |
| `components/landing/Homepage.tsx` | Navigation, hero, interactive diagrams, concept sections, use cases, comparison, vision, footer. |
| `components/landing/content.ts` | Reusable specialist, organization, and use-case data. |
| `public/homepage.css` | Responsive navy/cyan/violet design, keyboard focus styling, reduced-motion rules. |
| `public/app.js` | Preserve explicit dashboard links, dashboard refreshes, workspace suspension/resumption, and isolate workspace event handlers from the public page. Hide Root navigation from ordinary users. |
| `tests/navigation.test.mjs` | Five regression tests for public isolation, dashboard refreshes, returning to the workspace, Root access, and suspended handlers. |
| `docs/two-ideas-homepage.md` | Review, verification, limitations, and deployment instructions. |
| `docs/homepage-preview/desktop.jpg` | Desktop homepage screenshot. |
| `docs/homepage-preview/responsive.jpg` | Real 390px and 768px iframe viewport screenshots. |

No backend API contracts or database schemas changed.

## Verification

- `node --test tests/*.test.mjs`: **41 passed**, including existing authentication, ownership, user administration, provider, and agent execution tests.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `node --check public/app.js`: passed.
- Sites production build: passed.
- Browser: desktop homepage, specialist selection, network-node selection, mobile menu open/close, anchor destinations, workspace navigation, project onboarding and anonymous Root denial verified.
- Phone/tablet: actual iframe viewports 390px and 768px, both without horizontal document overflow.
- Reduced-motion: stylesheet disables conceptual animations and transitions when the preference is enabled; device preference emulation was unavailable.

## Limits

The preview is anonymous. End-to-end ChatGPT sign-in and a real authenticated hosted session were not exercised; sign-in destinations and server access-control tests were checked. Preview diagnostics included a transient framework startup hook warning, browser-extension metadata errors, and a hydration warning identifying extension-injected HTML attributes. Interactive controls worked and the production build succeeded; a hosted post-deployment smoke test remains necessary.

Network functionality remains a research concept. This homepage does not implement blockchain, arbitrary autonomous coding, browser testing, or independent customer deployment.

## Deployment after approval

The supplied brief says: **“Do not deploy to production without my approval.”** No publication or production push was performed.

1. Review this branch and screenshots.
2. After explicit approval, confirm the feature commit, current Site ownership/audience, and source repository head. Integrate the approved feature branch into the publishing source through the Sites workflow.
3. Rebuild/package that exact source with the Sites source helper, preserving the existing project ID, D1 binding and audience.
4. Save the archive-backed version and deploy it with the audience-appropriate Sites tools.
5. Confirm the native deployment result and smoke-test `/`, the sign-in return path, dashboard, an existing customer project, and administrator access.

No database migrations or new provider credentials are needed for this homepage update.

## Show both ideas after every sign-in

All application sign-in links now return through `/?welcome=1&next=…`. This renders the two-idea homepage with a “Two ideas. One vision.” welcome strip and a “Continue to workspace” button. There is no once-only browser flag: every application sign-in uses this route. The next destination retains a project, settings, or dashboard link, while unsafe external destinations and authentication loops fall back to the dashboard. The welcome flag controls presentation only and grants no access.

Additional files: `lib/login-flow.mjs` (safe continuation and sign-in paths), `tests/login-flow.test.mjs` (sign-in return and safety coverage), `docs/homepage-preview/after-login.jpg`. Updated files include the homepage component, entry route, stylesheet, workspace sign-in links, and shared `app/chatgpt-auth.ts` helper.

Validation: **45 tests passed**, TypeScript and JavaScript syntax checks passed, production build passed. Browser checks confirmed the welcome overview, the Continue button reaching the dashboard, and dashboard sign-in links routing back through the overview. Actual hosted authentication remains untested because this branch is not deployed. Existing production approval requirement remains in effect.
