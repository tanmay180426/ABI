# ML forecasts and selected-data business evidence

> **Historical audit note:** this report documents an earlier local audit and
> some statements below (including the original-only forecast scope and lack of
> a saved backtest) have since been superseded. The current unified eight-year
> dataset, model comparisons, registered runs, actual browser verification, and
> rollback steps are in [ML_FORECAST_UNIFIED_EVALUATION.md](ML_FORECAST_UNIFIED_EVALUATION.md).

## A. Root cause of the previous ML Metrics experience

`frontend/src/pages/ml/MlMetrics.tsx` requested only `getMlStatus()`. That endpoint supplies model descriptions, offline scores and dataset compatibility, not prediction points. The separate `RevenueForecast.tsx` already called `/api/ml/forecast` and the backend already returned a real `history_tail` and `forecast`. No new forecasting algorithm or model-serving adapter was needed.

The new shared `ForecastExperience` puts actual inference, summaries and a reusable chart above the existing catalog on `/ml/metrics`, and serves the existing revenue/order routes. Catalog failures or slow compatibility checks no longer prevent a forecast from rendering. The old forecast renderer also assumed BRL, accepted missing values as zero and lacked an explicit historical/future boundary; those presentation issues are corrected.

## B. Forecast charts and local model audit

All investigation used local files. The six trusted serving artifacts, saved preprocessing objects and metadata are unchanged. The inactive Gradient Boosting candidate is neither loaded nor activated.

| Task / endpoint | Actual output, feature contract and preprocessing | Series / horizon / units | Filters and limitations |
|---|---|---|---|
| Orders: `/api/ml/forecast?target=orders` | Saved Linear Regression. Ordered `lag1, lag7, lag14, lag30, roll7, roll30`; unchanged recursive inference. | Last 30 actual daily points plus 1–90 future daily points. UI offers 7/14/30/90 days. Fractional order estimates remain model estimates. | Shared dataset/date/dimension filters apply before aggregation. At least 30 consecutive daily observations; invalid/gapped/duplicate/nonfinite history is rejected. Commerce compatibility applies; currency is unnecessary. |
| Revenue: `/api/ml/forecast?target=revenue` | Separate saved Linear Regression with the same ordered lag/rolling features. | Same daily dates and horizons; BRL required by this existing model contract. Olist item revenue is qualifying item price, excluding freight and separate from payments. | Same applicable filters. Unconfirmed currency or incompatible semantics block inference. No currency is assigned to arbitrary uploads. |
| Checkout sales: `/api/ml/predict/sales` | Saved Linear Regression pipeline: StandardScaler for month/weekday/hour/item count; OneHotEncoder for state/category. | One checkout item-revenue estimate in BRL; no historical/future series or horizon. | Explicit form inputs determine the estimate. Shared filters check selected-data compatibility; they do not turn the form prediction into a filtered time forecast. |
| Customers: `/api/ml/segments/customers` | Saved scaler and K-Means on recency, distinct-order frequency and log1p monetary value. | Observed cluster counts and monetary totals; no future customer-count forecast. | Selected-data filters precede aggregation. Stable identity, monetary semantics and BRL contract required. |
| Products: `/api/ml/product-segmentation` | Saved scaler and K-Means on log quantity, log revenue, mean price and weight in grams. | Product clusters, not future demand volumes. | Existing required semantic mappings and BRL contract remain enforced. |
| Anomalies: `/api/ml/anomalies` | Saved Isolation Forest on daily orders/revenue. | Observed anomaly dates and decision scores, at most 100 returned flagged days. No future forecast or probability. | Shared filters apply before daily aggregation; existing minimum-history/BRL requirements remain. |

Neither forecast endpoint returns aligned held-out predictions or validated intervals. The UI therefore draws neither a backtest line nor a confidence band. It preserves the existing offline metrics without presenting them as selected-dataset accuracy.

Local metadata reports order forecast MAE 35.2808 / RMSE 44.0684 / MAPE 302.9289, versus seasonal-naive MAE 56.0744 / RMSE 74.7963 / MAPE 294.3114. Revenue reports MAE 5390.8137 / RMSE 6860.6506 / MAPE 77.3045, versus seasonal-naive MAE 7793.5347 / RMSE 10652.2927 / MAPE 125.1388. Both report 483 training and 121 test observations. The local training source uses chronological 80/20 after feature construction. No training, historical evaluation reconstruction or new accuracy claim was performed.

