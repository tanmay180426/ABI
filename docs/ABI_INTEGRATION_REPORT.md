# ABI ML/backend integration audit

Historical integration audit (October 2026). Repository state, no-publication statements, runtime measurements and test counts below describe those audit runs. The later development checkpoint publishes reviewed source and metadata only; all serving/candidate binaries remain undistributed. See CHECKPOINT_RELEASE.md for current validation and publication boundaries.

## A. Repository verification

- Target: `<checkout-root>`, verified existing BI platform.
- Starting branch: `main`; integration branch: `integrate/abi-ml-backend`.
- Starting and current commit: `9aaa1200d7e28797ce177a84a920138b4b4b87c9`.
- Initial tree: clean, no pre-existing changes to discard.
- Original target origin, preserved: `https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git`.
- Source: `https://github.com/tanmay180426/ABI.git`, branch `main`, commit
  `f1d2a5a7c1b70ee9092403af5873e5c624f193c9`.
- Reference checkout: `<source-checkout>`.
- Source tree remains clean; no source commits, edits, or pushes.
- No LICENSE found. The owner explicitly confirmed Tanmay's permission to copy
  and adapt. Imported candidate files retain attribution and exact provenance.
  Nothing has been published or represented as newly trained target work.

## B. Source model inventory

The complete tracked tree, relevant commit diff/history, README, environment
template, dependency manifests, builders, training modules, serving layer,
routers, tests, and model metadata were inspected. The sole notebook is an empty
`{}` stub. The new artifact first appears in the source's final publish commit.
History searches for GradientBoosting, synthetic generation, and the 365-day lag
in Python/notebook code did not locate its actual training pipeline.

| Task | Algorithm and output | Ordered inputs / preprocessing | Source inference assets | Evaluation and decision |
|---|---|---|---|---|
| Orders forecast | Linear Regression; daily orders | `lag1,lag7,lag14,lag30,roll7,roll30`; shifts before rolling means, 30 observations | Bundled model/features expected in `sales_forecast_orders.joblib`; absent from source Git | Chronological 80/20; seasonal-naive lag-7 baseline; MAE 35.2808 vs 56.0744. C: reuse target artifact |
| Original revenue training script | Linear Regression; daily item revenue | Same six inputs; original builder sums item price per order then day | Script writes `sales_forecast_revenue.joblib`; source registry now points to another algorithm | Script retains chronological 80/20 and lag-7 baseline. It cannot reproduce the new model. C: retain target Linear Regression |
| ABI revenue candidate | Metadata claims GradientBoostingRegressor, 300 trees, learning rate .05, depth 5, seed 42; daily revenue | 27 ordered calendar, revenue/order lags at 1/7/14/28/30/365, and rolling mean/std at 7/14/30/90 | `gradient_boosting_sales_model.joblib` (1,237,274 bytes), `model_metadata.json`, changed revenue registry metadata | Historical MAE 3401.701329, RMSE 4502.422932, R2 .6331059, MAPE 16.2708028; no verified split/baseline. F: blocked candidate |
| Checkout sales prediction | Best of Linear Regression / Random Forest; metadata selects Linear Regression; item revenue | Numeric month, weekday, hour, item count -> StandardScaler; state/category -> OneHotEncoder, unknown ignored, min_frequency 20; missing categorical -> unknown | `sales_prediction.joblib` bundles full pipeline and feature list; absent from source Git | Random 80/20 seed 42; LR MAE 96.048 vs RF 97.122; n_train 78,932, n_test 19,734. C: reuse target |
| Customer segmentation | KMeans, selected k=2; cluster IDs | `recency_days,frequency,monetary_log`; latest date+1 recency, unique orders, log1p monetary, saved StandardScaler | `customer_segmentation.joblib` model/scaler/features/k; absent from source Git | k=2..6, fixed sample up to 10,000, silhouette .6858, not supervised accuracy. C: reuse target |
| Product segmentation | KMeans, selected k=4; cluster IDs | `qty_log,revenue_log,avg_price,product_weight_g`; log1p, median imputation, saved StandardScaler | `product_segmentation.joblib` model/scaler/features/k; absent from source Git | Sampled silhouette .4798; training medians not separately persisted. C: reuse target; no invented replacement imputer |
| Anomaly detection | IsolationForest, 200 trees, contamination .03, seed 42; anomaly label and decision score | `orders,revenue` floats, no scaler | `anomaly_detection.joblib` model/features/contamination; absent from source Git | Unsupervised fit on daily series, recorded counts rather than held-out predictive accuracy. C: reuse target |

