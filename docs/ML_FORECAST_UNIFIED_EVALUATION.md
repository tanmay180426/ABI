# Unified Extended Olist Forecast Evaluation

Run date: 2026-10-14. This report reflects actual execution of the current local pipeline and the saved run-specific evaluation JSON/CSV files. No branch was created and no commit or push was made.

## Root cause and changes

The previous builder treated the generation cutoff as an exclusion rule: `daily_series.csv` covered the original Olist window and the extended observations were written to a separate `daily_series_extended.csv` that the trainer ignored. This contradicted the requested unified dataset. The builder now writes one primary full-window `daily_series.csv`, documents the cutoff as provenance only, and retains every valid timestamped source order. Training and evaluation use that unified series. Chronological evaluation artifacts are registered to the selected production model; the ML charts use holdout predictions from those saved artifacts and future points from the production inference endpoint.

Model selection now uses expanding chronological validation with a seasonal-naive MAE/RMSE guardrail and fold stability. When eligible model MAEs are within 1% of the best, the lower measured warm single-row prediction latency wins; holdout is evaluated only after this rule freezes selection. Artifact, evaluation JSON, and holdout CSV digests are checked before serving evidence. A tested rollback command restores the previous local production registration after hash checks.

## Dataset inventory and provenance

The ten CSV files below were inventoried with row count, columns, sample dtypes, complete missing-value counts, date coverage, byte count, and SHA256. The builder reads orders, items, customers, and products for its derived datasets; daily forecasting aggregates `olist_orders_dataset.csv` and `olist_order_items_dataset.csv`. Payments, reviews, geolocation, sellers, translations, and the supplemental daily business feature table are inventoried; only source orders and item prices define the daily revenue/order targets.

| File | Rows | Inventory classification |
|---|---:|---|
| `olist_customers_dataset.csv` | 313,038 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_daily_business_features.csv` | 2,765 | supplemental generated daily aggregate; reconciled but not used as a second target series |
| `olist_geolocation_dataset.csv` | 1,000,163 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_order_items_dataset.csv` | 410,566 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_order_payments_dataset.csv` | 364,371 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_order_reviews_dataset.csv` | 337,907 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_orders_dataset.csv` | 359,926 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_products_dataset.csv` | 32,951 | source-style table; synthetic rows may be present after declared cutoff |
| `olist_sellers_dataset.csv` | 3,095 | source-style table; synthetic rows may be present after declared cutoff |
| `product_category_name_translation.csv` | 71 | source-style table; synthetic rows may be present after declared cutoff |

The supplemental `olist_daily_business_features.csv` has 2,765 unique dates and no extra dates outside the source series. It omits 158 calendar dates, including 18 dates with 23 actual source orders. Its order counts agree on all 2,765 overlapping dates, but its revenue differs from the source item-price target on 2,756 overlapping dates (BRL 50,762,688.18 total versus BRL 51,848,684.52). It is therefore preserved, inventoried, and reconciled as a derived feature table, but not used to replace or add to source-record targets.

The inventory total is **2,824,853 table rows across source files**, not a count of distinct business events (the files are related/overlapping relational tables and include the generated daily-features file). Primary daily-series inputs contain **2016-09-04–2024-09-04**, **0 duplicate order IDs**, **0 duplicate order/item IDs**, and **0 invalid purchase timestamps**.

`generation_summary.txt` says the source-style extension is synthetic/generated from **2018-10-18**. The unified series includes **359,926 orders**, of which **260,485** are in the declared synthetic extension. All valid order and item records are retained; no price outliers were dropped. Item-price outliers by the IQR rule: **30,788**, retained. There are no missing item prices, negative prices, or non-finite item prices.

The primary daily series is **2,923 dates**, **2016-09-04 through 2024-09-04**, with no duplicate or missing target values. The **140** calendar dates without an order row inside the observed window are filled with zero orders and zero item revenue. Totals: **359,926 orders** and **BRL 51,848,684.52**. Orders count unique order IDs per purchase date. Revenue sums item `price` per order and purchase date, excluding freight, payments/tax, and profit.

**Provenance limitation:** the declared synthetic extension makes up most of the data, and the untouched holdout period is wholly after the synthetic cutoff. These scores evaluate a mixed series with a synthetic-only holdout; they do not establish accuracy on genuine Olist observations or on another business. The prompt required this unified evaluation; no real-only score is substituted or implied.

## Leakage-safe evaluation protocol

- Daily history uses the contiguous calendar sequence; feature rows start after the 30-day warm-up.
- Features: `lag1, lag7, lag14, lag30, roll7, roll30`. Rolling means are shifted one day and use past values only. No scaling, imputation, target transform, or future calendar feature is applied.
- One-step-ahead rolling-origin validation/holdout: each date's lag values use only observations that would already be known at that origin. Production forecasts are recursive and append each predicted value for subsequent days, up to 90 days.
- Same split dates and one-day horizon for each candidate and both targets. First 60% train, next 20% validation, final 20% holdout. Validation comprises three expanding windows; selection is frozen before the final holdout evaluation.
- Training: 2016-10-04–2021-07-04 (1,735 rows). Validation: 2021-07-05–2023-02-03 (579 rows). Holdout: 2023-02-04–2024-09-04 (579 rows). Production model refit uses all 2,893 feature rows through 2024-09-04.
- MAPE excludes actual values whose absolute value is at most `max(1e-12, 1% of evaluation-window median absolute actual)`; each period’s report contains the excluded count. No holdout values met the cutoff. WAPE is total absolute error divided by total absolute actual.

