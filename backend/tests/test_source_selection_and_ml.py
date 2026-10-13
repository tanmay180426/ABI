import io
import zipfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.deps import get_db

@pytest.fixture
def isolated(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'datasets_test.db').as_posix()}", connect_args={"check_same_thread": False})
    factory = sessionmaker(bind=engine)
    def database():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = database
    try:
        with TestClient(app) as client:
            yield client, factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()

SAMPLE_DAILY_TS = """date,revenue,quantity,category
2024-01-01,100,5,Electronics
2024-01-02,120,6,Electronics
2024-01-03,130,7,Electronics
2024-01-04,110,5,Books
2024-01-05,150,8,Electronics
2024-01-06,170,9,Books
2024-01-07,160,8,Electronics
2024-01-08,180,10,Electronics
2024-01-09,190,11,Books
2024-01-10,210,12,Electronics
2024-01-11,200,10,Electronics
2024-01-12,230,13,Books
2024-01-13,240,14,Electronics
2024-01-14,220,11,Electronics
2024-01-15,260,15,Books
2024-01-16,270,16,Electronics
2024-01-17,290,17,Electronics
2024-01-18,280,15,Books
2024-01-19,310,18,Electronics
2024-01-20,330,20,Electronics
2024-01-21,320,19,Books
2024-01-22,350,21,Electronics
2024-01-23,370,22,Electronics
2024-01-24,360,20,Books
2024-01-25,390,23,Electronics
2024-01-26,410,24,Electronics
2024-01-27,400,22,Books
2024-01-28,430,25,Electronics
2024-01-29,450,26,Electronics
2024-01-30,440,24,Books
2024-01-31,480,28,Electronics
2024-02-01,500,30,Electronics
"""

def test_api_datasets_limits(isolated, analyst_auth):
    client, _ = isolated
    r = client.get("/api/datasets/limits", headers=analyst_auth)
    assert r.status_code == 200
    data = r.json()
    assert "max_bytes" in data
    assert "max_zip_bytes" in data
    assert "max_batch_bytes" in data
    assert "max_zip_depth" in data
    assert data["max_zip_depth"] == 10
    assert data["max_compression_ratio"] == 100.0
    assert ".csv" in data["supported_file_types"]


def test_folder_upload_preserves_relative_paths(isolated, analyst_auth):
    client, _ = isolated
    files = [
        ("files", ("sales_archive/region_north/january.csv", io.BytesIO(SAMPLE_DAILY_TS.encode()))),
        ("files", ("sales_archive/region_south/february.csv", io.BytesIO(SAMPLE_DAILY_TS.encode()))),
    ]
    r = client.post("/api/datasets/upload-batch", data={"source_mode": "FOLDER_COLLECTION"}, files=files, headers=analyst_auth)
    assert r.status_code == 200
    resp = r.json()
    assert resp["successful"] == 2
    paths = [d.get("provenance", {}).get("relative_path") for d in resp["datasets"]]
    assert "sales_archive/region_north/january.csv" in paths
    assert "sales_archive/region_south/february.csv" in paths
    assert resp["source_mode"] == "FOLDER_COLLECTION"
    assert resp["collection_id"]
    assert {d["provenance"]["collection_id"] for d in resp["datasets"]} == {resp["collection_id"]}


def test_zip_nesting_depth_security(isolated, analyst_auth):
    client, _ = isolated
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        # Create an entry with nesting depth > 10
        deep_path = "a/b/c/d/e/f/g/h/i/j/k/l/data.csv"
        zf.writestr(deep_path, SAMPLE_DAILY_TS)
    buf.seek(0)

    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("deep_archive.zip", buf.getvalue(), "application/zip")},
        headers=analyst_auth,
    )
    if r.status_code == 200:
        assert r.json()["failed"] > 0 or r.json()["skipped"] > 0
    else:
        assert r.status_code in {400, 422}


