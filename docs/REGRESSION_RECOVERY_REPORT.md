# ABI regression recovery — 14 October 2026

## A. Folder upload root cause

The live Dataset Manager had selected **18 CSVs / 240.68 MiB**: nine directly under `olist dataset/` and another nine under `olist dataset/olist dataset/`. The configured payload limit is **200 MiB (209,715,200 bytes)**. The disabled confirmation button was correct; no import request was sent. Directory selection and relative paths were working. A single nine-table copy is about 120.34 MiB.

`BundleUpload.tsx` now explains repeated filenames across folders and offers an explicit **CSV folder to import** choice showing each folder's count and size. It defaults to all files, never silently removes CSVs, preserves original relative paths, and shows how many files the user's choice excludes. Unsupported non-CSV files can be excluded explicitly. Nested folders and distinct same-named tables remain supported.

The 200 MiB limit and backend archive, expanded-size, row, cell, file-count, timeout, atomicity and path-safety checks were preserved. Exact-boundary and one-byte-over unit checks pass. The shared bearer-authenticated multipart transport still sends `files`, `paths`, and `name` to `POST /api/datasets/bundles/upload`; ZIP uses `POST /api/datasets/bundles/zip`. The browser supplies the multipart boundary.

Additional recovery changes prevent duplicate in-flight submissions and distinguish an already successful import from a failed catalog refresh. Failed parses retain the selection. Async import status/resume/cancel behavior remains in place.

A real nine-table browser import exposed a second defect: sibling table-preview/schema components reused the same React key. Switching inspected tables could retain the previous preview. Distinct key prefixes and an inspector key now ensure exactly one preview for each of all nine tables.

Verified: real directory chooser, nested paths, explicit four-to-two-file scope, expired-access refresh/retry, all nine separately persisted tables, every table's inspector, reload persistence, unchanged active selection until explicit activation, single-file import, invalid ZIP recovery, valid ZIP import and ownership checks. The user's real archive was not reimported.

## B. Authentication root cause

On the preserved pre-edit UI, a restored invalid access token made `GET /api/datasets` return **401**, then `POST /api/auth/refresh` returned **401**. `refreshAccessToken()` returned null without clearing the invalid credentials, while `RequireAuth` only checked token presence and did not subscribe to session changes. The browser remained stranded on Dataset Manager.

The existing auth store now notifies reactive route guards, clears terminally rejected sessions, shares one refresh across concurrent requests, retries a protected request at most once, and observes cross-tab logout. Session-generation guards prevent a stale login or refresh from replacing a newer session. Temporary refresh network/5xx failures retain credentials; permission **403** responses are not refreshed or treated as logout.

Verified against real local APIs: invalid restored-session redirect and credential clearing; successful refresh with exactly one refresh call and upload statuses **401 → 201**; reload/navigation/logout; Admin-to-Analyst switching; private dataset and Admin API rejection with **403**. Browser tests found no page or console errors in the complete Admin/Analyst workflow. No CORS or backend authorization bypass was added.

The main API was restarted normally with a fresh signing key, on its verified existing database and trusted model paths. Existing sessions must sign in again. The live in-app browser demonstrated this redirect and a successful fresh Admin login.

## C. Dashboard improvements

The existing theme, navigation, selected-dataset context, shared filters and chart library were retained. The Dashboard now includes:

- Item revenue, distinct orders, average order value, units/item rows, unique customers and active sellers where supported. Profit and margin explicitly show **Unavailable** without validated costs/profit.
- Actual successful-refresh time, source coverage/quality, current filter summary and reset controls.
- Separate observed revenue and distinct-order trends. Real model predictions are not included in realized totals.
- Category revenue, contributions divided by **all selected item revenue**, and top-five products by revenue and quantity at item grain.
- Order-status counts/percentages, valid completed deliveries, delivery-completion coverage, average observed delivery time, monthly completed-delivery duration and cancellation rate.
- Compact structured revenue/customer/seller evidence: repeat customers and rate, six recent monthly first-time/returning revenue observations, seller rankings with the existing minimum 20 eligible orders and dataset baseline, and evidence-backed recommendations. Full detail remains in specialist routes.
- An explicit **Load 7-day model outlook** action: real orders/revenue inference where eligible, last historical date, prediction dates, and historical anomaly scores. Unsupported targets explain why they are unavailable. Inference is not automatically run on every KPI refresh.
- Links to the filtered specialist analysis and full historical/future ML experience.

