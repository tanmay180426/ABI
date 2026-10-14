# Olist import, relational analytics and ML implementation report

Historical local verification (2026-10-13). Paths below are generic placeholders for local evidence that is not distributed. Dataset imports, model inference, local server availability and account/bundle state describe that isolated verification run, not contents supplied by a Git clone. The later development checkpoint includes source/tests/docs only and excludes all data and weights. See CHECKPOINT_RELEASE.md.

Verified on 13 October 2026; changes were uncommitted and unpushed at that time.


## Verdict

The supplied ZIP imported all **9/9 CSVs**, **3,028,547 parsed rows** and **18,065,201 cells** into one private bundle. Full-data Dashboard totals match an independently streamed CSV calculation, and the browser executed the existing real orders forecast on that same bundle. The existing six trained artifacts remain unchanged and were exercised with synthetic bundle inputs. **Original ABI Gradient Boosting activation remains blocked** by missing training/preprocessing and provenance/evaluation inputs. This is not a claim that all three deliverables are complete.


## Root causes and corrections

- The first rejection was `total > upload-limits.max_bytes`: the backend default was 20 MiB and the UI correctly enforced that stale default. ZIP expansion was also incorrectly charged against the same byte cap.

- The same 100,000-row / 2,000,000-cell / 60-second policy was used for a whole bundle, and every table frame was retained simultaneously. Bundle budgets and a single-worker, cancellable status job now handle large uploads one table at a time.

- CSV dialect sniffing on a review-text sample set `doublequote=False`; the exact reviews CSV then produced 115 mismatched records. Standard doubled-quote escaping and multiline parsing now preserve the measured 380,938 reviews.

- SQLite delete-journal writes blocked authenticated status readers. WAL, explicit transactional table DDL and bounded batch inserts keep imports atomic and status polling available.

- A bundle previously selected only its first table and rejected all combined analysis. Validated order-grain and native-fact adapters now serve the existing Dashboard, shared filters, Insights, reports and compatible ML tasks.

- Raw source BLOBs were fetched on ordinary catalog/analytics reads, and repeated fact aggregates made the full-data Dashboard slow. Source BLOBs are deferred, aggregate indexes are generated, and monetary facts are aggregated independently without joining items to payments.

- Overlapping schema refresh / dataset selection, and reselecting the current dataset, invalidated valid in-flight requests. Selection epochs and dataset/version stamps preserve stale-response protection without cancelling an unchanged scope.

- The demonstration API was pointed at a metadata-only model folder. The verified local runtime now uses the existing trusted `ml/models` binaries. Registry status actually loads the serving bundle and checks feature order and required scalers; binary presence, runtime readiness, selected-data compatibility and task inference remain distinct.


## Resource contract

| Budget | Current default |
|---|---:|
| Incoming file / aggregate folder / compressed ZIP payload | 209,715,200 bytes (200 MiB) |
| Multipart framing allowance | 1 MiB, separate from file payload |
| ZIP expanded CSV bytes | 536,870,912 bytes (512 MiB) |
| CSV tables / ZIP entries | 32 / 64 including directories |
| Per-member compression ratio | 100:1 |
| Bundle total rows / cells | 5,000,000 / 40,000,000 |
| Per bundle table rows / cells | 1,500,000 / 12,000,000 |
| Columns per table | 100 |
| Bundle processing deadline | 900 seconds |
| Single-file rows / cells / deadline | 100,000 / 2,000,000 / 60 seconds, retained |
| Single XLSX expanded-byte safety budget | 200 MiB, retained independently of upload cap |

Effective settings are exposed by authenticated `/api/datasets/upload-limits`. Existing `.env` values remain untouched; the verified runtime explicitly sets the 200 MiB payload contract. Pre-parser middleware bounds declared and chunked multipart bodies and limits reception while imports run. Large imports return 202 with an owner-scoped job ID; the UI polls actual stage/table/row counts, can cancel, and remembers the job for resume. No invented percentage or automatic retry is used. Job status is in memory and expires one hour after completion; restart loses job status, so check persistent bundles before retrying. Use one API worker for this local setup.


## Exact archive manifest

Source: `<approved-local-data>/Olist_Dataset_2016_2021.zip`. Compressed: **116,170,358 bytes** (110.79 MiB). Expanded CSVs: **291,450,197 bytes** (277.95 MiB). Expansion ratio: **2.5088:1**. No malformed CSV record counts in the independent standards-based manifest; no supported CSV was skipped.