These five legacy task families already exist in the target with six local
joblib files. Source training builders read local Olist CSVs through configured
paths; processed training tables are not bundled. Local raw data is not imported.
No source models were retrained. Evaluation figures above are source historical
records, not newly reproduced evaluations.

### Candidate evidence boundaries

- SHA256: `e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`.
- Static bytes contain `sklearn.ensemble._gb`, `GradientBoostingRegressor`,
  `_sklearn_version`, `1.6.1`, and feature-name strings. Subsequent isolated
  container loading verified the actual estimator, settings and feature order.
- Both source metadata files agree on the 27-feature order.
- Recorded training dates: 2017-09-04 to 2024-09-04. The owner reports extending
  Olist to approximately eight years using synthetic records. Those statements
  are retained separately; no generation script, record provenance, or dataset
  fingerprint verifies composition or exact coverage.
- Original Olist money is BRL. Candidate registry claims BRL/Brazilian commerce;
  synthetic currency/units and exact revenue target are not verified in code.
- Actual Gradient Boosting training code, split strategy/dates, randomization
  during data generation, baseline, test data, preprocessing fitting state, and
  reproducible performance evaluation are missing.
- Source serving code uses sample standard deviation (ddof=1), calendar fields,
  prior-history lags, and previous-week orders for future order estimates. The
  absent training pipeline means these cannot be asserted to match training.
- Forecast CSVs at 7/30/90 days are precomputed outputs, not trained assets or
  selected-dataset predictions. They were not imported into the serving path.

## C. Backend fixes and actual target adaptations

| Source finding | Target issue / decision | Target change | Proof |
|---|---|---|---|
| `core/config.py` anchors default SQLite location | Target's relative default could open another database when launched outside backend | Independently implement fixed backend default, normalize only documented default aliases, preserve custom/test URLs | cwd/environment/custom URL tests |
| Source forecast rejects insufficient history and sorts dates | Target direct service could load before validation and treat unordered/sparse observations as daily lags | Validate horizon, target, minimum history, sort, reject duplicate/gapped/nonfinite history before load | Invalid history tests, real existing-model smoke |
| Source reindexes/fills calendar and discards date_from/date_to | Conflicts with selected filters and invents zeros for absent observations | Do not import; preserve filters; extend existing consecutive-day eligibility to reference datasets | Filter identity and sparse reference tests |
| Source clips prediction via max(0, prediction) | Not proof of numerical validity; can hide invalid output | Reject nonfinite predictions before recursive reuse; keep finite model output semantics unchanged | Nonfinite estimator boundary test |
| Auth, sessions, CORS, ownership and existing routes | Source retains same implementations; no source fix to transplant | Keep target authority and routers unchanged | Existing auth/RBAC/ownership suites and real HTTP checks |
| Batch/folder/ZIP upload | Distinct capability; target already rejects unsupported executables. Source increases resource limits and adds partial commits | Not imported blindly; ZIP resource limits/error paths and transaction semantics need their own adaptation before exposure | Source static audit, existing target upload tests retained |
| Multi-dataset joins/unions | Source compares uniqueness on first 5,000 rows, only first two IDs for combine, directly merges full frames without enforced output cardinality limit; compatibility report is not enforced by execute | Reject direct transplant; avoid schema/session/UI expansion in this ML integration | Static comparison of `check_combine_compatibility`, `preview_combine`, `execute_combine` |
| Automatic dashboard grain/zero filling | Changes existing analytics definitions and missing-observation semantics | Preserve authoritative existing shared metric layer | Analytics/report/AI regression tests |

No claim of measured performance improvement is made. Target prediction cache,
dataset ownership, session management and entry point are retained.

## D. Compatibility matrix and API/persistence review

