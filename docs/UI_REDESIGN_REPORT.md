# ABI UI redesign and verification — 2026-10-14

## A. Design and template

The current application was redesigned in place. The router, API client, auth
service, backend, dataset engine, models and dependencies were preserved.

The official shadcn CLI `info` identified Vite, TypeScript, Tailwind v3, alias
`@`, no React Server Components and no `components.json`. The reviewed commands
were `npx --yes shadcn@latest info`, `search '@shadcn' --query landing-01`, and
`add landing-01 --dry-run`. The successful explicitly namespaced search found
no matching item in `@shadcn`; the bare add dry-run failed while resolving its
new-york-v4 URL with ECONNRESET. No initialization or item installation ran.
Initial sandbox attempts also encountered npm DNS failure. No project files
were changed by those CLI inspections.

The identified third-party reference is WatermelonCorp's `landing-01` entry,
whose primary registry lists sixteen template files and additional hugeicons,
motion and router dependencies. Its repository currently describes React 19 /
Tailwind 4 and has an MIT license; the inspected hero uses remote CDN images.
Those assets and packages were not imported into this React 18 / Tailwind 3
application. No unidentified registry installation or arbitrary source copying
was used. References:
[official CLI](https://ui.shadcn.com/docs/cli),
[upstream registry](https://github.com/WatermelonCorp/watermellon-registry),
[identified item source](https://github.com/WatermelonCorp/watermellon-registry/blob/main/src/components/templates/landing-01/landing/hero.tsx).

**The authorized visual fallback was implemented, not an exact installed
landing-01 block.** It adapts technical typography, monospaced supporting labels,
fine borders, framed content and editorial spacing into an analytics workspace.
The dark green-neutral surfaces and restrained lime/chart accents are the
application's chosen adaptation, not a claim to reproduce the upstream palette.

Shared primitives: local SVG `Icon`, `Brand`, `PageHeader`, `Panel`,
`StatusBadge`, CSS button/input/panel/table/tab/filter/navigation styles and the
retained `KpiCard`. Tokens in global CSS cover backgrounds, surfaces, text,
borders, accent, seven chart colors, radius and motion. Tailwind extends those
tokens; the existing single dark mode remains. There are visible focus rings,
CSS reduced-motion rules, a skip link, mobile navigation with Escape/focus return
and keyboard containment, and labelled icon buttons. No runtime font, image,
telemetry or paid-service dependency was added. Package manifests and lockfile
are byte-for-byte unchanged.

## B. Pages redesigned

| Existing routes | Presentation changes |
|---|---|
| `/` | Original local-only hero, architecture illustration, capabilities and working sign-in links; removed public development passwords |
| `/login` | Responsive split layout, clear form hierarchy, accessible validation/errors; existing login/session transport |
| Authenticated shell | Role-aware sidebar, active section, breadcrumb, account/sign-out, persistent dataset/table selectors, mobile navigation |
| `/dashboard` | Page header/context, filters, ten supported bundle metrics, themed charts, ranked table, disclosed definitions and quality/coverage below analytical content |
| `/datasets` | Shared page header, folder/ZIP and single-file surfaces, readable server-provided budgets, unchanged manifests/jobs, keyboard-scrollable catalog, inspection/schema controls |
| `/analytics/sales`, `/orders`, `/customers`, `/products`, `/sellers`, `/delivery` under `/analytics` | Shared section tabs, panels, metric cards, chart palette/axes/tooltips and table styles; original datasets/charts retained |
| `/insights`, `/reports` | Shared headings/forms/filter surfaces, clearer selected-dataset descriptions, original question/export actions |
| `/ml/metrics` | Actual artifact/runtime/compatibility states retained; historical metrics in expandable disclosures, mapping-review links and non-stretched cards |
| `/ml/product-segmentation`, `/ml/revenue-forecast`, `/ml/order-forecast`, `/ml/customer-segments`, `/ml/anomalies`, `/ml/sales-prediction` | Existing task layouts/controls, charts and tables use shared presentation; no substituted model responses |
| `/admin/users`, `/admin/roles`, `/admin/health`, `/admin/data`, `/admin/warehouse`, `/admin/ml`, `/admin/settings` | Shared administration heading/tabs, surfaces, forms/tables; existing role restrictions retained |

No profit, margin, growth, marketing or other unsupported chart values were
invented. Currency remains unconfirmed when the dataset has not confirmed it.

## C. Functional preservation

| Workflow | Automated evidence | Visual evidence |
|---|---|---|
| Folder/ZIP/single-file upload, invalid files and manifests | Existing bundles/datasets/connectivity browser cases and full backend suite passed | Desktop/mobile Dataset Manager and actual asynchronous status screenshots inspected |
| Effective limits | Authenticated API values still drive the existing upload UI; backend limit/streaming regressions passed | UI shows 200 MiB incoming, 512 MiB expansion and current row/table/time budgets |
| Large import, cancel, concurrency, resume | Backend async/cancel/atomicity tests passed; new real 2.15 MiB folder case returned 202 and resumed after reload | Actual job stage/counters and Cancel import control captured; transport delay used no fake response bodies |
| Bundle/table scope and schema | Existing nine-table synthetic import, table selection, schema and owner-isolation browser cases passed | Selectors, preview/catalog and context reviewed |
| Dashboard metrics and filters | Persisted supplied archive: 385,650 orders, 372,795 customers, item revenue 53,088,558.01, delivered filter 371,293, reset, real orders forecast passed | Three actual chart SVGs verified rendered; desktop/mobile screenshots inspected |
| Numerical Insights and CSV export | Scoped numerical/filtered export, auth refresh and free-only browser cases passed | Original answer/output and report actions retained |
| Auth/RBAC/admin/ownership | Full backend suite and Admin/Analyst browser workflows passed | Role-aware sidebar, account/sign-out and admin settings inspected |
| Existing six ML serving artifacts | Synthetic compatible task cases and real persisted orders inference passed; runtime/compatibility assertions passed | Historical metrics, runtime state, mapping links and blocked candidate shown distinctly |
| Free-only/local AI | Backend `--free-only-network` and real browser external-destination guard passed | No new remote assets; optional generation left disabled in final local runtime |

The complete supplied archive was reused from existing isolated local storage;
it was not repeatedly imported. Its real/synthetic composition is not inferred
from its filename. Browser mutation tests use a separate synthetic 45-day
reference and disposable database, not that persisted bundle or the original
developer database.

## D. Actual checks and results

| Executed command (appropriate directory) | Before | Final |
|---|---|---|
| Backend: `python -m pytest tests --rootdir=. -q --free-only-network --tb=short -p no:cacheprovider` | 335 passed, 15 skipped | 335 passed, 15 skipped |
| ML: `python -m pytest tests --rootdir=. -q -p no:cacheprovider` | 8 passed | 8 passed |
| Frontend: `node node_modules/vitest/vitest.mjs run` | 58 passed / 11 files | 61 passed / 12 files |
| `node node_modules/eslint/bin/eslint.js .` | Passed | Passed |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | Passed | Passed |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json` | Passed | Passed |
| `node node_modules/vite/bin/vite.js build --outDir <verification-output>/delivered-dist` (baseline used its own output) | Passed | Passed |
| `node node_modules/@playwright/test/cli.js test --config <verification-output>/playwright-ui.config.cjs --workers=1 --output=<verification-output>/delivered-browser-output` | 20 passed, 2 gated skips | 23 passed, 2 gated skips |
| Same CLI, separate persisted-data config, `e2e/olist-bundle.spec.ts --grep 'Complete persisted' --workers=1` | Historical case retained | 1 passed, 49.8s test time |
| `git diff --check` | Passed | Passed |

The browser baseline was executed against the exact backed-up original frontend
on a separate port, not inferred from historical results. The final collection
adds navigation accessibility, desktop/laptop/mobile overflow/screenshots and a
real async-import reload/resume case. Its two gated cases are private archive
re-import and private persisted-bundle acceptance; the latter was run separately
against the correctly identified existing bundle. Backend skips require optional
original-reference fixtures. No existing test was deleted, weakened or newly
marked skipped. Builds/logs/screenshots and the full source backup are external
to the repository.

Initial failures remain recorded rather than concealed:

- A sandbox backend attempt stalled without results and was stopped by exact
  test-process ownership; the host disposable-storage baseline passed.
- The first after-UI browser run reused baseline test data. Its fixed-name
  invalid-upload assertion found two rows. A new disposable API copy resolved
  the test setup issue; the complete final collection passed unchanged.
- The first private-bundle case passed metrics, filter/reset and real forecast,
  then exceeded its default 10-second ML-status expectation. The unchanged test
  passed with an explicit external 90-second expectation budget. This timing
  allowance is fixture-specific; it is not a backend performance fix.
- An early immediate Dashboard screenshot captured charts before ResizeObserver
  rendered SVGs. Subsequent real visual review explicitly awaited chart surfaces
  and confirmed all three rendered, with zero page errors and no mobile overflow.

Screenshots were inspected at desktop 1440x1000, laptop 1024x768 and mobile
390x844, including Login, Dashboard with persisted data, Dataset Manager,
navigation, job status, ML Metrics, Analytics and Admin Settings. Tables retain
their intentional horizontal scroll containers on small screens. Existing
Python/React warnings are not presented as test successes or hidden failures.

## E. Git and file integrity

- Initial/final branch: `integrate/abi-ml-backend`.
- Initial/final HEAD: `129aca183e9fe17ffe26e8a5bbf51553ca607ea1`.
- Initial working tree, staged diff and untracked inventory were clean.
- Existing frontend source/configuration was copied into a uniquely named
  external backup before edits, with baseline hashes. Secrets/data/weights and
  dependency folders were not backed up as source.
- Presentation changes are limited to shared frontend components, existing
  page markup/styles, Tailwind tokens, two new frontend test files, and this
  report. New primitives are `Icon.tsx` and `Workspace.tsx`.
- No changes to backend, ML training/inference/metadata, database schema,
  frontend API/auth services, router, data/filter hooks, dependency manifests or
  lockfile. Their baseline hashes match.
- Original `.env`, `backend/sem5.db` and six local serving binaries retain
  baseline checksums, sizes and mtimes. The separate ABI source checkout remains
  clean. Candidate bytes retain their recorded SHA256 and are never activated.
- No staging, commit, push, branch switch, history rewrite or dependency upgrade.
  Runtime files, private data, binaries and verification output are not added.

## F. Remaining limitations

The exact landing-01 block was not installed; the documented visual fallback is
the delivered design. Large selected-dataset ML status can exceed ten seconds;
business-query optimization is outside this presentation task. Original ABI
Gradient Boosting activation is still blocked on missing legitimate training,
preprocessing, synthetic provenance, target/units and reproducible evaluation
inputs. Six trusted serving binaries are still separate local prerequisites,
not supplied by Git. No model was retrained, replaced or upgraded. Optional
Ollama generation was not newly benchmarked; local-only guards and deterministic
behavior were regression-tested. There is no new light-mode system.

## G. Manual verification and running services

All six URLs below returned HTTP 200 and are **LIVE — VERIFIED** at final check.
SPA shell checks are backed by the functional browser results above.

1. [Login](http://localhost:5173/login) using your existing local account.
2. [Dataset Manager](http://localhost:5173/datasets): inspect folder/ZIP controls,
   server budgets, bundle context and table selection.
3. [Dashboard](http://localhost:5173/dashboard): select the preserved supplied
   Olist complete-verification bundle and Bundle overview. Check actual charts,
   shared filters/reset, source quality and unconfirmed monetary units.
4. [ML Metrics](http://localhost:5173/ml/metrics): inspect runtime versus
   compatibility, expand historical metrics, and leave the candidate inactive.
5. [Analytics](http://localhost:5173/analytics/sales): inspect existing analysis
   tabs and filters; then visit Insights, Reports and permitted Admin pages.

[API health](http://localhost:8000/health) and
[API docs](http://localhost:8000/docs) were also verified.

The intended main UI/API remain on 5173/8000, using the existing isolated
populated Olist verification storage and existing trusted model directory.
Separate synthetic test services use other ports and are stopped after checks.
The original developer database is not the serving/test database. Analyst data
remains independently owned; screenshots of the separate test suite use labelled
synthetic fixtures and must not be mistaken for the persisted supplied archive.
