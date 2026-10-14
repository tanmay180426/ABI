# Universal dataset implementation and verification report

Historical verification record. Current upload limits and bundle behavior
supersede the October 7 limits below; see UNIVERSAL_DATASETS.md and
OLIST_IMPLEMENTATION_REPORT.md for the current 200 MiB contract.

Verified locally on 7 October 2026. Companion operational documentation:
[UNIVERSAL_DATASETS.md](UNIVERSAL_DATASETS.md).

## 1. Executive summary

The existing application now supports private structured uploads throughout its
dashboard, six analytics pages, filters, reports, saved-model compatibility and
AI assistant. Users explicitly select a registered READY dataset. Each request
resolves an authorized dataset and uses that context throughout the existing
metric layer. Switching clears prior filters/page/chat state and rejects stale
responses. Missing capabilities produce explanations; missing measurements stay
null. Failed/deleted selections never silently become Olist.

The loaded Olist reference remains registered, shared and read-only. Its verified
unfiltered totals are unchanged. Uploading does not retrain or replace models.
There are still exactly two roles: Admin and Analyst.

## 2. Architecture and initial audit

The initial checkout already contained uncommitted Priority 1–5 work: shared
analytics filters, administration improvements, split analytics/ML pages and
model metadata. That foundation was preserved and integrated into this coherent
change. No reset, replacement app, parallel dashboard or second chatbot was used.

The audit traced FastAPI routers, SQLAlchemy sessions, the shared
`analytics.metrics` layer/KPI wrappers, reports, assistant context, saved artifacts,
React routing, URL filters, authentication and administration. The important gaps
were fixed source CSV forecasting, static warehouse-only AI context, incomplete
report filtering, and no dataset ownership/selection/storage abstraction.

New registry/selection models and a typed-table adapter extend the existing
database. A shared BI dependency validates the caller, ID, readiness and query
parameters, then attaches the dataset to the request session. Existing metrics
choose the adapter centrally. Reference star-schema SQL remains available; flat
uploads use generated, isolated tables and SQLAlchemy expressions. Frontend pages
use their existing routes and one shared dataset provider/filter hook.

## 3. Dataset management

Dataset Manager supports naming, multipart upload, processing state, READY/FAILED
status, metadata inspection, optional semantic corrections, selection and deletion.
The header displays the active name and selector. Multiple uploads coexist under
UUID identifiers and per-user ownership. Selection is persisted per user; explicit
request IDs keep concurrent browser tabs scoped to their displayed dataset.

Supported inputs are UTF-8 CSV, flat-record JSON and single-sheet XLSX/XLS. Headers,
encoding, row widths, duplicates, nesting, finite values and resource bounds are
validated. Failed processing retains a safe diagnostic registry record and drops
partial table storage. Raw source bytes remain private in the database and are
excluded from responses and AI context. Upload filenames never become disk paths.

Defaults: 20 MiB source, 100,000 rows, 100 columns, 2,000,000 cells and a 60-second
processing budget. XLSX expanded contents/dimensions are bounded, and macro or
external-link workbooks are rejected. Imports use 1,000-row batches and indexes
on detected date/entity/category dimensions. Processing is synchronous and bounded.

## 4. Schema intelligence

Profiles include field names/types, missing count/percentage, uniqueness,
constants, duplicate rows, numeric summaries, date validity/ambiguity, semantic
role and confidence. ID-like numeric fields are excluded from measures. Native
booleans remain boolean; ambiguous dates are not silently interpreted.

Alias matching normalizes spaces, underscores and camelCase. Role selection
requires compatible types/values and distinguishes revenue from monetary amount,
customer/account from student IDs, quantity from arbitrary numbers, and dates from
coordinates/phone numbers. Multiple candidates disable automatic role selection.
Currency comes from explicit codes/suffixes or user confirmation; otherwise it is
unknown. Confidence is a heuristic score, not a calibrated probability.

Schema review can confirm roles, currency, analytical domain and day/month order.
Invalid mappings return 422. Corrections recalculate capabilities and revise the
dataset timestamp, causing active frontend content to reload. Public schema omits
internal generated storage-column names.

## 5. Analytics

Uploads display observed row/entity counts, measure totals/averages, numeric
min/max/median, categorical distributions and date trends. Generic measures use
neutral labels and units. Student marks/attendance are never presented as revenue;
transactions with `amount` retain amount semantics. Unavailable customer, product,
seller, order or delivery sections explain required missing roles.