The screenshotÃ¢â‚¬â„¢s 120.34 MiB folder is not assumed to have identical contents to this ZIP. The exact ZIPÃ¢â‚¬â„¢s expanded folder is 277.95 MiB and therefore exceeds the genuine 200 MiB folder payload cap: use its compressed ZIP. Folder selection was genuinely browser-tested with all nine synthetic tables; the supplied ZIP was genuinely selected/uploaded in the browser.

| CSV | Rows | Columns | Expanded bytes |
|---|---:|---:|---:|
| olist_customers_dataset.csv | 385,650 | 5 | 33,749,361 |
| olist_geolocation_dataset.csv | 1,000,163 | 5 | 61,273,883 |
| olist_order_items_dataset.csv | 437,572 | 7 | 58,731,812 |
| olist_order_payments_dataset.csv | 402,457 | 5 | 22,008,377 |
| olist_order_reviews_dataset.csv | 380,938 | 7 | 45,440,210 |
| olist_orders_dataset.csv | 385,650 | 8 | 67,689,792 |
| olist_products_dataset.csv | 32,951 | 9 | 2,379,446 |
| olist_sellers_dataset.csv | 3,095 | 4 | 174,703 |
| product_category_name_translation.csv | 71 | 2 | 2,613 |

Atomic import processing: **372.212 seconds**. The later aggregate-index correction was applied to this same preserved bundle in 6.855 seconds; subsequent imports build those indexes before READY. The browser confirmed every tableÃ¢â‚¬â„¢s exact row and column counts after READY. Initial full-archive attempts exposed journal/parser/dashboard issues; they were not reported as success. The successful complete import was preserved, then the final full-data Dashboard/filter/ML browser workflow was rechecked on that same committed bundle.


## Architecture, relationships and calculations

`app_dataset_bundle_table` groups existing UUID Dataset rows into one bundle, with separate typed SQL tables and safe relative-path metadata. Raw sources remain private, deferred and independently stored. Duplicate basenames in different folders are supported; duplicate normalized paths are rejected. No unrelated CSVs are concatenated. Registry changes are additive and existing one-file datasets remain usable.

Relationships use complete-table uniqueness/type/key-overlap checks. Orders Ã¢â€ â€™ customers, items/payments/reviews Ã¢â€ â€™ orders, items Ã¢â€ â€™ products/sellers and products Ã¢â€ â€™ category translation are recorded when validated. Duplicate fact/dimension keys disable the affected calculation. Geolocation remains separately inspectable; repeated ZIP prefixes are not blindly joined. Missing/unmatched keys and disabled capabilities are disclosed.

Orders/customers use order grain. Revenue is **SUM(item price)** over qualifying items, excluding freight and never added to payments. AOV is qualifying item revenue / matching distinct orders. Category/seller filters narrow item prices and eligible orders. Payment/review filters select matching orders by existence; payment/review summaries cover all their facts. Reviews are averaged over matching review records. Delivery days use observed delivered-customer minus purchase timestamps, excluding null/negative intervals. Empty/unavailable amounts stay unavailable rather than becoming fake zeroes.

The existing Dashboard now shows bundle/table context, source coverage/quality, ten supported KPI cards, a real time trend, status and category-revenue charts, category details, shared filters/reset and recoverable errors. Table switching clears stale scope/filter state. Numerical Insights and aggregate CSV exports use the same backend metrics; raw CSV export requires an individual table and streams bounded row batches with formula-safe values. Large bundle-table date correction uses bundle limits and batched updates, then refreshes relationship capability metadata.


## Independent numerical evidence

| Metric | Independently streamed exact CSV result |
|---|---:|
| Distinct orders | 385,650 |
| Unique customers | 372,795 |
| Items | 437,572 |
| Distinct products sold | 32,951 |
| Active sellers | 3,095 |
| Item-price total | 53,088,558.01000000 |
| Payment total | 62,426,726.99000000 |
| Average qualifying order value | 137.65994557 |
| Average review score | 4.08515296 |
| Average observed delivery days | 12.77874238 |

All ten matched the API. The delivered-status filter independently matches **371,293 orders**; reset restores **385,650**. Source date coverage is **2016-09-04 through 2021-12-31**, not an asserted eight years of real transactions. No monetary currency is inferred for the extended records; the Dashboard retains raw units until the owner explicitly confirms currency. The owner reports synthetic extension, but record-level provenance and the generation code remain unverified.

The two-order synthetic fixture has three items, two first-order payments and multiple first-order reviews: correct item revenue/payment totals are 190, AOV 95, two customers, three items, review mean 3 and delivery mean 4. Category=office gives one order / 70 item revenue, with no fan-out. A 40-day fixture exercised all six real deployed artifacts, and the first revenue forecast was checked directly against the modelÃ¢â‚¬â„¢s six-feature prediction.