Candidates: SeasonalNaive7, LinearRegression, Ridge(alpha=10), RandomForestRegressor, GradientBoostingRegressor, and HistGradientBoostingRegressor. XGBoost was not installed or declared in the environment, so no dependency was added for an optional candidate.

### Orders comparison

| Candidate | Val MAE | Val RMSE | Val R² | Val MAPE % | Val WAPE % | Holdout MAE | Holdout RMSE | Holdout R² | Holdout MAPE % | Holdout WAPE % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| SeasonalNaive7 | 20.2625 | 28.4900 | 0.4951 | 19.8189 | 17.1473 | 21.1848 | 28.3456 | 0.5238 | 16.4890 | 14.6486 |
| LinearRegression | 17.4031 | 22.3483 | 0.6893 | 16.6825 | 14.7275 | 18.7282 | 24.0393 | 0.6575 | 14.2571 | 12.9499 |
| Ridge(alpha=10) | 17.4031 | 22.3483 | 0.6893 | 16.6825 | 14.7275 | 18.7282 | 24.0393 | 0.6575 | 14.2571 | 12.9499 |
| RandomForestRegressor | 15.5986 | 20.2251 | 0.7455 | 14.5312 | 13.2004 | 18.0749 | 23.7226 | 0.6664 | 13.6291 | 12.4982 |
| GradientBoostingRegressor | 17.2635 | 22.2241 | 0.6928 | 16.4488 | 14.6093 | 19.0118 | 24.7108 | 0.6381 | 14.2548 | 13.1460 |
| HistGradientBoostingRegressor | 16.3920 | 21.2194 | 0.7199 | 15.3679 | 13.8718 | 18.1917 | 23.9223 | 0.6608 | 13.8112 | 12.5790 |

### Revenue comparison (BRL item-price revenue)

| Candidate | Val MAE | Val RMSE | Val R² | Val MAPE % | Val WAPE % | Holdout MAE | Holdout RMSE | Holdout R² | Holdout MAPE % | Holdout WAPE % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| SeasonalNaive7 | 4548.9356 | 6181.0788 | 0.1684 | 29.6574 | 25.9068 | 4751.9026 | 6228.8130 | 0.2562 | 24.2364 | 21.3763 |
| LinearRegression | 3711.0152 | 4838.8739 | 0.4903 | 24.0110 | 21.1348 | 4062.5015 | 5229.9050 | 0.4756 | 20.4674 | 18.2750 |
| Ridge(alpha=10) | 3711.0152 | 4838.8739 | 0.4903 | 24.0110 | 21.1348 | 4062.5015 | 5229.9050 | 0.4756 | 20.4674 | 18.2750 |
| RandomForestRegressor | 3686.4722 | 4830.8001 | 0.4920 | 23.6794 | 20.9950 | 3976.2165 | 5177.5053 | 0.4861 | 20.0174 | 17.8869 |
| GradientBoostingRegressor | 3731.5711 | 4864.6501 | 0.4849 | 24.2504 | 21.2518 | 4193.6242 | 5572.5109 | 0.4047 | 21.0658 | 18.8649 |
| HistGradientBoostingRegressor | 3677.6659 | 4803.9727 | 0.4976 | 23.5937 | 20.9448 | 3936.4473 | 5188.1573 | 0.4840 | 19.5705 | 17.7080 |

The full one-day holdout prediction CSV contains actual, prediction, residual (actual minus predicted, saved explicitly), date, and candidate for every model/date. The UI residual chart uses the selected candidate's aligned saved holdout rows.

## Selection and registered production models

Selection rule: candidate must beat SeasonalNaive7 pooled expanding-validation MAE, have RMSE no more than 2% worse than baseline, and beat baseline MAE on at least half of the three folds. From eligible candidates within 1% of best eligible MAE, choose the lowest median warm single-row CPU prediction latency (five batches × 100 calls, measured on the same pre-holdout history). Exact ties follow declaration order. This latency is local descriptive evidence, not an SLA. The holdout metrics above are disclosed after selection and do not feed that decision.

| Target | Selected model | Validation MAE / RMSE | Holdout MAE / RMSE | Baseline holdout MAE / RMSE | Reason |
|---|---|---:|---:|---:|---|
| Orders | RandomForestRegressor | 15.5986 / 20.2251 | 18.0749 / 23.7226 | 21.1848 / 28.3456 | Lowest eligible validation MAE; beats baseline in 3/3 windows. |
| Revenue | Ridge(alpha=10) | 3711.0152 / 4838.8739 | 4062.5015 / 5229.9050 | 4751.9026 / 6228.8130 | Within 1% of best eligible validation MAE; fastest measured inference among that near-tie set; beats baseline in 3/3 windows. |