| Source functionality | Target equivalent / conflict | Decision and rationale |
|---|---|---|
| ABI Gradient Boosting revenue | Existing `/api/ml/forecast?target=revenue` uses a different six-feature Linear Regression model, Olist evaluation and 30 observations | F: separate inactive candidate. Do not substitute 27 features/365-day synthetic-domain model or compare incompatible metrics |
| Orders / sales / segments / anomaly tasks | Existing authenticated dataset-aware contracts and trusted local artifacts | C: reuse; no new valuable trained assets in source Git |
| Rooted DB default | Same storage/session architecture, actual cwd defect | D: minimal adaptation; no database migration |
| Forecast robustness | Same API result shape and current preprocessing | D: validation adaptation only; no new estimator |
| Analysis sessions and combine routes | New `app_analysis_session` table and `/api/analysis/*`, new UI | Not transplanted: unsafe unrestricted merge growth and semantic compatibility enforcement gaps |
| Batch/ZIP | New dataset routes and larger limits | Not transplanted: distinct ingestion feature requires bounded resource/transaction design, not a replacement backend fix |

Target and source overlapping route paths retain FastAPI dependency-based auth,
Admin/Analyst permissions, selected-dataset resolution and stable payloads.
No imported inference bypasses semantic role/domain/currency eligibility.
Missing active artifacts remain 503; incompatible datasets remain explicit
`not_applicable`; invalid finite-output boundaries remain sanitized 422.
Candidate remains unreachable through active registry or forecast API.

Persistence remains the target's SQLAlchemy engine, models and request sessions.
No schema changes, migrations, destructive commands, or app database rewrites.
No secret `.env` values or private rows copied.

### Dependency comparison

| Dependency | Target manifest / installed | Source manifest | Decision |
|---|---|---|---|
| scikit-learn | 1.5.2 / 1.5.2 | backend 1.6.1; ML requirements still 1.5.2; artifact has 1.6.1 string | Conflict; no broad upgrade or unverified cross-version load |
| numpy | 2.1.3 / 2.1.3 | 2.1.3 | Retain |
| pandas | 2.2.3 / 2.2.3 | 2.2.3 | Retain |
| joblib | 1.4.2 / 1.4.2 | 1.4.2 | Retain; external pickle execution risk remains |
| FastAPI / SQLAlchemy / pydantic settings | .115.5 / 2.0.36 / 2.6.1 pins | Same | Retain, validator supported |

No target dependency install/upgrade, new environment variable, training dependency,
or external service credential is introduced. A separate test-only Docker image
uses scikit-learn 1.6.1 with numpy 2.1.3, pandas 2.2.3 and joblib 1.4.2; it is not
used by the API. Source README/docs retain old
Linear Regression claims and are not proof of candidate provenance.

## E. Files and artifacts

Modified:
- `backend/app/core/config.py`: deterministic dev DB default.
- `backend/app/services/ml.py`: existing forecast validation and eligibility.

New:
- `backend/tests/test_abi_reliability.py`: focused regression tests.
- `docs/ABI_INTEGRATION_REPORT.md`: audit, decisions and verification record.
- `ml/candidates/abi-revenue/gradient_boosting_sales_model.joblib`: unchanged candidate.
- `ml/candidates/abi-revenue/source_model_metadata.json`: original metadata.
- `ml/candidates/abi-revenue/source_registry_metadata.json`: original registry claims.
- `ml/candidates/abi-revenue/provenance.json`: checksum, permission, synthetic data disclosure and blockers.
- `ml/candidates/abi-revenue/README.md`: activation requirements and attribution.
- `ml/candidates/abi-revenue/smoke_result.json`: actual container smoke result/input.
- `scripts/ml/abi_candidate_smoke.py`: isolated computation/assertion harness.
- `scripts/ml/Dockerfile.abi-audit`: separate pinned-base test runtime.

No active model, frontend, dependency manifest, environment template, migration,
or existing metadata file changed. Binary is below normal Git size limits;
no LFS was introduced. The candidate directory is outside automatic discovery.

## F. Model validation

- Candidate checksum, byte count and metadata feature-order consistency verified.
- Initial host-level artifact loading rejected by automatic approval review because joblib
  can execute arbitrary pickle code with local user privileges; Python `-I` and
  a temporary directory do not provide OS isolation. No rejected operation was
  bypassed; no external model was loaded in the Windows host process.
- Safer container smoke subsequently passed: non-root UID 65534, network none,
  read-only root and two narrow read-only mounts, all capabilities dropped,
  no-new-privileges, 1 CPU/1 GiB memory/64 PID limits; ephemeral /tmp, no credentials
  or Docker socket mounted. Container removed after run.
- Actual estimator GradientBoostingRegressor: 300 estimators, learning rate .05,
  max depth 5, seed 42; 27 feature names/order match both metadata files.
