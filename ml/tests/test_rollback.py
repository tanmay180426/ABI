import hashlib
import json
from pathlib import Path

import pytest

from src.forecasting import rollback_forecast


def _write(path: Path, text: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _setup(tmp_path, monkeypatch):
    models, reports = tmp_path / "models", tmp_path / "reports"
    models.mkdir()
    reports.mkdir()
    previous_artifact = models / "orders-old.joblib"
    old_artifact_hash = _write(previous_artifact, "verified previous model bytes")
    old_csv = reports / "orders-old.holdout.csv"
    old_csv_hash = _write(old_csv, "date,actual,predicted,model\n2020-01-01,2,1,Ridge\n")
    old_report = reports / "orders-old.evaluation.json"
    old_report_hash = _write(old_report, json.dumps({
        "selected_candidate": "Ridge", "holdout_predictions_file": old_csv.name,
    }))
    current_artifact = models / "orders-current.joblib"
    current_artifact_hash = _write(current_artifact, "current model bytes")
    current_csv = reports / "orders-current.holdout.csv"
    current_csv_hash = _write(current_csv, "date,actual,predicted,model\n2021-01-01,3,2,RandomForest\n")
    current_report = reports / "orders-current.evaluation.json"
    current_report_hash = _write(current_report, json.dumps({
        "selected_candidate": "RandomForest", "holdout_predictions_file": current_csv.name,
    }))
    metadata = models / "sales_forecast_orders.metadata.json"
    metadata.write_text(json.dumps({
        "name": "sales_forecast_orders", "algorithm": "RandomForest", "version": "0.3.0",
        "artifact": current_artifact.name, "artifact_sha256": current_artifact_hash,
        "training_run_id": "current", "evaluation": current_report.name,
        "evaluation_sha256": current_report_hash, "holdout_predictions_sha256": current_csv_hash,
        "rollback": {"artifact": previous_artifact.name, "artifact_sha256": old_artifact_hash,
            "algorithm": "Ridge", "version": "0.2.0", "training_run_id": "old",
            "evaluation": old_report.name, "evaluation_sha256": old_report_hash,
            "holdout_predictions_sha256": old_csv_hash, "features_schema": ["lag1"],
            "metrics": {"mae": 1}, "status": "available", "data_sha256": "source"},
    }), encoding="utf-8")
    monkeypatch.setattr(rollback_forecast, "models_dir", lambda: models)
    monkeypatch.setattr(rollback_forecast, "reports_dir", lambda: reports)
    return metadata


def test_rollback_restores_previous_registration_after_hash_checks(tmp_path, monkeypatch):
    path = _setup(tmp_path, monkeypatch)
    rollback_forecast.rollback("orders")
    restored = json.loads(path.read_text())
    assert restored["algorithm"] == "Ridge"
    assert restored["version"] == "0.2.0"
    assert restored["training_run_id"] == "old"
    assert restored["rollback"]["algorithm"] == "RandomForest"


def test_rollback_refuses_tampered_previous_artifact(tmp_path, monkeypatch):
    path = _setup(tmp_path, monkeypatch)
    metadata = json.loads(path.read_text())
    metadata["rollback"]["artifact_sha256"] = "bad-digest"
    path.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError, match="artifact failed its SHA256"):
        rollback_forecast.rollback("orders")
    assert json.loads(path.read_text())["algorithm"] == "RandomForest"