Aggregates run in SQL with bound values. Entity/distribution rankings and time
series are bounded. Empty filtered populations are distinguished from missing
measures. Delivery duration requires analytical/delivered dates; on-time percentage
also requires estimated dates. No fabricated profit, percentages or sales appear.

A regression audit found a pre-existing category filter discrepancy: item-scoped
reports reconciled to 72,470.49 while the old order-total KPI produced 950,030.36.
KPIs now sum matching items for revenue/freight, and matching-order scope uses a
set-based IN query without multiplying orders. Unfiltered Olist totals stay intact.

## 6. Filters

The existing `useFilters` URL state and `FilterBar` are the only filter system.
Controls use the selected dataset's categorical values and confirmed date range.
Existing semantic filters and validated `column_filters` apply before aggregation,
reports, assistant context and ML inference. Dates support day/week/month/quarter/year
trends. Unknown, incompatible and conflicting parameters produce clear errors.

Navigation preserves filters. Switching datasets clears filters and remounts page
state. Generation checks reject prior dataset/user responses and downloads.
Identical concurrent GET requests coalesce by user, generation and full URL; there
is no completed-result cache. Lazy navigation unmounts old controls while loading.

## 7. Existing ML models

Contracts extend existing metadata; artifacts, pipelines, scalers and algorithms
are reused. Compatibility is evaluated against the selected filtered data before
artifact loading. Compatible responses include dataset identity; incompatible
responses contain `status: not_applicable`, reasons and no prediction. Missing
artifacts return 503; invalid/non-finite inference results return safe errors.

| Model/task | Required semantics and compatibility | Compatible inference |
|---|---|---|
| Revenue forecast | Date/revenue; commerce or transactions, BRL; 30 daily observations | Existing saved regression lag/rolling pipeline on selected history |
| Order forecast | Date/order identity; commerce or transactions; 30 daily observations | Existing saved order regression on selected counts |
| Product segmentation | Product/quantity/revenue/price/weight in grams; commerce, BRL; complete nonnegative features | Existing log transforms, StandardScaler and KMeans on selected products |
| Customer segmentation | Customer/account/order/date/revenue; commerce or transactions, BRL; complete inputs | Selected RFM using saved scaler and KMeans |
| Anomaly detection | Date/order/revenue; commerce or transactions, BRL; 30 daily observations | Saved IsolationForest on selected daily aggregates |
| Sales prediction | Date/order/quantity/location/category/revenue; commerce or transactions, BRL; complete inputs | Existing saved checkout pipeline on user-entered month/weekday/hour/items/state/category |

Uploaded temporal inference additionally requires the latest 30 observations to
be consecutive days; missing dates are not converted to zero. Reference forecasting
retains its existing observed-day convention. History comes from selected metrics,
never the training CSV. RFM transformation matches training, including exclusion
of reference purchases with null dates.

All six artifacts executed on the compatible 40-day uploaded fixture, including
both forecast targets and sales prediction. Forecast actual history reconciled
to 6,000 revenue/30 orders; product segmentation reconciled to 8,000 revenue/four
products. Student data returned Not Applicable before the loader could execute.
No training was run. Offline model metrics remain explicitly labeled Olist
evaluation results; no claim of accuracy on uploaded data is made.

## 8. Chatbot

The existing assistant receives authorized dataset identity, semantics, schema,
capabilities, active filters and calculated aggregates. Numerical requests for
named total/count/mean/median/min/max and bounded grouped sum/mean/count use
deterministic SQL facts. Answers cite the dataset and sources; unavailable metrics
explain missing requirements. A mean revenue request yields 500 on Sales A, rather
than its 1,000 total. Filtered Pune revenue reconciles to 200.

Switching resets assistant state. Ownership is enforced before context retrieval;
the assistant has no arbitrary SQL, administration data, full raw source or
cross-dataset retrieval. There is no vector store to contaminate. Uploaded names
and values are treated as untrusted data in the existing bounded Ollama prompt.
Qualitative provider operation remains optional, with a computed summary when
unavailable. Live Ollama generation was not tested; numerical grounding was.

## 9. Reports and exports