- Constructed input: calendar 2024-09-05; all revenue lag/mean fields 10,000,
  all order lags 70, revenue rolling std fields 1,000. Feature input/order stored
  in `smoke_result.json`; output shape [1], finite prediction 12520.387241414006.
  This is a computational smoke test, not accuracy or unit validation.
- Dropped-column and infinite-valued vectors rejected with ValueError.
- Actual trained preprocessing equivalence and predictive evaluation: not verified.
- No accuracy claims, new candidate evaluation, fake fallback predictions,
  invented scalers, training split or feature transformations.
- Existing trusted orders artifact is exercised using 35 consecutive fixture
  days; real existing-model predictions must be finite and preserve filters.
- Missing artifact, short/gapped/duplicate/nonfinite history, invalid target,
  and nonfinite recursive output have explicit regression coverage.
- Existing revenue endpoint exercised over January 2018 on a disposable Olist
  snapshot: authenticated response available with seven forecast points.

## G. Regression validation

Baseline before modifications:
- Backend: **136 passed, 15 skipped**, no failures (synthetic disposable warehouse).
- ML: **8 passed**, no failures, no training.
- Frontend: **42 passed**, 8 files, no failures.
- Reference-specific skips require explicit Olist snapshot, not missing source
  model artifacts. Existing six target artifacts present locally.

Initial post-change backend run: **151 passed, 15 skipped**, no failures.
Final backend run including the two additional tests and disposable real Olist
snapshot: **168 passed, 0 failed, 0 skipped** in 439.84 seconds. This includes
**17 new regression cases**. ML and frontend baselines remain 8 and 42 passing;
those files and dependencies are unchanged. Candidate container smoke passed.
The backend result includes **45 passing auth/RBAC/security/admin/user tests**
(`test_auth`, `test_rbac`, `test_release_security`, `test_password_limits`,
`test_refresh`, `test_users`, `test_admin`), counted through collection after
the passing run. API integration is covered by the 168-test backend suite and
the real HTTP checks below; no separate additional API suite count is claimed.

Real HTTP checks on port 8001 against disposable warehouse copy:
- `/health`: ok; application startup completed.
- `/api/auth/login`: Analyst login succeeds; token not logged.
- `/api/ml/status`: five existing feature groups.
- Existing revenue forecast: available, seven points.
- Anonymous ML status: **401**.
- Analyst administration: **403**.

Build/lint/typecheck and browser E2E not rerun: frontend/dependencies unchanged;
frontend baseline is passing. Backend suite covers routes, dataset isolation,
semantic compatibility, auth/RBAC, uploads, reports and dataset-aware assistant.
Existing warnings include jose datetime deprecation, pandas downcasting and
intentional overflow rejection cases. No warning is presented as a passing test.

## H. Limitations

Primary trained capability remains blocked on missing actual Gradient Boosting
training/preprocessing and generation code, real/synthetic provenance, currency,
split/baseline/evaluation and production package reconciliation. Safe isolated
artifact loading is verified; activation in the current runtime is not approved.
Copy permission is resolved. Current active Olist model is retained.

Multi-dataset merging and batch/archive UI are not imported as backend replacements.
Their distinct feature scope, cardinality/resource and semantic constraints need
verified adaptations; copying them does not resolve the candidate's missing training
contract. No unrelated architectural expansion or model retraining was performed.

## I. Git safety

- Integration branch only; original target HEAD and origin preserved.
- Source checkout clean and unchanged.
- No initial local work existed to discard; no work discarded.
- No target commit, merge into main, push, reset, rebase or history rewrite.
- No real database migration/data loss; tests use disposable copies.
- Final diff inspected; `git diff --check` passes.
- Temporary port-8001 API test process stopped after verification. Audit
  containers removed automatically. Docker was started for safe validation;
  the local `sem5-abi-model-audit:local` image remains for reproducibility.

## J. Prior integration verdict

**INTEGRATION PARTIAL — SOME CAPABILITIES BLOCKED**

Useful target-side reliability changes and candidate provenance preservation are
implemented locally. The new trained model is deliberately inactive until its
actual pipeline and safe validation are available. This is not a claim of completed
model integration or synthetic-model generalization to Universal Dataset uploads.

# Completion verification — 2026-10-13

This continuation preserves the original audit above. Results in this section
are fresh checks of the current working tree; prior results remain dated evidence.

