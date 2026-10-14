"""Independent regression coverage for issues identified during the ABI audit."""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

from app.analytics import metrics
from app.analytics.filters import Filters
from app.core.config import Settings, DEFAULT_DATABASE_URL
from app.services import ml


@pytest.mark.parametrize("configured", [None, "", "sqlite:///./sem5.db", "sqlite:///sem5.db"])
def test_default_database_does_not_change_with_launch_directory(tmp_path, monkeypatch, configured):
    monkeypatch.chdir(tmp_path)
    if configured is None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    else:
        monkeypatch.setenv("DATABASE_URL", configured)
    assert Settings().DATABASE_URL == DEFAULT_DATABASE_URL
    assert DEFAULT_DATABASE_URL.endswith("/backend/sem5.db")
    assert not (tmp_path / "sem5.db").exists()


@pytest.mark.parametrize("url", ["sqlite:///custom.db", "sqlite:///:memory:", "postgresql://user@localhost/test"])
def test_explicit_database_is_preserved(url):
    assert Settings(DATABASE_URL=url).DATABASE_URL == url


def history(count=35):
    return [{"period": (date(2024, 1, 1) + timedelta(days=i)).isoformat(),
             "orders": float(i + 1), "revenue": float((i + 1) * 10)} for i in range(count)]


@pytest.mark.parametrize("invalid", ["short", "gap", "duplicate", "nonfinite"])
def test_invalid_history_rejected_before_loading_artifact(monkeypatch, invalid):
    points = history()
    if invalid == "short":
        points = points[:29]
    elif invalid == "gap":
        points.pop(20)
    elif invalid == "duplicate":
        points[-1]["period"] = points[-2]["period"]
    else:
        points[-1]["orders"] = float("inf")
    monkeypatch.setattr(metrics, "time_series", lambda *args, **kwargs: points)
    def must_not_load(*args):
        pytest.fail("Invalid history must not trigger artifact loading")
    monkeypatch.setattr(ml, "_load_artifact", must_not_load)
    with pytest.raises(ValueError):
        ml.forecast(db=object())


def test_real_saved_forecast_preserves_filter_and_feature_contract(monkeypatch):
    points = history()
    selected = Filters(date_from="2024-01-01", date_to="2024-02-04", category="books")
    def selected_history(db, f, grain, limit):
        assert f is selected
        assert grain == "day"
        return points
    monkeypatch.setattr(metrics, "time_series", selected_history)
    # Load the existing trusted local model, not a mock or the blocked candidate.
    if not ml.artifact_available("sales_forecast_orders"):
        pytest.skip("Existing local orders artifact is not bundled in fresh clones")
    result = ml.forecast(2, "orders", db=object(), f=selected)
    assert len(result["forecast"]) == 2
    assert result["forecast"][0]["date"] == "2024-02-05"
    assert all(np.isfinite(p["orders"]) for p in result["forecast"])


def test_nonfinite_prediction_is_not_recursively_reused(monkeypatch):
    monkeypatch.setattr(metrics, "time_series", lambda *args, **kwargs: history())
    class InvalidEstimator:
        def predict(self, row):
            return [float("nan")]
    monkeypatch.setattr(ml, "_load_artifact", lambda name: {
        "model": InvalidEstimator(), "features": ["lag1", "lag7", "lag14", "lag30", "roll7", "roll30"]})
    with pytest.raises(ValueError, match="non-finite prediction"):
        ml.forecast(db=object())


def test_candidate_is_preserved_but_never_registered():
    import json
    import hashlib
    import os
    candidate = Path(os.environ.get('SEM5_TEST_ABI_CANDIDATE_DIR') or
                     (Path(__file__).resolve().parents[2] / "ml" / "candidates" / "abi-revenue"))
    manifest = json.loads((candidate / "provenance.json").read_text())
    candidate_artifact = candidate / "gradient_boosting_sales_model.joblib"
    if candidate_artifact.is_file():
        assert hashlib.sha256(candidate_artifact.read_bytes()).hexdigest() == manifest["artifact_sha256"]
    else:
        assert manifest["distribution"].endswith("binary is local-only and excluded; separate artifact-distribution approval is required.")
    active_revenue = ml.load_all_metadata()["sales_forecast_revenue"]
    assert active_revenue["artifact"].startswith("sales_forecast_revenue_")
    assert active_revenue["evaluation"].endswith(".evaluation.json")
    assert all(meta.get("artifact") != "gradient_boosting_sales_model.joblib"
               for meta in ml.load_all_metadata().values())
    assert manifest["activation_status"] == "blocked"
    source = json.loads((candidate / "source_model_metadata.json").read_text())
    registry = json.loads((candidate / "source_registry_metadata.json").read_text())
    assert len(source["features"]) == 27
    assert source["features"] == registry["features_schema"]


def test_sparse_reference_is_not_applicable_before_inference(monkeypatch):
    from types import SimpleNamespace
    points = history()
    points.pop(20)
    monkeypatch.setattr(metrics, "time_series", lambda *args, **kwargs: points)
    db = SimpleNamespace(info={"dataset": SimpleNamespace(id="reference", adapter="star_schema")})
    result = ml.compatibility("sales_forecast_orders", db, Filters())
    assert result["compatible"] is False
    assert "consecutive" in " ".join(result["reasons"])


def test_missing_active_artifact_is_explicit(tmp_path, monkeypatch):
    monkeypatch.setattr(ml, "models_dir", lambda: tmp_path)
    ml._load_artifact.cache_clear()
    try:
        with pytest.raises(FileNotFoundError):
            ml._load_artifact("sales_forecast_orders")
    finally:
        ml._load_artifact.cache_clear()


def test_forecast_artifact_integrity_is_checked_before_deserialization(tmp_path, monkeypatch):
    artifact = tmp_path / "forecast.joblib"
    artifact.write_bytes(b"not a trusted model artifact")
    monkeypatch.setattr(ml, "models_dir", lambda: tmp_path)
    monkeypatch.setattr(ml, "load_all_metadata", lambda: {"sales_forecast_orders": {
        "artifact": artifact.name, "artifact_sha256": "0" * 64,
    }})
    ml._load_artifact.cache_clear()
    try:
        with pytest.raises(ValueError, match="integrity check failed"):
            ml._load_artifact("sales_forecast_orders")
    finally:
        ml._load_artifact.cache_clear()


def test_forecast_authentication_and_invalid_target_are_preserved(client, analyst_auth):
    assert client.get("/api/ml/forecast").status_code == 401
    assert client.get("/api/ml/forecast?target=abi-revenue", headers=analyst_auth).status_code == 400