Full-data API probe after native-grain correction measured 10.56 seconds in the final reconciliation probe (about 21 seconds under earlier concurrent verification); large cold scans are not instantaneous. The complete persisted-archive browser check passed with explicit large-data allowances. Import and API progress/error handling are truthful; no mocked responses or hardcoded business numbers were used.


## Original ABI source and task mapping

Read-only source checkout: `<source-checkout>`, main, **f1d2a5a7c1b70ee9092403af5873e5c624f193c9**. `git ls-remote` confirms that current source main. Source working tree remains clean. Permission to copy/adapt was already confirmed by the owner; nothing was published.

18/19 source ML Python modules are byte-identical to the target; source/target differences and serving adapters are retained rather than replacing the application. Training, builders, metadata, serving modules, routers, dependencies and relevant Git history were inspected. The Gradient Boosting binary is real, not a Git LFS pointer; no usable Gradient Boosting training notebook/script was located.

| Source task | Target path | Runtime / evidence |
|---|---|---|
| Legacy orders forecast | `/api/ml/forecast?target=orders` | Real existing LinearRegression bundle; six lag/rolling features; synthetic and exact-archive browser execution |
| Legacy revenue training implementation | `/api/ml/forecast?target=revenue` | Existing six-feature LinearRegression retained; real synthetic bundle inference and direct feature-vector equality |
| Checkout sales prediction | `/api/ml/predict/sales` | Existing full scaler/encoder/predictor pipeline; explicit checkout scenario inputs; real execution |
| Customer segmentation | `/api/ml/segments/customers` | Existing KMeans/scaler, selected-bundle RFM, no payment fan-out |
| Product segmentation | `/api/ml/product-segmentation` | Existing KMeans/scaler and original log/median preprocessing, validated item grain |
| Anomaly detection | `/api/ml/anomalies` | Existing IsolationForest over selected daily order/revenue history |
| ABI Gradient Boosting revenue | Separate inactive `ml/candidates/abi-revenue` | Present binary; not loaded or activated; not substituted for the existing revenue model |

Six existing trusted artifacts actually loaded and executed. No existing model was retrained/replaced. Metadata-only demonstration runtime paths were corrected. All six hashes match the pre-task release inventory:

| Artifact | Bytes | SHA256 |
|---|---:|---|
| anomaly_detection.joblib | 2,548,471 | `7408083bf2d54c343ba9ca40a0b67b4b15a0537d44c23122d104fd6843f529c6` |
| customer_segmentation.joblib | 386,032 | `ac18f39a2c4bd7f21650c95a13fa32d231862995932d22f36f2eb62340e17e88` |
| product_segmentation.joblib | 133,577 | `6dafbd6e69e8769128efaed7a75dfeb8b3c6b0353bae696cc3a5990d4cf1e996` |
| sales_forecast_orders.joblib | 1,080 | `95c188d7e35acb244c4fd538e2c50faea9b887956e09da73e71909b7b2f09ed0` |
| sales_forecast_revenue.joblib | 1,080 | `070c3cb93115f81638abbaa8638de22a6bd893ec21efdf9e3ed11793a8681a27` |
| sales_prediction.joblib | 7,306 | `547f7dff1f4915b515f338b7ea40482dc797d9649c427f972c34d05a7f1c089e` |

Gradient Boosting source/candidate SHA256: `e248090a7a66b2dbbdab7c431924af1036bac2b2691e80a1547df60726fa117a`; 1,237,274 bytes. Current runtime: Python 3.13.5, scikit-learn 1.5.2, NumPy 2.1.3, pandas 2.2.3, joblib 1.4.2. The candidateÃ¢â‚¬â„¢s recorded isolated runtime uses scikit-learn 1.6.1; no broad dependency upgrade or unsafe host deserialization was performed.


## Exact unresolved model gate

`ml/candidates/abi-revenue/gradient_boosting_sales_model.joblib` and original source metadata exist. **Actual Gradient Boosting training/preprocessing code, synthetic generation/real-record provenance, verified revenue target and synthetic BRL units, exact time-ordered train/test split, evaluation data and baseline are missing.** The source `ml/src/forecasting/train_forecast.py` trains LinearRegression and cannot reproduce this candidate. Source metadata claims 27 features, 365-day history and a 2017Ã¢â‚¬â€œ2024 training period; those are not reproduced training evidence. Previous isolated constructed-vector smoke evidence is not predictive-quality or full-dataset integration proof. Registry/UI therefore show present-but-inactive, precise missing evidence and no fabricated metrics or predictions. Obtain these legitimate inputs before compatibility/evaluation and separately approved activation; do not retrain or overwrite deployed models automatically.