## A. Current repository state

- Target root: `<checkout-root>`.
- Branch: `integrate/abi-ml-backend`.
- HEAD: `9aaa1200d7e28797ce177a84a920138b4b4b87c9`.
- Origin unchanged: `https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git`.
- Initial continuation diff was exactly the earlier config/forecast changes,
  regression tests, report, candidate directory and Docker audit scripts. All preserved.
- Source checkout path verified; source branch/checkout HEAD remain main and
  `f1d2a5a7c1b70ee9092403af5873e5c624f193c9`.
- `git fetch origin main` refreshed source references; `origin/main` is still
  that exact commit, with no diff from the previous audit. No source files,
  source branches, history or remote were changed.
- Latest tracked-tree/history searches again found no actual Gradient Boosting
  fit/preprocessing script or synthetic generator. Notebook remains `{}`.
- Local processed `daily_series.csv` has 634 rows, columns date/orders/revenue/
  avg_order_value, and date coverage 2016-09-04 through 2018-10-17. It does not
  establish the reported eight-year candidate training dataset. Only aggregate
  schema/coverage inspected; private rows were not printed or copied.

## B. Existing changes and further work

Prior config/path fix, forecast validations, 17 backend reliability cases and
candidate preservation remain unchanged. No application defect was found by
the fresh verification, so no additional backend/frontend product code changes
were needed. Candidate bytes and active model files remain intact.

New continuation files/changes:
- `frontend/e2e/abi-integration.spec.ts`: three real-browser tests for active
  forecast, all model APIs, console/network health, session logout, ML admin and
  honest artifact availability. No network mocking or fake predictions.
- `docs/ABI_ML_HANDOFF_REQUEST.md`: precise owner evidence checklist and rationale.
- This report: appended verified completion evidence without removing prior audit.

## C. Website verification

The configured Playwright web servers use separate ports and
`backend/tests/e2e_server.py`, which sets an absolute disposable SQLite path
before importing the application and takes a read-only SQLite backup. No ETL,
developer database seeding or fake-account creation was used. Existing dev
Admin/Analyst authentication was used on disposable copies.

| Workflow | Actual browser / HTTP evidence |
|---|---|
| Login and logout | Real Admin/Analyst login succeeds; Sign out removes token/refresh/user storage; returning to dashboard redirects to login |
| Dashboard and analytics | Dashboard renders, analytics navigation and delivery applicability state verified |
| Dataset selection/switching | Real sales/student uploads reach READY; selected data changes; prior AI answer and filter options disappear; no previous-dataset totals leak |
| Filters | Region filter changes sales totals; January 2018 date bounds reach the existing revenue forecast |
| Reports/exports | Real filtered CSV download contains Pune rows and excludes Delhi, other sales dataset amounts and student records |
| Active revenue forecast | Real API returns 30 finite predictions; UI renders 30 table rows, chart and `Model: Linear Regression (Daily)` |
| Product segmentation | Real page renders Products Analyzed after actual model inference |
| ML not applicable | Incompatible uploaded sales/student semantics show existing explicit Not Applicable state |
| Artifact unavailable | Separate run points ML_MODELS_DIR to new temporary metadata-only directory; compatible Olist inference returns actual 503; UI displays sanitized missing-artifact message without forecast table/totals |
| AI assistant | Dataset-aware deterministic real API answers total revenue for two distinct uploads and mean marks for student upload |
| Admin/RBAC | Analyst UI blocks admin direct URL; actual authenticated Analyst administration API returns 403; Admin user management works |
| Model administration | Six existing artifacts shown; existing sales_forecast_revenue.joblib listed; candidate joblib/algorithm absent |
| Browser errors | Active ML/logout test collects page errors, console errors, failed network requests and API 5xx responses: zero unexpected errors. ERR_ABORTED requests caused by navigation cancellation are excluded explicitly |

The missing-artifact 503 is deliberate, not an unexpected server failure. No
optional artifact's absence was hidden by a fake chart or fallback model.
Existing React Router future-flag and NO_COLOR/FORCE_COLOR warnings remain
non-fatal tooling notices. No browser-test-only toggles were added to product UI.

## D. Existing ML status

All verified through authenticated, selected-reference real HTTP requests in
the added browser flow, with the existing local trusted artifacts and runtime.