For revenue, HistGradientBoosting had the lowest validation MAE (BRL 3,677.6659); Ridge is within 1% (BRL 3,711.0152) and had the lowest median warm single-row prediction latency in the near-tie group (0.3857 ms on this machine). Its holdout error is higher than HistGradientBoosting's, but using that untouched holdout to switch models would leak test information. Future re-selection must use a new later evaluation window.

## Artifacts and application integration

Latest registered run IDs: orders `20261014T180046Z`, revenue `20261014T180059Z` (UTC). Run-versioned model bundles in `ml/models/` contain the estimator and ordered feature list. Their binary hashes are in the tracked metadata. Each evaluation JSON contains candidate configurations, package versions, source-data hash and provenance inventory, dates/split sizes, fold metrics, holdout metrics, and candidate prediction CSV name/hash. The metadata registry also records evaluation and prediction hashes.

| Target | Model artifact | Evaluation JSON | Holdout predictions CSV | Previous production rollback artifact |
|---|---|---|---|---|
| Orders | `ml/models/sales_forecast_orders_20261014T180046Z.joblib` | `ml/reports/sales_forecast_orders_20261014T180046Z.evaluation.json` | `ml/reports/sales_forecast_orders_20261014T180046Z.holdout.csv` | `ml/models/sales_forecast_orders_20261014T171846Z.joblib` |
| Revenue | `ml/models/sales_forecast_revenue_20261014T180059Z.joblib` | `ml/reports/sales_forecast_revenue_20261014T180059Z.evaluation.json` | `ml/reports/sales_forecast_revenue_20261014T180059Z.holdout.csv` | `ml/models/sales_forecast_revenue_20261014T171848Z.joblib` |

- `GET /api/ml/forecast?periods=30&target=orders|revenue`: actual recent history and genuine recursive predictions from the registered, SHA-verified production artifact. The API returns model/version.
- `GET /api/ml/forecast/evaluation?target=orders|revenue`: selected-model actuals and one-day holdout predictions from the hash-verified evaluation CSV, with residuals, metrics, baseline, and candidate comparisons.
- Charts display on `/ml/metrics`, `/ml/revenue-forecast`, and `/ml/order-forecast`. Historical lines use the saved holdout records, not training-fit predictions. Future charts use the production inference API and show the history/forecast boundary. Units and target switch together. No confidence intervals are shown.
- Numerical estimates and comparative insights are labeled as forecasts/reference evaluation; they are not guarantees or causal explanations. BusinessEvidence uses current selected-dataset observations; it does not relabel Olist reference backtest metrics as selected-upload accuracy.

## Verification performed

- Dataset builder: succeeded; generated unified 2,923-day series and quality report.
- Model training: succeeded on both targets; six candidates each; versioned output and hashes written.
- ML tests: 13 passed; includes pipeline/feature/evaluation and rollback tests.
- Backend focused service/artifact tests: 23 passed, 1 authentication test deselected in that pytest run. The standalone authentication `TestClient` case stalled in this Windows sandbox; the browser E2E authenticated with analyst login successfully.
- Frontend: 96 tests passed, lint passed, TypeScript/Vite production build passed.
- Playwright Chromium: 1 E2E passed against the local API and Vite app with disposable test storage. It signed in, uploaded a labeled synthetic test fixture for forecast-history inference, read the real unified-Olist holdout API for both targets, checked both line graphs and residual/candidate views, confirmed model identity for future output, verified finite values and daily date continuity, and found no browser page errors, console errors, or failed requests. The fixture is only for execution/integration; it is not used for reported accuracy.
- A focused `TestClient` read-contract invocation stalled under this environment; the equivalent protected API calls, including both targets, returned HTTP 200 in Playwright. This is not counted as a pytest pass.
- `git diff --check` passed in the final repository review. No raw-data zip/source files, model binaries, virtual environments, node_modules, or temporary databases should be staged or committed.

## Reproduction, launch, and rollback

PowerShell, from repository root:

```powershell
$env:OLIST_DIR = (Resolve-Path 'data/olist').Path
Push-Location ml
& ..\backend\.venv\Scripts\python.exe -m src.data_processing.build_datasets
& ..\backend\.venv\Scripts\python.exe -m src.forecasting.train_forecast
Pop-Location
```

Run the normal local app in separate terminals:

```powershell
# backend
Push-Location backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# frontend
Push-Location frontend
npm run dev
```

To restore the previous pre-upgrade production model for one target (updates only its metadata registration after verifying the saved model, evaluation, and prediction hashes):

```powershell
Push-Location ml
& ..\backend\.venv\Scripts\python.exe -m src.forecasting.rollback_forecast --target orders
& ..\backend\.venv\Scripts\python.exe -m src.forecasting.rollback_forecast --target revenue
Pop-Location
```

The rollback helper is reversible: it saves the current registration as the next rollback target. Models and run reports remain local and versioned; no commit or push is made.