Other existing metadata: checkout selected Linear Regression MAE 96.048 / RMSE 215.9341 / MAPE 139.455; its local script uses random 80/20, seed 42. Customer silhouette 0.6858 (k=2); product silhouette 0.4798 (k=4). Isolation Forest metadata records contamination 0.03 and 19 flagged days among 634 historical training-source days; this is not a supervised accuracy score.

Chart behavior:

- Numeric UTC date axis; actual and future values remain separate nullable series.
- Solid historical line, dashed future line, boundary between the last actual and first future date, meaningful legend and dated tooltips.
- Duplicate/invalid dates, missing/nonfinite values, historical gaps and invalid future alignment fail closed. No zero imputation or index-based alignment.
- Latest actual/date, first prediction/date, horizon-end prediction/date, horizon total and daily average.
- Forecast change appears only against an equally long adjacent actual window available within the 30-point history, with a positive denominator. It is explicitly a model-estimated comparison, not realized growth or recommended-action lift. No 90-day baseline is invented.
- Dataset/version/filter/target/horizon changes immediately hide previous results. Existing API session/dataset generation guards and keyed layout remain intact.
- Negative unconstrained model estimates are shown unchanged with an explanation; the existing algorithm is not clamped or replaced.

Real browser evidence: the main selected Olist bundle produced 30 historical points and 30 future order predictions for January 2018 history; the first predicted date was 2018-02-01 with 236.95 orders. A separately named synthetic fixture with explicitly confirmed BRL exercised both genuine saved forecast artifacts, 30→7 day controls, date-filter changes, actual/future tooltip dates and values, and dataset switching. Synthetic fixture inference proves execution and data flow, not predictive accuracy.

## C. Revenue, customer and seller insights

A small opt-in `/api/analytics/business?domain=revenue|customers|sellers` response supplies structured deterministic evidence. Existing analytics responses lacked customer chronology and deduplicated seller-order delivery aggregates, so reusing only their displayed values would have produced invalid conclusions. The new endpoint reuses the authorized adapters/filter machinery and performs bounded SQL aggregation; existing response fields remain compatible. `domain` is allowed only on this route and validated against three values.

Revenue uses the latest 28 consecutive observed daily aggregates for equal 14-day comparisons. A decline of at least 10% creates an investigation recommendation; at least 20% gives high evidence priority. Category concentration requires at least 30% of total selected item revenue, using a full-scope denominator rather than the top-N sum. Evidence includes values, dates/scope, metric source, action and limitations. There are no lift, ROI or guaranteed revenue claims.

Customer evidence uses `customer_unique_id`, not transaction-specific `customer_id`. Repeat customers have at least two distinct matching orders; repeat rate is repeat / observed customers. Monthly first-time/returning revenue uses each person's earliest observed purchase in the complete dataset before applying the displayed selection. It is not lifetime acquisition. Simultaneous earliest transactions are classified as first-time. A single-purchase share of at least 70%, among at least 20 observed customers, creates a possible re-engagement signal. Window censoring and unknown reasons for non-return are stated. Purchase frequency and first-time/returning revenue are charted without returning raw customer identifiers.

Seller evidence counts each valid order once per participating seller, regardless of item/payment/review multiplicity. Eligible orders must be delivered, have usable purchase/delivery/estimate dates, and nonnegative purchase-to-delivery and purchase-to-estimate durations. Late means actual delivery after estimated delivery. The baseline counts each eligible order once. Rankings require at least 20 distinct eligible orders per seller; an excess late rate of at least 10 percentage points over baseline creates a review suggestion for the highest group. The UI shows seller keys, eligible/late counts, rates, mean delay among late orders and the comparison baseline. Association does not assign responsibility or establish a logistics/inventory cause.

Core recommendations require neither Ollama nor paid APIs. No actionable signal yields an explicit no-action state, not filler recommendations.

Main Olist January 2018 observations verified in the browser included 7,166 observed customers, 101 repeat customers (1.41%), and 7,069 eligible completed orders with 6.56% late delivery. These are filtered historical observations, not customer/seller predictions. Revenue inference remains blocked for this uploaded bundle because its monetary currency is unconfirmed; observed raw-unit analysis remains available.

## D. Dashboard and Analytics chart coverage