New aggregates avoid payments/reviews fan-out. Missing/negative delivery intervals are excluded, not imputed. Cancellation uses canceled orders divided by all matching orders. Product highlights are bounded SQL aggregates; no raw customer identifiers are added.

The full browser run exposed hidden chart tooltips retaining desktop coordinates after a mobile resize. Chart panels now contain that overflow; the existing 390-pixel body-overflow assertion passes without modification.

The live persisted dataset reconciled **385,650 orders**, **53,088,558.01 item revenue**, **372,795 customers**, and **371,293 delivered orders**. Its currency remains unconfirmed; no BRL assumption or conversion was written. Historical customer/seller evidence renders on the live Dashboard.

## D. Regression results and exact commands

PowerShell command variables used below identify existing installed runtimes and the task-owned evidence directory; no packages were installed:

```powershell
$py = '<USER_HOME>\AppData\Local\Temp\sem5-sanitized-current-tree-3fd744806b5748d28957938285baf96d\.venv\Scripts\python.exe'
$node = 'C:\Program Files\nodejs\node.exe'
$evidence = '<USER_HOME>\.codex\visualizations\2026\10\06\01a112b9-095e-73d3-bf09-6d706112385f\abi-recovery-20261014'
```

| Working directory | Command | Final result / evidence |
| --- | --- | --- |
| `backend` | `& $py -m pytest -q` | **343 passed, 15 skipped**; `backend-delivered.log` |
| `backend` | `& $py -m pytest -q tests/test_free_api_policy.py --free-only-network` | **25 passed** with external network blocked by the test guard; `free-policy-verified.log` |
| `ml` | `& $py -m pytest -q` | **8 passed**; `ml-delivered.log`; no training |
| `frontend` | `& $node node_modules/vitest/vitest.mjs run` | **88 passed / 17 files**; `frontend-release.log` |
| `frontend` | `npm run lint` | Exit 0; `lint-release.log` |
| `frontend` | `& $node node_modules/typescript/bin/tsc -b` | Exit 0; `typescript.log`; also repeated by build |
| `frontend` | `npm run build` | Exit 0, TypeScript + Vite production build; `build-release.log` |
| `frontend` | Browser suite below | **27 passed, 2 skipped**; `browser-release.log` |
| `frontend` | Separate persisted-data browser case below | **1 passed**; `persisted-release.log` |

