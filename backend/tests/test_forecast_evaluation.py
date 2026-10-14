import json

import pytest

from app.services import ml


def _evaluation_files(tmp_path, monkeypatch, prediction_name="orders.holdout.csv", rows=None):
    reports = tmp_path / "ml" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    report = {
        "selected_candidate": "LinearRegression",
        "target_definition": "daily order count",
        "training_period": ["2017-01-01", "2017-06-01"],
        "validation_period": ["2017-06-02", "2017-08-01"],
        "holdout_period": ["2017-08-02", "2017-08-03"],
        "holdout_predictions_file": prediction_name,
        "holdout_metrics": {"LinearRegression": {"mae": 1.0}, "SeasonalNaive7": {"mae": 2.0}},
        "validation_metrics": {"LinearRegression": {"mae": 1.1}},
        "validation_windows": [], "data_sha256": "trusted-source-hash",
    }
    (reports / "orders.evaluation.json").write_text(json.dumps(report), encoding="utf-8")
    if rows is not None:
        (reports / prediction_name).write_text(rows, encoding="utf-8")
    monkeypatch.setattr(ml, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(ml, "load_all_metadata", lambda: {
        "sales_forecast_orders": {"evaluation": "orders.evaluation.json", "version": "0.3.0",
                                  "algorithm": "LinearRegression"}
    })


def test_forecast_evaluation_returns_only_selected_real_holdout_rows(tmp_path, monkeypatch):
    _evaluation_files(tmp_path, monkeypatch, rows=(
        "date,actual,predicted,model\n"
        "2017-08-03,13,12,LinearRegression\n"
        "2017-08-02,10,9,LinearRegression\n"
        "2017-08-02,10,8,SeasonalNaive7\n"
    ))
    result = ml.forecast_evaluation("orders")
    assert result["model"] == "LinearRegression"
    assert result["n_evaluated"] == 2
    assert result["data_scope"].startswith("Unified Olist extended dataset")
    assert result["points"] == [
        {"date": "2017-08-02", "actual": 10.0, "predicted": 9.0, "residual": 1.0},
        {"date": "2017-08-03", "actual": 13.0, "predicted": 12.0, "residual": 1.0},
    ]


@pytest.mark.parametrize("unsafe", ["..\\outside.csv", "subdir\\predictions.csv"])
def test_forecast_evaluation_rejects_prediction_path_traversal(tmp_path, monkeypatch, unsafe):
    _evaluation_files(tmp_path, monkeypatch, prediction_name=unsafe)
    with pytest.raises(ValueError, match="trusted reports directory"):
        ml.forecast_evaluation("orders")


def test_forecast_evaluation_rejects_duplicate_dates_and_nonfinite_values(tmp_path, monkeypatch):
    _evaluation_files(tmp_path, monkeypatch, rows=(
        "date,actual,predicted,model\n"
        "2017-08-02,10,9,LinearRegression\n"
        "2017-08-02,11,10,LinearRegression\n"
    ))
    with pytest.raises(ValueError, match="duplicate dates"):
        ml.forecast_evaluation("orders")
    _evaluation_files(tmp_path, monkeypatch, rows=(
        "date,actual,predicted,model\n2017-08-02,inf,9,LinearRegression\n"
    ))
    with pytest.raises(ValueError, match="invalid dates or values"):
        ml.forecast_evaluation("orders")


def test_forecast_evaluation_checks_registered_report_hash(tmp_path, monkeypatch):
    _evaluation_files(tmp_path, monkeypatch, rows=(
        "date,actual,predicted,model\n2017-08-02,10,9,LinearRegression\n"
    ))
    registry = {"sales_forecast_orders": {
        "evaluation": "orders.evaluation.json", "version": "0.3.0",
        "algorithm": "LinearRegression", "evaluation_sha256": "bad-digest",
    }}
    monkeypatch.setattr(ml, "load_all_metadata", lambda: registry)
    with pytest.raises(ValueError, match="integrity check"):
        ml.forecast_evaluation("orders")


def test_forecast_evaluation_checks_holdout_hash(tmp_path, monkeypatch):
    _evaluation_files(tmp_path, monkeypatch, rows=(
        "date,actual,predicted,model\n2017-08-02,10,9,LinearRegression\n"
    ))
    path = tmp_path / "ml" / "reports" / "orders.evaluation.json"
    report = json.loads(path.read_text(encoding="utf-8"))
    report["holdout_predictions_sha256"] = "bad-digest"
    path.write_text(json.dumps(report), encoding="utf-8")
    with pytest.raises(ValueError, match="predictions failed their integrity check"):
        ml.forecast_evaluation("orders")