| Existing section | Working presentation and calculation source |
|---|---|
| Dashboard | Existing selected-data revenue/order/AOV/item/customer KPIs preserved; revenue trend, category horizontal bar, bundle status distribution now a donut, compact coverage context, new revenue evidence/actions. Missing profit or margin is not replaced with zero. |
| Products, validated bundles | Top-10 item-revenue horizontal bars, top-10 item-count horizontal bars, mean price versus observed item count scatter for the top 50 products by count. Native item-grain SQL, verified item/order relationships, no payments/reviews join. |
| Customers | Repeat metrics, monthly first-time/returning revenue stacked bars and purchase-frequency histogram from the evidence endpoint. Existing reference customer summaries/tables remain accessible. |
| Sales / seasonality | Observed year×month heatmap using the existing sales endpoint's monthly aggregates. Missing months show —, genuine observed zero remains zero. Daily/weekly/yearly selections require monthly grain before a monthly heatmap is shown. No holiday effect is asserted. |
| Delivery, validated bundles | Monthly average completed-delivery days and cancellation-rate trends. Cancellation rate is canceled / all matching orders × 100, not a count. Valid delivered timestamps are required for duration. |
| Sellers / Delivery | Eligible/on-time/late KPIs, seller ranking with minimum sample count and qualified recommendations. Existing reference seller revenue views remain. |
| ML Metrics and forecast routes | Actual/future order and revenue charts from the existing saved models; catalog/offline metrics below. |
| Customer Segments | Bar chart of genuine saved-model cluster counts; existing monetary table retained. |
| Anomalies | Timeline scatter of returned flagged dates and decision scores. Normal/omitted dates are not fabricated. Existing detailed table retained. |

Skipped because the current data/model/calculation contract does not support a truthful result: profit/margin/product profitability and discount-margin plots (no confirmed cost/discount semantics); stockout frequency (no inventory events); holiday/non-holiday comparisons (no verified holiday indicator/calendar); customer-volume, seller-delay and review-score forecasts (no approved trained task); segment-category preferences, co-purchase ranking and delivery-review box/group comparisons (no validated existing bounded response for those joins/aggregates). No extra navigation or duplicate route was created to fill these gaps.

## E. Verification and regressions

Before edits in this task: relevant backend baseline **20 passed / 7 optional skipped**, frontend **61 passed**. This was a relevant subset baseline, not a claimed fresh full-suite baseline.

After implementation:

- Full backend: **343 passed / 15 optional skipped**, with `--free-only-network` and disposable storage.
- Existing ML tests: **8 passed**, without invoking training.
- Frontend: **79 passed / 16 files**. Browser suite: **24 passed / 2 existing gated skips**, plus **1 populated-Olist case passed separately**. Lint, TypeScript project build and Vite production build passed.
- Complete persisted Olist acceptance on the main app: **1 passed**. It reconciled 385,650 orders, item revenue 53,088,558.01, 372,795 unique customers, delivered-status filtering/reset, genuine order inference and preserved inactive-candidate status.
- Main browser inspection: real predictions and customer/seller/product/delivery pages; no page errors, no mobile body overflow. Screenshots are retained outside the repository.

Commands actually used (PowerShell, from the indicated working directory):

```powershell
# backend directory
& '<USER_HOME>\AppData\Local\Temp\sem5-sanitized-current-tree-3fd744806b5748d28957938285baf96d\.venv\Scripts\python.exe' -m pytest tests/test_ml.py tests/test_analytics.py tests/test_olist_bundle.py -q
& '<USER_HOME>\AppData\Local\Temp\sem5-sanitized-current-tree-3fd744806b5748d28957938285baf96d\.venv\Scripts\python.exe' -m pytest -q --tb=short --free-only-network
# repository root
& '<USER_HOME>\AppData\Local\Temp\sem5-sanitized-current-tree-3fd744806b5748d28957938285baf96d\.venv\Scripts\python.exe' -m pytest ml/tests -q --tb=short
# frontend directory
npm test
npm run lint
npm run build
```

Browser command: `npx playwright test --workers=1 --config <evidence-directory>\playwright.config.cjs --output <evidence-directory>\browser-final-verified-output`, with `SEM5_E2E_BACKEND_PORT=8001`, existing installed Playwright, real Vite 5174 and a separate API 8001 launched through `backend/tests/e2e_server.py`. That launcher copied only an explicitly identified synthetic reference fixture to disposable storage. The main populated database and original developer database were not used for mutating suites.