Disposable browser suite, using the existing synthetic-reference test server on port 8001 and current-source Vite on 5174:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '<USER_HOME>\AppData\Local\ms-playwright'
$env:SEM5_E2E_BACKEND_PORT = '8001'
& $node node_modules/@playwright/test/cli.js test --workers=1 --config "$evidence\playwright.config.cjs" --output "$evidence\browser-release-output"
```

Read-only verification of the already imported main bundle (activation/filter operations only; no import, deletion or schema edit):

```powershell
$env:SEM5_E2E_BACKEND_PORT = '8000'
$env:SEM5_VERIFIED_OLIST_ID = '<VERIFIED_DATASET_ID>'
& $node node_modules/@playwright/test/cli.js test olist-bundle.spec.ts --grep 'Complete persisted' --workers=1 --config "$evidence\playwright-persisted.config.cjs" --output "$evidence\persisted-release-output"
```

The two disposable-run skips are the explicitly gated exact-user-ZIP import and persisted-real-bundle cases. The latter passed separately above; the archive import was deliberately not repeated. `portability.spec.ts` retains the project's existing separate-environment exclusion and was not run in this recovery. Backend skips are existing warehouse/reference-snapshot or local-artifact gates; they are not counted as passes. Existing fixture-backed upload, auth/RBAC, business evidence, analytics, ML and free-only policy tests are included in the backend suite.

Baseline before changes: **343 backend passed / 15 skipped; 79 frontend passed**. The preserved pre-edit browser reproduced the invalid-session failure and missing explicit duplicate-folder recovery. Initial browser attempts with interrupted temporary services failed from connection errors; those are harness failures, not authentication evidence. Intermediate implementation failures (React keys, mobile tooltip overflow) were repaired and their groups and complete applicable suites rerun. A new chart unit test initially lacked jsdom's ResizeObserver mock; the local mock fixed the harness without weakening assertions.

The first additional free-policy invocation could not open/clean its sandbox temporary SQLite directory before tests ran (`free-policy-release.log`). The approved normal local invocation completed all 25 tests (`free-policy-verified.log`); no application change was needed.

The complete recovery browser workflow covers Admin sign-in → real folder chooser → all nine table inspections → schema/activation → reconciled Dashboard → date filter/reset → Customers/Products/Delivery/Sellers → real seven-day outlook and 30-point ML chart → CSV export → refresh → logout → isolated Analyst access. The suite also covers single-file and ZIP imports, parse failure, scope switching, free-only deterministic Insights, Reports, admin tools, segmentation and anomalies.

Evidence is in the external task directory above, including screenshots, baseline snapshots, sanitized failure traces and final logs. Synthetic-fixture screenshot: `dashboard-verified.png`. Main persisted-data screenshot: `persisted-release-output/.../exact-archive-dashboard.png`.

## E. Preservation confirmation

- Branch remains `integrate/abi-ml-backend`; HEAD remains `129aca183e9fe17ffe26e8a5bbf51553ca607ea1`.
- No clone/fetch/pull/remote access, branch switch, commit, push, merge, rebase, stash/reset or cleanup of user files was performed. Nothing was staged.
- The pre-task **39 modified + 18 untracked** files were recorded and backed up. All 255 baseline files remain present. Prior UI/ML work was preserved; `recovery-files.json` distinguishes this task's changes from that prior work.
- Original `.env`, `backend/sem5.db`, six trusted serving artifacts and the inactive candidate retain their baseline SHA-256 hashes, sizes and modification times. No retraining, replacement or candidate activation occurred.
- No dependency manifest, lockfile, environment file, upload configuration or database migration was changed.
- Main serving DB remains the existing `olist-verification-wal.db` under the previously identified task runtime, not an empty test DB. Its two existing private nine-table bundles remain. The original repository database was not used for destructive tests.
- Disposable imports and authorization experiments used separate test databases and synthetic fixtures. Main real data was not reimported, deleted, or relabeled as wholly real history.
- Task-created authentication-bearing trace/log content is sanitized before handoff; private data and credential values are not included in this report.

## F. Local verification links

| URL | Status and evidence |
| --- | --- |
| [Login](http://localhost:5173/login) | **LIVE — VERIFIED**; fresh Admin login and expired-session redirect |
| [Dashboard](http://localhost:5173/dashboard) | **LIVE — VERIFIED**; actual rendered metrics/evidence and Network 200s on persisted main bundle |
| [Dataset Manager](http://localhost:5173/datasets) | **LIVE — VERIFIED**; main catalog; import workflow verified separately on disposable backend |
| [ML Metrics](http://localhost:5173/ml/metrics) | **LIVE — VERIFIED**; serving-contract/runtime catalog in main browser test |
| [Backend health](http://localhost:8000/health) | **LIVE — VERIFIED** |
| [API documentation](http://localhost:8000/docs) | **LIVE — VERIFIED** |

The correct main frontend/API are left running on **5173 / 8000**. Temporary test services on **5174 / 8001** are stopped after verification. Protected links require a fresh sign-in after the API key rotation.

## G. Remaining blockers and limits

No unresolved regression remains in the executed recovery tests. The following are explicit data/model/environment limitations:

- The current real bundle's currency is unconfirmed. Revenue forecast and monetary anomaly inference remain blocked until units are legitimately confirmed. Orders inference passed with the existing approved model.
- Profit and margin need validated cost/profit fields. Missing completed-delivery dates do not become zero-day deliveries.
- No approved future customer-volume or seller-delay model exists. Their panels remain historical analysis with sample/baseline limitations. No invented prediction intervals or anomaly probabilities are shown.
- The inactive Gradient Boosting candidate remains inactive; missing training provenance was not invented or repaired by retraining.
- The extended Olist data includes synthetic records according to the user's provenance statement. The application does not certify uploaded transactions as entirely real.
- Existing gated backend checks, the separate fresh-clone portability environment and a new full-size archive import were not run as part of this recovery. Skips and scope are disclosed above.
- Large full-history SQL aggregation takes longer than synthetic fixtures. The persisted main browser workflow completed in about 1.8 minutes; no production-scale latency guarantee is claimed.

Automatic approval review rejected an attempt to access runtime secrets from process memory to retain the signing key. That attempt did not execute. A normal restart with a fresh key on the verified existing DB completed instead; existing sessions require login again.