Every report consumes the shared dataset and complete filters. Existing KPI,
monthly, category and status exports remain, with uploaded numeric-statistics and
row exports added. Responses identify the dataset in `X-Dataset-ID`; frontend
downloads verify generation after receiving the blob. CSV headers and cells that
could start spreadsheet formulas are escaped. Numeric values remain numeric.
The real browser downloaded a Pune-filtered Sales A CSV and verified that Delhi,
Sales B and Student values did not leak into it.

## 10. Security and repository audit

Authentication applies to dataset and BI boundaries. Both roles may manage their
own uploads. Admin permissions do not grant access to another user's private data.
Cross-user list/detail/select/schema/delete/dashboard/analytics/filter/ML/report/AI
requests were tested. Unauthenticated requests return 401; unauthorized private
access returns 403. Disabled users and refresh-as-access tokens are rejected.
Two-role policy and last-admin protection remain functional.

SQL identifiers are generated UUID/cN names and revalidated; source fields must
belong to the registered schema. Query values use bound expressions. Tests cover
SQL injection, invalid field manipulation and CSV formula escaping. Source bytes,
file/path internals and SQL details are excluded from ordinary API errors.

Runtime searches covered Olist/Brazil/BRL, mock/fake/demo/placeholder/TODO/fallback,
known baseline constants, metadata, training and exports. Classification:

| Remaining occurrence | Classification |
|---|---|
| Reference registration, warehouse schema, ETL filenames/paths | Intentional shared reference adapter |
| ML training preparation/paths and metadata metrics | Existing offline reference training; never selected uploaded values |
| BRL prediction/formatting and compatibility contracts | Saved model units or explicit reference rendering |
| Landing reference description and admin source label | Explicitly named reference dataset/warehouse |
| Assistant provider “fallback” | Computed, selected-data summary when optional provider is unavailable |
| HTML placeholder text | Input guidance, not a fabricated result |
| Known business totals | Assertions in regression tests; no runtime literal metrics |

Runtime docstrings were corrected to describe selected-data metrics. Administration
source labels now explicitly say “Reference warehouse source.” No fake response
generator or hidden uploaded-to-Olist fallback was found in the integrated paths.
Staging excludes `.env`, secrets, raw archives/uploads, local databases, scratch
files, environments, node_modules, builds and trained binary artifacts. Example
credentials in `.env.example` and synthetic fixtures remain intentional project
examples. No new real user data is tracked.

## 11. Actual test and performance results

| Check | Executed result |
|---|---|
| Backend full suite | 95 passed, zero failed/skipped |
| Dataset integration, strengthened final assertions | 35 passed, including all six real artifacts |
| Frontend Vitest | 28 passed across six files |
| Existing ML pipeline | 8 passed |
| ESLint | Zero errors and zero warnings |
| TypeScript/Vite production build | Passed; 873 modules, lazy page chunks retained |
| Playwright Chromium, real API | 6 passed; final run 26.1 seconds |

Backend uses the loaded reference and isolated temporary databases for uploads.
Playwright starts a real API on a disposable SQLite backup, retaining reference
regression data without writing browser uploads into the developer database.
Tests exercise real parsers, SQL, routes, authentication and locally saved model
artifacts. Numerical results are not mocked.

The local Windows environment required loopback-enabled execution for FastAPI
TestClient and Playwright. Observed dependency notices include python-jose's
`utcnow` deprecation, pandas replacement downcasting, React Router future flags,
and Playwright's slow-file/color notices. These did not fail validation; ESLint
itself had no warnings.

| Synthetic local SQLite workload | Ingestion | Dashboard aggregate query | Reconciled revenue |
|---|---:|---:|---:|
| 10,000 rows / 445,862 bytes | 0.436 s | 0.056 s | 2,000,000 |
| 100,000 rows / 4,557,962 bytes | 8.108 s | 1.556 s | 20,000,000 |

These are single observed runs on this machine while checks were active, not
latency guarantees or production load tests. Bounds/oversized file-row-column-cell
rejection are separately tested. SQL aggregates keep full data out of dashboards
and LLM context; row exports intentionally return the bounded filtered population.

## 12. Dataset test matrix