The persisted-only command used `olist-bundle.spec.ts --grep 'Complete persisted'`, a separate config targeting 5173, `SEM5_VERIFIED_OLIST_ID` naming the existing bundle, and API port 8000. It did not reimport or delete that bundle.

Early failures were retained: the new query parameter needed the narrowly scoped dataset guard update; SQLite's reserved `returning` label needed quoting; the Dashboard mock needed the new API method; an old browser label was restored. A first external browser config ran with eight workers and was stopped; a later run had a transient `ERR_NETWORK_IO_SUSPENDED` plus the new API-created fixture missing from the UI's cached list. The fixture test now reloads the real registry after upload. No assertion was weakened and no failure was turned into a skip. Fresh serial runs passed. Two existing archive cases remain explicitly gated, with the populated-bundle case also executed separately as above.

## F. Files and preservation

Current branch remains `integrate/abi-ml-backend`; HEAD remains `129aca183e9fe17ffe26e8a5bbf51553ca607ea1`. Nothing was staged, committed or pushed. No remote repository was accessed, cloned, fetched or copied. No dependency or lockfile changed. Prior UI work was backed up before edits and retained.

The restorable source snapshot, initial staged/unstaged patches, untracked-file inventory, source hashes, protected-file hashes, logs and screenshots are outside the repository in the task's `abi-forecast-20261014` evidence directory. The protected original `.env`, original developer database, six serving weights and inactive candidate were preserved. No training, model replacement, promotion, activation, upload-limit change or original-database initialization occurred.

Task-specific changed files and their reasons are listed in the final verification appendix below. Other pre-existing modified files are deliberately left untouched.

## G. Local verification

Open the existing login, then ML Metrics with a verified historical window:

- **LIVE — VERIFIED:** [Login](http://localhost:5173/login).
- **LIVE — VERIFIED:** [ML Metrics with January 2018 order history](http://localhost:5173/ml/metrics?date_from=2018-01-01&date_to=2018-01-31). Main-app predictions were checked in a real browser, not inferred from the SPA shell.
- **LIVE — VERIFIED:** [Dashboard](http://localhost:5173/dashboard).
- **LIVE — VERIFIED:** [Dataset Manager](http://localhost:5173/datasets).
- **LIVE — VERIFIED:** [Customers](http://localhost:5173/analytics/customers), [Sellers](http://localhost:5173/analytics/sellers), [Products](http://localhost:5173/analytics/products), [Delivery](http://localhost:5173/analytics/delivery), [Sales](http://localhost:5173/analytics/sales).
- **LIVE — VERIFIED:** [Backend health](http://localhost:8000/health), [API documentation](http://localhost:8000/docs).
- **BLOCKED for the current unconfirmed-currency bundle:** revenue model inference. The page is live; the trained model's BRL input requirement remains enforced. Genuine revenue inference was verified against a compatible explicitly labelled synthetic fixture on disposable test services.

Main Vite is reused on 5173. Before API restart, project ownership, working directory and actual nonsecret process settings were verified: the API served the existing isolated Olist verification database and trusted local `ml/models`, with authentication enabled and local language generation disabled. It was restarted with those same paths. The original developer database was not substituted.

## H. Remaining limitations

There is no genuine customer-count, seller-delay or review-score model, no aligned saved forecast backtest series and no validated prediction intervals. The Gradient Boosting candidate's actual training/preprocessing/provenance evidence remains missing; it is not a fallback. Extended uploaded history is not described as entirely real Olist transactions. Monetary provenance must be confirmed by its owner before BRL-dependent models can serve it.

The existing forecast returns only a 30-day history tail. The 90-day future control therefore has no fabricated 90-day historical comparison. Offline metrics can be poor and do not certify selected-data forecasting accuracy; small synthetic execution fixtures can produce large model extrapolations. Large-bundle ML catalog compatibility checks can still take more than ten seconds; the forecast UI now runs independently of that catalog. New business queries return bounded aggregates, but full selected-history scans still depend on database size and filters. Non-Olist tables without validated stable customer/order/delivery semantics receive an explicit unsupported analysis state.

## Final verification appendix

SHA-256, byte size and modification time match the pre-edit baseline for all **9 protected files** (.env, original database, six serving weights and inactive candidate). Branch/HEAD are unchanged; staged file list is empty; `git diff --check` passed. **228 other baseline source files are byte-identical.**

Task file changes below are measured against the pre-task working-tree snapshot, so earlier UI changes are not misattributed to this task.

| File | Reason |
|---|---|
| `backend/app/analytics/bundle.py` | Bounded product rankings/price-demand and delivery/cancellation chart aggregates at validated native grain. |
| `backend/app/api/routes/analytics.py` | Opt-in structured business-evidence endpoint with validated domain. |
| `backend/app/api/routes/datasets.py` | Allow the domain parameter only on that evidence route; preserve all existing scope/ownership checks. |
| `frontend/src/components/DatasetResults.tsx` | Reuse specialist chart slot and render bundle order-status donut. |
| `frontend/src/pages/analytics/Customers.tsx` | Customer history/evidence panel and explicit dataset-version request dependencies. |
| `frontend/src/pages/analytics/Delivery.tsx` | Delivery evidence panel and dataset-version dependencies. |
| `frontend/src/pages/analytics/Sales.tsx` | Monthly observed seasonality heatmap using existing response aggregates. |
| `frontend/src/pages/analytics/Sellers.tsx` | Sample-qualified seller delivery evidence and dataset-version dependencies. |
| `frontend/src/pages/Dashboard.tsx` | Selected-data revenue evidence/actions below existing overview. |
| `frontend/src/pages/ml/MlAnalysis.tsx` | Genuine segment-count chart, anomaly timeline and explicit checkout-filter scope explanation. |
| `frontend/src/pages/ml/MlMetrics.tsx` | Shared real forecast above preserved model catalog; independent loading/error states. |
| `frontend/src/pages/ml/RevenueForecast.tsx` | Shared forecast experience, strict mapping, context guards, summaries and coverage explanations. |
| `frontend/src/services/api.ts` | Typed additive business-evidence client using the existing authenticated, scoped transport. |
| `frontend/tests/Dashboard.test.tsx` | Extend the API mock for the new evidence request without changing existing assertions. |
| `backend/app/analytics/business.py` | Deterministic revenue/customer/seller evidence, SQL scopes, structured recommendations and caveats. |
| `backend/tests/test_business_evidence.py` | Hand-calculated no-fanout/customer chronology/denominator/privacy fixtures and real-model horizon/filter checks. |
| `docs/ML_FORECAST_IMPLEMENTATION_REPORT.md` | Required implementation, audit, verification and limitation report. |
| `frontend/e2e/forecast-evidence.spec.ts` | Real-model forecasts/tooltips/horizons/filters, recommendation signals, product/seasonality/segmentation/anomaly charts and switching. |
| `frontend/src/components/BusinessEvidence.tsx` | Reusable evidence/cards/actions and scoped stale-response handling. |
| `frontend/src/components/ForecastChart.tsx` | Reusable actual/future chart with dated boundary and honest tooltips. |
| `frontend/src/components/SeasonalityHeatmap.tsx` | Monthly observed-value grid; distinguish absent month from observed zero. |
| `frontend/src/components/SpecialistCharts.tsx` | Reusable native-grain product and delivery chart renderer. |
| `frontend/src/services/forecast.ts` | Pure date/value/duplicate/gap/boundary validation and formatting. |
| `frontend/tests/BusinessEvidence.test.tsx` | Evidence, measurement window, caveat and no-action states. |
| `frontend/tests/ForecastExperience.test.tsx` | Horizon/filter requests, pending states, incompatible/error outputs and stale responses. |
| `frontend/tests/SeasonalityHeatmap.test.tsx` | Missing-versus-zero monthly values, unknown currency and unsupported grain/duplicate protection. |
| `frontend/tests/forecast.test.ts` | Chart transformation/date alignment/nonfinite/duplicate/gap/unit formatting checks. |

Evidence logs: `baseline-backend.log`, `baseline-frontend.log`, `backend-delivered.log`, `ml-final.log`, `frontend-delivered.log`, `lint-delivered.log`, `build-delivered.log`, `browser-final-verified.log`, `persisted.log`, `main-browser.json`, and `final-integrity.json`. The task-owned external evidence directory is:

`<USER_HOME>\.codex\visualizations\2026\10\06\01a112b9-095e-73d3-bf09-6d706112385f\abi-forecast-20261014`

Final screenshots are under `browser-final-verified-output/forecast-evidence-real-mod-d571b--and-scoped-horizon-changes-chromium/` (revenue/orders/customer/seller/delivery/product/seasonality/mobile), and the `main-*.png` files show the real selected Olist app. They are not production fixture data or model artifacts.
