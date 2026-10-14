# Machine Learning

Parallel track to the website. Models are trained on the Olist dataset and served
by the FastAPI backend. Raw data lives outside the repo; processed data, model
artifacts, and reports are local (gitignored). Only metadata JSON is committed.

## Pipeline
1. `python -m src.data_processing.build_datasets`  -> builds analysis-ready datasets and `data/processed/data_quality_report.json`.
   Daily dates without source order rows inside the valid source period are recorded and interpreted as zero activity. Revenue remains the daily sum of Olist order-item `price` (not payments, freight-inclusive sales, or profit).
2. Train:
   - `python -m src.forecasting.train_forecast`                  (sales/demand forecast)
   - `python -m src.prediction.train_sales_prediction`           (order item revenue)
   - `python -m src.customer_segmentation.train_customer_segmentation`
   - `python -m src.product_segmentation.train_product_segmentation`
   - `python -m src.anomaly_detection.train_anomaly`
3. Or run everything: `python run_all.py`

All commands run from the `ml/` directory. For the included extended Olist
dataset, set `OLIST_DIR=../data/olist` before building. Raw source CSVs and
processed datasets remain local and gitignored.

When a source includes `generation_summary.txt`, the builder records its
declared synthetic-extension cutoff and provenance, and includes all valid
timestamped orders and matching item-price records in the single primary
`daily_series.csv`. The temporal cutoff labels provenance; it does not exclude
observations. Mixed original and synthetic/generated-data metrics do not
establish real-world accuracy.
The supplemental `olist_daily_business_features.csv` is preserved and
reconciled in the quality report, but it is sparse and its revenue totals do
not match the item-price target, so it is not substituted or summed into the
source-record daily series.

The forecast trainer compares Seasonal Naive (7-day), Linear Regression, Ridge,
Random Forest, Gradient Boosting, and HistGradientBoosting when the input has
enough rows. It selects by expanding-window validation MAE, with seasonal-naive
MAE/RMSE and fold-stability guardrails (first 60% train, next 20% validation,
final 20% untouched holdout), then evaluates the selected model and every
candidate once on the holdout after selection is frozen. Each task is scored one day
ahead with only prior observations available; production multi-day inference
uses recursive predictions. Near-tied eligible candidates are selected by
measured warm single-row prediction latency on this machine. It writes dated holdout predictions and a JSON
evaluation report under `reports/`, plus selected model metadata and a serving
artifact under `models/`. It refuses duplicate, missing, non-daily, nonfinite,
or negative daily series rather than repairing them silently. These artifacts
are local and gitignored. Model binaries and dated evaluation files are
versioned by training-run ID; retraining updates the small tracked metadata
pointer but retains previous local artifacts for rollback.

## Layout
- `src/common/`              paths, metadata writer
- `src/data_processing/`     dataset builders
- `src/forecasting/`         time-series forecasting
- `src/prediction/`          sales regression
- `src/customer_segmentation/`, `src/product_segmentation/`
- `src/anomaly_detection/`
- `src/evaluation/`          metric helpers
- `models/`                  artifacts (`*.joblib`) + `*.metadata.json`
- `data/processed/`          generated datasets
- `reports/`                 metric reports

## Model status
Status progresses: `planned -> data_preparation -> training -> testing ->
integration -> available`. The website reads `models/*.metadata.json` and only
shows `available` when real metrics and the local artifact both exist.