| Dataset | Observed results | Verified behavior |
|---|---|---|
| Olist | 99,441 orders; BRL 13,591,643.70; 96,096 customers; 32,951 products; 3,095 sellers; 112,650 items | Shared reference, analytics, filtered report/AI reconciliation, existing model endpoints |
| Sales A | Two rows; revenue 1,000; mean/median 500; Pune 200 | Product/category/location/date analytics, filters, AI, exports |
| Student | Marks total 140, mean/median 70 | Neutral measures; student ID excluded; no revenue/customers; ML Not Applicable |
| Transaction | Amount total 400, mean/median 200 | Amount semantics, category/location/status/date; no invented revenue |
| Minimal | Value total 40, mean/median 20 | Date/value analytics without invented entities |
| Ambiguous | Age total 40, mean/median 20 | Phone/student IDs excluded; unknown slash dates disabled until confirmation; amount not automatically revenue |
| Multiple datasets | A 1,000 → B 5,000 → A 1,000; Student mean 70 | API/UI switching, stale-response protection, chat reset, new filters, isolated export/ownership |
| Compatible commerce fixture | 40 consecutive days; 8,000 revenue; four products | Six saved artifacts execute under validated BRL commerce contracts |
| JSON and XLSX | Revenue 300 each | Real parsing and shared KPI integration |

Malformed headers/rows/encoding, nested/duplicate/nonfinite JSON, unsupported
extensions, resource limits, failed selection, missing explicit selection and
deleted-active selection are covered by automated tests.

## 13. Priority 1–5 regression

The existing regression suite passes with the universal implementation. It covers
analytics reconciliation, dashboard KPIs, report permissions/content, ML registry
and routes, assistant responses, JWT/login/refresh, Admin/Analyst RBAC, user and
administration operations. Browser smoke verifies landing/login, real admin
dashboard/user administration, and Analyst BI access with direct admin denial.
Original artifacts and training transformations remain in place, with no upload
retraining. Existing unfinished changes were preserved in this implementation.

## 14. Known limitations

One flat logical table per upload is supported. Arbitrary multi-file joins,
multi-sheet workbooks and nested records are not inferred: ID spelling alone
cannot establish safe cardinality or additive financial grain. Related reference
files continue through the existing intentional ETL adapter. Larger sources need
reviewed limits, a job worker and database resource quotas. Processing timeout is
checked between phases/batches, not a hard parser subprocess termination.

XLS uses the declared xlrd reader, but no real legacy XLS fixture was verified in
this environment; missing readers produce a clear failure. CSV/XLSX/JSON were
verified. Localized currency strings/encodings may require export normalization.
SQLite is verified; an actual PostgreSQL instance was unavailable. Qualitative
live Ollama operation was not verified. Concurrent deployment/multiworker upload
throughput is not benchmarked. Heuristic semantics may need optional user review.

ML contracts deliberately restrict trained domain, units and feature availability.
Compatibility proves safe input construction, not useful generalization or accuracy.
Other domains/currencies may remain Not Applicable until a reviewed model exists.
Sales prediction retains its existing manual checkout input workflow. No currency
conversion, statistical drift evaluation or upload-specific model evaluation is
fabricated. Generated trained binaries remain local and ignored as before.

## 15. Important files changed

- Registry/ingestion: `backend/app/models/dataset.py`, `services/datasets.py`,
  `api/routes/datasets.py`, `main.py`, requirements and `.env.example`.
- Shared data: `analytics/tabular.py`, `analytics/filters.py`,
  `analytics/metrics.py`, KPI/dashboard, analytics/report/insights routers.
- ML/AI: `services/ml.py`, `api/routes/ml.py`, `ai_assistant/context.py`,
  six model metadata contracts, metadata schema/writer.
- Security/admin foundation: API dependencies, user service/model/routes,
  administration routes and existing administration pages.
- Frontend: `useDataset`, existing `useFilters`, `AppLayout`, API service,
  Dataset Manager, `DatasetResults`, `FilterBar`, redirects, navigation,
  dashboard, six analytics pages, ML pages, Insights, Reports and landing.
- Verification: backend dataset/reference tests, existing analytics tests,
  frontend API/results/filter tests, real dataset browser flow and isolated API
  launcher. Existing smoke regressions remain.
- Documentation: this report, `UNIVERSAL_DATASETS.md`, README, analytics,
  checklist/ML documents; `.gitignore` protects source archives and scratch data.

## 16. Git delivery

Current branch: `main`; remote: `origin` (existing project repository). The
implementation and this report are committed together with:
`feat(platform): enable universal dataset-driven analytics ml and ai`.
The commit containing this report identifies its exact SHA. The final delivery
message records the verified commit ID, remote push result and post-commit working
tree status. No destructive Git commands are part of the workflow.