def test_collections_grouping_endpoint(isolated, analyst_auth):
    client, _ = isolated
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("store_q1/jan.csv", SAMPLE_DAILY_TS)
        zf.writestr("store_q1/feb.csv", SAMPLE_DAILY_TS)
    buf.seek(0)

    r_upload = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("quarter1.zip", buf.getvalue(), "application/zip")},
        headers=analyst_auth,
    )
    assert r_upload.status_code == 200

    r_col = client.get("/api/datasets/collections", headers=analyst_auth)
    assert r_col.status_code == 200
    collections = r_col.json()["collections"]
    assert len(collections) >= 1
    zip_col = next((c for c in collections if c["source_type"] == "zip"), None)
    assert zip_col is not None
    assert zip_col["dataset_count"] == 2
    assert zip_col["total_rows"] > 0
    assert zip_col["source_mode"] == "ZIP_COLLECTION"
    assert zip_col["collection_id"] == r_upload.json()["collection_id"]

    selected = client.post(f"/api/datasets/collections/{zip_col['collection_id']}/select", headers=analyst_auth)
    assert selected.status_code == 200
    assert selected.json()["source_mode"] == "ZIP_COLLECTION"
    assert len(selected.json()["datasets"]) == 2
    listing = client.get("/api/datasets", headers=analyst_auth).json()
    assert listing["active_source"] == {"source_mode": "ZIP_COLLECTION", "source_id": zip_col["collection_id"]}


def test_evidence_based_insights(isolated, analyst_auth):
    client, _ = isolated
    r_upload = client.post(
        "/api/datasets/upload",
        data={"name": "Insights Test Dataset"},
        files={"file": ("ts.csv", io.BytesIO(SAMPLE_DAILY_TS.encode()))},
        headers=analyst_auth,
    )
    assert r_upload.status_code == 201
    ds_id = r_upload.json()["dataset_id"]

    r_insights = client.get(f"/api/datasets/{ds_id}/insights", headers=analyst_auth)
    assert r_insights.status_code == 200
    data = r_insights.json()
    assert data["dataset_id"] == ds_id
    insights = data["insights"]
    assert len(insights) > 0
    for ins in insights:
        assert "type" in ins
        assert "title" in ins
        assert "finding" in ins
        assert "metric" in ins
        assert ins["confidence"] in {"High", "Medium", "Low"}
        assert "basis" in ins
        assert "significance" in ins


def test_ml_forecasting_pipeline_end_to_end(isolated, analyst_auth):
    client, _ = isolated
    r_upload = client.post(
        "/api/datasets/upload",
        data={"name": "Forecasting Test Series"},
        files={"file": ("sales_ts.csv", io.BytesIO(SAMPLE_DAILY_TS.encode()))},
        headers=analyst_auth,
    )
    assert r_upload.status_code == 201
    ds_id = r_upload.json()["dataset_id"]

    # Scope request context to this uploaded dataset
    headers_scoped = {**analyst_auth, "X-Dataset-ID": ds_id}

    # 1. Options endpoint
    r_opt = client.get("/api/ml/forecast/options", headers=headers_scoped)
    assert r_opt.status_code == 200
    opts = r_opt.json()
    assert opts["compatible"] is True
    assert "revenue" in opts["target_columns"]
    assert "date" in opts["date_columns"]

    # 2. Dataset Forecast generation
    r_forecast = client.post(
        "/api/ml/forecast/dataset",
        json={
            "target_column": "revenue",
            "date_column": "date",
            "periods": 7,
            "grain": "D"
        },
        headers=headers_scoped,
    )
    assert r_forecast.status_code == 200
    res = r_forecast.json()
    assert res["status"] == "available"
    assert res["compatible"] is True
    assert len(res["forecast"]) == 7
    assert len(res["historical"]) > 0
    last_hist_date = res["historical"][-1]["date"]
    assert res["forecast"][0]["date"] > last_hist_date
    assert "lower_bound" in res["forecast"][0]
    assert "upper_bound" in res["forecast"][0]
    assert res["forecast"][0]["upper_bound"] >= res["forecast"][0]["lower_bound"]
    assert "mae" in res["metrics"]
    assert "baseline_mae" in res["metrics"]
    assert res["model_info"]["train_samples"] > 0
    assert res["model_info"]["val_samples"] > 0


def test_cross_user_isolation(isolated, analyst_auth, auth):
    client, _ = isolated
    r_upload = client.post(
        "/api/datasets/upload",
        data={"name": "Private Analyst Dataset"},
        files={"file": ("private.csv", io.BytesIO(SAMPLE_DAILY_TS.encode()))},
        headers=analyst_auth,
    )
    assert r_upload.status_code == 201
    ds_id = r_upload.json()["dataset_id"]

    # Other user (admin) should not be able to fetch private dataset insights of analyst
    r_other = client.get(f"/api/datasets/{ds_id}/insights", headers=auth)
    assert r_other.status_code in {403, 404}