| Task / endpoint | Active artifact | Requirements and fresh result |
|---|---|---|
| Orders, GET /api/ml/forecast?target=orders | sales_forecast_orders.joblib | Commerce/date/order semantics, >=30 consecutive filtered days; January 2018 request returns available |
| Revenue, GET /api/ml/forecast?target=revenue | sales_forecast_revenue.joblib | Date/revenue, confirmed compatible commerce/BRL context, >=30 consecutive days; actual UI/API returns available and finite predictions |
| Sales, POST /api/ml/predict/sales | sales_prediction.joblib | Valid checkout fields and commerce dataset eligibility; real validated payload returns finite item revenue |
| Customer segments, GET /api/ml/segments/customers | customer_segmentation.joblib | Customer/order/date/revenue and units; returns available using saved model/scaler |
| Product segments, GET /api/ml/product-segmentation | product_segmentation.joblib | Product/quantity/revenue/price/weight grams; available API and rendered page |
| Anomaly, GET /api/ml/anomalies | anomaly_detection.joblib | Daily orders/revenue; January 2018 request available |

Response shapes and shared dataset/filter/auth dependencies remain unchanged.
No candidate evaluation values are substituted into the active model catalog.

## E. Gradient Boosting activation gate

Source SHA remains `f1d2a5a7c1b70ee9092403af5873e5c624f193c9`; artifact SHA256
remains `e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`.
Fresh restricted Docker execution reverified the actual GradientBoostingRegressor,
300 estimators, .05 learning rate, depth 5, seed 42 and all 27 ordered features.
Constructed-feature smoke result remains finite; no accuracy was measured.

| Mandatory evidence / state | Result |
|---|---|
| Actual training script located | NO |
| Synthetic generator and versioned data lineage located | NO |
| Candidate target construction and synthetic currency/unit verified | NO |
| Training-to-serving preprocessing equivalence verified | NO |
| Exact minimum history derived from original training | NO; registry claims 365, actual code absent |
| Chronological split, leakage prevention, baseline and evaluation reproduced | NO |
| Artifact identity and feature names/order | YES |
| Required trained preprocessing state completeness | UNKNOWN |
| Candidate safely loaded/inferred with compatible library version | YES, restricted Docker sklearn 1.6.1 |
| Production dependency solution | NO; target sklearn 1.5.2 unchanged |
| Candidate active in production/API discovery | NO |
| Existing model usability and platform regression | Verified by fresh reliability/ML/browser tests and prior full backend run |

Dependency options: a shared runtime upgrade is not justified before provenance
verification and would require checking every existing serialized target model.
A second inference microservice is not introduced. A reproducibly exported
owner artifact may be assessed when its actual training pipeline is available.
Docker is a test-only environment, not a new deployed inference architecture.
Neither fitting nor retraining was performed, and source historical metrics were
not compared to target metrics on incompatible evaluation data.

## F. Backend fixes rechecked

Stable database-path/default aliases, custom URLs and isolated test database
paths pass the current tests. Forecast service validates target/horizon/history
before loading; sorting, duplicates/gaps/nonfinite data, preserved filter identity,
finite recursive output and missing artifact are covered. Sparse reference dates
receive explicit incompatibility; unknown dates are not fabricated as zeros.
No new implementation fix was necessary. Active-model API/UI remains compatible.

## G. Fresh test results and commands

| Command (directory) | Fresh result |
|---|---|
| `python -m pytest tests/test_abi_reliability.py -q -p no:cacheprovider` (backend, installed Python313) | 17 passed, 0 failed/skipped |
| `python -m pytest tests -q -p no:cacheprovider` (ml) | 8 passed, 0 failed/skipped; no training |
| `npm test -- --reporter=dot` (frontend) | 42 passed, 8 files, 0 failed/skipped |
| `npm run lint` (frontend; rerun after adding E2E tests) | Exit 0 |
| `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json` (frontend) | Exit 0 |
| `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.contracts.json` (frontend) | Exit 0 |
| `npm run build` (frontend) | Exit 0; tsc -b and Vite production bundle, 873 modules |
| Initial configured `npm run e2e` | 6 passed, no failures/skips |
| Expanded `npm run e2e -- --workers=1` before final availability case | 8 passed, no failures/skips |
| Final complete `npm run e2e -- --workers=1` | 9 passed, 0 failed/skipped |
| Focused active-ML browser rerun after exact date assertions and settled screenshot | 1 passed; first forecast date 2018-02-01, all history dates within January 2018 |
| Metadata-only run `npm run e2e -- e2e/abi-integration.spec.ts --workers=1 --grep 'forecast page honestly reflects real artifact availability'` | 1 passed, actual missing-artifact 503 and UI checked |
| Restricted `docker run ... sem5-abi-model-audit:local` | Exit 0; estimator, feature order, finite result, malformed/nonfinite rejection reverified |