Existing model pages distinguish artifact presence, loaded serving contract/scaler status, historical offline evaluation (including nested model/baseline metrics), active-dataset compatibility and actual task results. Monetary models require owner-confirmed BRL and commerce context; orders forecasting does not need an invented monetary unit.


## Checks and preserved state

The final evidence logs are under `<local-verification-evidence>`. Executed checks: full backend with free-only network guard (335 passed / 15 optional-reference skips in `backend-delivered.log`), upload/schema/streaming/numeric/authorization suites, 8 ML tests, 58 frontend unit tests, lint, both TypeScript checks, production build and the full relevant synthetic Playwright suite. Optional original-reference checks are explicitly skipped when their legitimate fixtures are not supplied; source Gradient Boosting end-to-end activation is blocked, not passed. Fresh-clone-only `portability.spec.ts` is outside this populated-runtime suite. See final verification records/logs for the exact pass counts.

Before/after target: `integrate/abi-ml-backend`, HEAD `9aaa1200d7e28797ce177a84a920138b4b4b87c9`, origin `https://github.com/Trunal2005/Autonomous-Business-Intellignece-Platform.git`, no upstream. Existing extensive dirty work was recorded before edits and preserved. No branch switch, reset, clean, stash, commit, stage, push or model replacement occurred. Original `.env` and `backend/sem5.db` bytes/size/mtime match baseline. Six existing weights match pre-task checksums; source checkout is unchanged. No private dataset, SQLite runtime DB, secret or new model binary was added to the Git working tree. Runtime/test storage and source spooling remain outside the repository.


## Manual verification and local URLs

Open login first, use the public development bootstrap account **admin / admin123** (never production credentials), then choose **Olist 2016Ã¢â‚¬â€œ2021 complete verification** and **Bundle overview**. The complete real supplied archive is private to admin. **analyst / analyst123** has independent synthetic fixture bundles and cannot access adminÃ¢â‚¬â„¢s archive. The current UI/API use the explicitly isolated verification DB, not the preserved original database. Keep both project-owned server processes running.

- Login: http://localhost:5173/login
- Dataset Manager: http://localhost:5173/datasets
- Dashboard (verified router): http://localhost:5173/dashboard
- ML Metrics: http://localhost:5173/ml/metrics
- Backend health: http://localhost:8000/health
- API docs: http://localhost:8000/docs

Verify ten observed KPIs, source coverage and the nine table previews. Select delivered status and confirm 371,293 orders, then reset. Inspect the order forecast with January 2018 filters. Confirm currency/domain in Dataset Manager only when supported by your source knowledge to enable monetary tasks. The original Gradient Boosting card should remain accurately blocked. Final live-link status is recorded after the final restart; HTTP SPA shell success alone is not the browser workflow proof.

## Final executed commands and outcomes

| Check | Exact command / setup | Outcome |
|---|---|---|
| Full backend | `python -m pytest -q --free-only-network --tb=short -p no:cacheprovider` | 335 passed, 15 skipped, 0 failed |
| ML | `python -m pytest -q --tb=short -p no:cacheprovider` in `ml` | 8 passed |
| Frontend | `node node_modules/vitest/vitest.mjs run` | 58 passed |
| Lint | `node node_modules/eslint/bin/eslint.js .` | Passed |
| Application TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | Passed |
| Vite/config TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json` | Passed |
| Production build | `node node_modules/vite/bin/vite.js build --outDir <owned temporary output>` | Passed |
| Full relevant browser suite | Existing Playwright tests, fresh synthetic January 2018 reference, ports 8001/5174, task-owned config | 20 passed, 2 separately gated exact-archive cases skipped; `browser-complete-clean.log` |
| Actual full archive browser | `olist-bundle.spec.ts`, exact 9-table import plus subsequent persisted-bundle acceptance | Import counts matched; final Dashboard/filter/orders-inference browser case passed |
| Integrity | `git diff --check`, baseline hashes/stat, prior release model hashes, source Git status | Passed |

The final URL checks returned HTTP 200 for all six known routes. All are **LIVE â€” VERIFIED**; SPA routes were also checked by the genuine browser flows, not just HTTP shells. Main API/UI remain on 8000/5173 with the isolated complete archive. The task-owned test APIs were stopped after verification; main UI/API remain running. No original data was deleted.

Initial target state: 31 modified + 29 untracked entries. Final target state: 38 modified + 35 untracked entries. Added entries are source/tests/report, not private CSVs, runtime DBs or new binaries.
