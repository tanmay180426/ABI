"""Reproducible, chronological comparison for daily revenue and orders.

The final chronological holdout is evaluated exactly once after selection on an
earlier validation window. Predictions are one-day-ahead: lag features at each
test date use only observations available before that date.
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import (GradientBoostingRegressor, HistGradientBoostingRegressor,
                              RandomForestRegressor)
from sklearn.linear_model import LinearRegression, Ridge

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.common.paths import models_dir, processed_dir, reports_dir  # noqa: E402
from src.evaluation.metrics import regression_metrics  # noqa: E402

SEED = 42
FEATURES = ["lag1", "lag7", "lag14", "lag30", "roll7", "roll30"]
TARGETS = {"sales_forecast_orders": "orders", "sales_forecast_revenue": "revenue"}


def make_features(series: pd.Series) -> pd.DataFrame:
    values = pd.to_numeric(series, errors="coerce")
    frame = pd.DataFrame({"y": values})
    for lag in (1, 7, 14, 30):
        frame[f"lag{lag}"] = values.shift(lag)
    frame["roll7"] = values.shift(1).rolling(7).mean()
    frame["roll30"] = values.shift(1).rolling(30).mean()
    return frame


def _candidates() -> dict[str, object]:
    return {
        "LinearRegression": LinearRegression(),
        "Ridge(alpha=10)": Ridge(alpha=10.0),
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=200, min_samples_leaf=3, random_state=SEED, n_jobs=1
        ),
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=100, learning_rate=0.05, max_depth=2, random_state=SEED
        ),
        "HistGradientBoostingRegressor": HistGradientBoostingRegressor(
            max_iter=100, learning_rate=0.05, max_leaf_nodes=15, random_state=SEED
        ),
    }


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    result = regression_metrics(actual, predicted)
    actual, predicted = np.asarray(actual, float), np.asarray(predicted, float)
    mape_threshold = max(1e-12, 0.01 * float(np.median(np.abs(actual)))) if len(actual) else 1e-12
    mape_mask = np.abs(actual) > mape_threshold
    result["mape"] = round(float(np.mean(np.abs((actual[mape_mask] - predicted[mape_mask]) /
                                                   actual[mape_mask])) * 100), 4) if mape_mask.any() else None
    result["mape_excluded_count"] = int((~mape_mask).sum())
    denominator = float(np.abs(actual).sum())
    result["r2"] = round(float(1 - ((actual - predicted) ** 2).sum() /
                                  ((actual - actual.mean()) ** 2).sum()), 4) if len(actual) > 1 and np.var(actual) else None
    result["wape"] = round(float(np.abs(actual - predicted).sum() / denominator * 100), 4) if denominator else None
    result["mape_zero_policy"] = "Exclude actuals with absolute value <= max(1e-12, 1% of the evaluation-window median absolute actual); report null if none remain."
    return result


def _score(model, train: pd.DataFrame, scored: pd.DataFrame) -> np.ndarray:
    model.fit(train[FEATURES], train["y"])
    return np.asarray(model.predict(scored[FEATURES]), dtype=float)


def _registration_snapshot(metadata: dict, model_dir: Path, report_dir: Path) -> dict | None:
    """Capture the current registered run as a verifiable rollback target."""
    required = ("artifact", "algorithm", "version", "training_run_id", "evaluation")
    if not all(metadata.get(key) for key in required):
        return None
    artifact = model_dir / metadata["artifact"]
    evaluation = report_dir / metadata["evaluation"]
    if (artifact.name != metadata["artifact"] or evaluation.name != metadata["evaluation"]
            or not artifact.is_file() or not evaluation.is_file()):
        return None
    report = json.loads(evaluation.read_text(encoding="utf-8"))
    holdout_name = report.get("holdout_predictions_file", "")
    holdout = report_dir / holdout_name
    if holdout.name != holdout_name or not holdout.is_file():
        return None
    return {
        "artifact": artifact.name,
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "algorithm": metadata["algorithm"], "version": metadata["version"],
        "trained_at": metadata.get("trained_at"),
        "training_run_id": metadata["training_run_id"],
        "features_schema": metadata.get("features_schema", FEATURES),
        "data_sha256": metadata.get("data_sha256"),
        "status": metadata.get("status", "available"),
        "evaluation": evaluation.name,
        "evaluation_sha256": hashlib.sha256(evaluation.read_bytes()).hexdigest(),
        "holdout_predictions_sha256": hashlib.sha256(holdout.read_bytes()).hexdigest(),
        "metrics": metadata.get("metrics", {}),
    }


def train_target(name: str, series: pd.Series, dates: pd.Series | None = None) -> dict:
    frame = make_features(series)
    frame["date"] = pd.to_datetime(dates, errors="coerce").to_numpy() if dates is not None else pd.NaT
    frame = frame.dropna(subset=["y", *FEATURES]).reset_index(drop=True)
    if len(frame) < 90:
        raise ValueError(f"{name}: at least 90 usable daily feature rows are required; found {len(frame)}")

    n = len(frame)
    train_end, validation_end = int(n * .60), int(n * .80)
    train = frame.iloc[:train_end]
    validation = frame.iloc[train_end:validation_end]
    pretest = frame.iloc[:validation_end]
    test = frame.iloc[validation_end:]
    if min(len(validation), len(test)) == 0:
        raise ValueError("Chronological validation and holdout windows must be nonempty.")

    # Expanding-window validation. All candidates see identical one-step origins;
    # each later fold may train on earlier validation observations, as it would
    # in a real rolling-origin process. The final holdout remains untouched.
    fold_edges = np.linspace(0, len(validation), num=4, dtype=int)
    val_predictions: dict[str, np.ndarray] = {
        "SeasonalNaive7": validation["lag7"].to_numpy(dtype=float)
    }
    for model_name in _candidates():
        val_predictions[model_name] = np.empty(len(validation), dtype=float)
    validation_windows = []
    for fold_start, fold_end in zip(fold_edges[:-1], fold_edges[1:]):
        if fold_start == fold_end:
            continue
        fold_train = frame.iloc[:train_end + fold_start]
        fold_validation = validation.iloc[fold_start:fold_end]
        fold_prediction_map = {"SeasonalNaive7": fold_validation["lag7"].to_numpy(dtype=float)}
        for model_name in _candidates():
            fold_prediction_map[model_name] = _score(_candidates()[model_name], fold_train, fold_validation)
        for model_name, predictions in fold_prediction_map.items():
            val_predictions[model_name][fold_start:fold_end] = predictions
        validation_windows.append({
            "validation_period": [str(fold_validation.date.iloc[0].date()), str(fold_validation.date.iloc[-1].date())],
            "training_rows": len(fold_train),
            "metrics": {candidate: _metrics(fold_validation.y.to_numpy(), predictions)
                        for candidate, predictions in fold_prediction_map.items()},
        })
    validation_metrics = {candidate: _metrics(validation.y.to_numpy(), pred)
                          for candidate, pred in val_predictions.items()}
    fold_stability = {
        candidate: {
            "folds_beating_seasonal_naive_mae": sum(
                window["metrics"][candidate]["mae"] < window["metrics"]["SeasonalNaive7"]["mae"]
                for window in validation_windows
            ),
            "folds": len(validation_windows),
            "fold_mae_mean": round(float(np.mean([w["metrics"][candidate]["mae"] for w in validation_windows])), 4),
            "fold_mae_std": round(float(np.std([w["metrics"][candidate]["mae"] for w in validation_windows])), 4),
        }
        for candidate in validation_metrics
    }
    # Compare warm single-row predict cost on models fitted to the same
    # pre-holdout history. This is descriptive of this machine, not an SLA.
    latency_probe = pd.DataFrame([validation.iloc[-1][FEATURES].astype(float).to_dict()], columns=FEATURES)
    inference_latency = {"SeasonalNaive7": 0.0}
    for model_name, candidate in _candidates().items():
        candidate.fit(pretest[FEATURES], pretest.y)
        candidate.predict(latency_probe)
        latency_samples = []
        for _ in range(5):
            started = time.perf_counter()
            for _ in range(100):
                candidate.predict(latency_probe)
            latency_samples.append((time.perf_counter() - started) * 10.0)
        inference_latency[model_name] = round(float(np.median(latency_samples)), 4)

    baseline_mae = validation_metrics["SeasonalNaive7"]["mae"]
    baseline_rmse = validation_metrics["SeasonalNaive7"]["rmse"]
    eligible = [candidate for candidate in validation_metrics if candidate != "SeasonalNaive7"
                and validation_metrics[candidate]["mae"] < baseline_mae
                and validation_metrics[candidate]["rmse"] <= baseline_rmse * 1.02
                and fold_stability[candidate]["folds_beating_seasonal_naive_mae"] >= (len(validation_windows) + 1) // 2]
    # A more complex model is registered only if it improves pooled validation
    # MAE over the weekly seasonal baseline, keeps RMSE within 2%, and beats the
    # baseline in a majority (or tie-majority) of expanding validation windows.
    # Candidate declaration order breaks exact ties and favors simpler models.
    if eligible:
        best_mae = min(validation_metrics[candidate]["mae"] for candidate in eligible)
        near_best = [candidate for candidate in eligible
                     if validation_metrics[candidate]["mae"] <= best_mae * 1.01]
        winner = min(near_best, key=lambda candidate: (inference_latency[candidate],
                                                       list(_candidates()).index(candidate)))
    else:
        winner = "SeasonalNaive7"

    # Evaluate every candidate once on the untouched holdout after selection is
    # frozen. These results document comparative performance; they never change
    # the validation-selected production model.
    test_predictions = {"SeasonalNaive7": test["lag7"].to_numpy(dtype=float)}
    for model_name in _candidates():
        test_predictions[model_name] = _score(_candidates()[model_name], pretest, test)
    holdout_metrics = {candidate: _metrics(test.y.to_numpy(), pred)
                       for candidate, pred in test_predictions.items()}

    # Refit only the selected model on all unified observations for future serving.
    if winner == "SeasonalNaive7":
        selected_model = None
    else:
        selected_model = _candidates()[winner]
        selected_model.fit(frame[FEATURES], frame.y)
    evaluated_at = datetime.now(timezone.utc)
    run_id = evaluated_at.strftime("%Y%m%dT%H%M%SZ")
    artifact = models_dir() / f"{name}_{run_id}.joblib"
    bundle = {"model": selected_model, "features": FEATURES, "algorithm": winner,
              "target": name, "version": "0.3.0", "training_run_id": run_id,
              "training_end": str(frame.date.max().date())}
    joblib.dump(bundle, artifact)
    inference_latency_ms = inference_latency[winner]

    metrics_path = reports_dir() / f"{name}_{run_id}.evaluation.json"
    predictions_path = reports_dir() / f"{name}_{run_id}.holdout.csv"
    actual_rows = np.tile(test.y.astype(float).to_numpy(), len(test_predictions))
    predicted_rows = np.concatenate([pred for pred in test_predictions.values()])
    holdout_rows = pd.DataFrame({
        "date": np.tile(test.date.dt.strftime("%Y-%m-%d").to_numpy(), len(test_predictions)),
        "actual": actual_rows,
        "predicted": predicted_rows,
        "residual": actual_rows - predicted_rows,
        "model": np.repeat(list(test_predictions), len(test)),
    })
    holdout_rows.to_csv(predictions_path, index=False)
    predictions_sha256 = hashlib.sha256(predictions_path.read_bytes()).hexdigest()
    source = processed_dir() / "daily_series.csv"
    payload = {
        "schema_version": 1, "model": name, "selected_candidate": winner,
        "selection_rule": "Eligible candidates must improve pooled expanding-window validation MAE on SeasonalNaive7, remain within 2% of its RMSE, and beat its MAE in at least half of expanding windows; otherwise use SeasonalNaive7. Among eligible candidates within 1% of the lowest validation MAE, select the lowest warm single-row CPU prediction latency measured on the same pre-holdout history; exact latency ties follow candidate declaration order. Final holdout is never used to select or tune.",
        "validation_fold_stability": fold_stability,
        "selection_metric": "expanding-window validation MAE with seasonal-naive, RMSE, fold-stability, near-tie latency guardrails",
        "candidate_single_row_predict_latency_ms_local_cpu": inference_latency,
        "selected_model_single_row_predict_latency_ms_local_cpu": inference_latency_ms,
        "target_definition": "daily order count" if name.endswith("orders") else "daily sum of Olist order-item price (BRL, excluding freight/tax/payment totals)",
        "frequency": "daily", "forecast_strategy": "one-step-ahead expanding-window validation and holdout with observed preceding history; production horizon uses recursive predictions",
        "features": FEATURES,
        "preprocessing": {"feature_engineering": "calendar-daily lags 1/7/14/30 and prior-only rolling means 7/30",
                          "missing_values": "none; incomplete feature warm-up rows are excluded before split",
                          "scaling": "none", "target_transform": "none"},
        "forecast_horizon_days": 1,
        "production_recursive_max_horizon_days": 90,
        "candidate_configurations": {
            key: value.get_params(deep=False) for key, value in _candidates().items()
        },
        "split_fractions": {"training_before_validation": 0.60, "validation": 0.20, "holdout": 0.20},
        "random_seed": SEED,
        "training_period": [str(frame.date.iloc[0].date()), str(frame.date.iloc[train_end-1].date())],
        "validation_period": [str(validation.date.iloc[0].date()), str(validation.date.iloc[-1].date())],
        "holdout_period": [str(test.date.iloc[0].date()), str(test.date.iloc[-1].date())],
        "n_training": len(train), "n_validation": len(validation), "n_holdout": len(test),
        "production_training_period": [str(frame.date.iloc[0].date()), str(frame.date.iloc[-1].date())],
        "n_production_training": len(frame),
        "validation_metrics": validation_metrics, "validation_windows": validation_windows,
        "holdout_metrics": holdout_metrics,
        "holdout_predictions_file": predictions_path.name,
        "holdout_predictions_sha256": predictions_sha256,
        "data_source": str(source),
        "data_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "data_provenance": json.loads((processed_dir() / "data_quality_report.json").read_text(encoding="utf-8")) if (processed_dir() / "data_quality_report.json").is_file() else {"note": "Data-quality report unavailable at training time."},
        "versions": {"python": platform.python_version(), "pandas": pd.__version__,
                     "numpy": np.__version__, "scikit_learn": sklearn.__version__, "joblib": joblib.__version__},
        "evaluated_at": evaluated_at.isoformat(), "training_run_id": run_id,
        "artifact": artifact.name, "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
    }
    metrics_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    evaluation_sha256 = hashlib.sha256(metrics_path.read_bytes()).hexdigest()
    # Keep legacy metadata contract shape while exposing the newly reproducible evidence.
    metadata_path = models_dir() / f"{name}.metadata.json"
    previous = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    rollback = _registration_snapshot(previous, models_dir(), reports_dir())
    previous.update({"version": "0.3.0", "algorithm": winner, "trained_at": payload["evaluated_at"],
                     "features_schema": FEATURES, "training_run_id": run_id,
                     "artifact_sha256": payload["artifact_sha256"], "data_sha256": payload["data_sha256"],
                     "evaluation_sha256": evaluation_sha256,
                     "holdout_predictions_sha256": predictions_sha256,
                     "rollback": rollback,
                     "metrics": {"selected_candidate": winner,
                     "validation": validation_metrics, "validation_windows": validation_windows,
                     "holdout": holdout_metrics,
                     "n_train": len(train), "n_validation": len(validation), "n_test": len(test)},
                     "status": "available", "artifact": artifact.name, "evaluation": metrics_path.name,
                     "notes": payload["selection_rule"] + " All candidates were evaluated once on the untouched chronological holdout after selection was frozen. MAPE excludes zero and near-zero actuals using the recorded threshold policy; WAPE is sum absolute error / sum absolute actuals. The unified source includes extension rows labeled synthetic/generated by the dataset provenance file."})
    metadata_path.write_text(json.dumps(previous, indent=2), encoding="utf-8")
    return {"name": name, "selected": winner, "validation": validation_metrics,
            "holdout": holdout_metrics, "evaluation": str(metrics_path), "predictions": str(predictions_path)}


def main() -> None:
    source = processed_dir() / "daily_series.csv"
    if not source.is_file():
        raise FileNotFoundError(f"Missing {source}. Run `python -m src.data_processing.build_datasets` after placing the original Olist CSVs in OLIST_DIR.")
    daily = pd.read_csv(source, parse_dates=["date"])
    if not {"date", "orders", "revenue"}.issubset(daily.columns):
        raise ValueError("daily_series.csv must contain date, orders, and revenue columns.")
    if daily.date.isna().any() or daily.date.duplicated().any():
        raise ValueError("daily_series.csv has missing or duplicate dates; refusing model training.")
    daily = daily.sort_values("date").reset_index(drop=True)
    for target in TARGETS.values():
        vals = pd.to_numeric(daily[target], errors="coerce")
        if vals.isna().any() or not np.isfinite(vals).all() or (vals < 0).any():
            raise ValueError(f"daily_series.csv {target} contains missing, nonfinite, or negative values.")
    gaps = daily.date.diff().dropna().dt.days.ne(1)
    if gaps.any():
        raise ValueError("daily_series.csv must have a complete daily calendar. Rebuild from source; missing order dates are validated as zero-activity days in the Olist pipeline.")
    results = [train_target(name, daily[target].astype(float), daily.date) for name, target in TARGETS.items()]
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