E2E environment prepends the installed Python313 executable directory to PATH.
Normal suite uses SEM5_E2E_BACKEND_PORT=8013 and frontend port=5183. The missing
artifact run uses ports 8023/5193, SEM5_E2E_EXPECT_MISSING_ARTIFACT=true and a
temporary directory of copied metadata with no joblib files. The directory is
removed after testing. All database mutation occurs on disposable test copies.

The full 168-passing backend/Olist result above is prior evidence, not falsely
reported as rerun. Current backend implementation and backend tests are unchanged
from that passing tree; fresh 17-case reliability checks, 8 ML tests and actual
browser/live model paths cover the continuation. No new backend defect/change
required rerunning that identical full suite. Frontend product code/dependencies
are unchanged; its complete missing checks have now been executed.

## H. Security and Git safety

All initial changes preserved. Source tracked tree and branch remain unchanged;
fetch updates references only. Origin and target main ref unchanged. No commit,
merge, push, history rewrite, real database migration, secret or private data
addition. Candidate stays outside automatic discovery. Active artifacts and
runtime dependency pins untouched. Docker rerun retains the approved isolation
flags; no host deserialization, network, credentials or Docker socket mount.
Browser tests use actual local HTTP; no fake ML result or authentication bypass.
Final Git checks confirm main and integration HEAD still equal the starting
commit, origin preserved and `git diff --check` clean. The audit container and
temporary test ports 8013/5183/8023/5193 are checked after execution; no test
servers are intentionally retained. No unrelated live development server is stopped.

## I. Remaining actions

1. Completed: repository/source refresh, provenance reassessment, fresh frontend
   unit/lint/typecheck/build/E2E checks, real active-model/browser/session/RBAC and
   unavailable-artifact checks, reliability/ML tests, safe candidate smoke and handoff.
2. No further candidate training/evaluation work can be completed from the
   audited repository evidence alone. Loading an estimator is not its original pipeline.
3. Source-owner evidence required: exact training/preprocessing/generation code,
   data manifest and real/synthetic composition, target/currency, split/leakage
   controls, baseline/evaluation and training/serialization package manifest.
   See `ABI_ML_HANDOFF_REQUEST.md` for why each item is needed.
4. No approval needed for the completed verification. Retraining, model replacement
   or major deployment/runtime changes require a later evidence-backed decision.

## J. Final completion verdict

**PLATFORM VERIFIED; CANDIDATE MODEL BLOCKED ON MISSING TRAINING EVIDENCE**

The current website and existing ML workflow have actual browser/API evidence,
fresh frontend quality checks, reliability and ML tests. The inactive candidate
loads only in the restricted audit container. Its mandatory training/provenance/
preprocessing/evaluation gates still fail; no production activation is claimed.

## Subsequent API connectivity audit — 2026-10-13

The later endpoint audit is documented in [API_ENDPOINT_COVERAGE.md](API_ENDPOINT_COVERAGE.md).
It accounts for 56 registered method/path pairs and 41 frontend network definitions,
connects the existing order/customer/anomaly/sales ML capabilities, fixes CSV
refresh/session handling and ML filter propagation, and corrects CSV OpenAPI metadata.
Final fresh verification: backend 275 passed, ML 8 passed, frontend 47 passed,
lint/both TypeScript checks/build passed, real browser E2E 16 passed plus a separate
missing-artifact variant 1 passed. The source checkout remains unchanged and the
ABI Gradient Boosting candidate remains inactive with the same missing training evidence.
This follow-up adds targeted frontend functionality; earlier continuation observations
describe the earlier scope and are retained as historical evidence.

The subsequent [FREE_API_AUDIT.md](FREE_API_AUDIT.md) documents enforcement and
verification of core operation without paid provider credentials, loopback-only
optional AI, actual installed local generation with cloud disabled, and the
unchanged inactive candidate. It preserves this report's historical results.
