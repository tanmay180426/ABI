"""Verification test that Multi-Dataset Analysis endpoints are removed and return 404,
while Dataset Manager and underlying datasets remain fully preserved and functional.
"""
import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.deps import get_db

CSV_ORDERS = b"""order_id,date,customer_id,revenue
ord_1,2025-01-01,cust_1,150.00
ord_2,2025-01-02,cust_2,250.00
ord_3,2025-01-03,cust_1,350.00
"""

@pytest.fixture
def isolated(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'analysis_removal_test.db').as_posix()}", connect_args={"check_same_thread": False})
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


def test_multi_dataset_endpoints_removed_404(isolated, analyst_auth):
    client, _ = isolated

    # All former multi-dataset endpoints must return 404 Not Found
    r = client.get("/api/analysis/sessions", headers=analyst_auth)
    assert r.status_code == 404

    r = client.post("/api/analysis/sessions", json={"name": "Test"}, headers=analyst_auth)
    assert r.status_code == 404

    r = client.post("/api/analysis/compare", json={"dataset_ids": ["a", "b"]}, headers=analyst_auth)
    assert r.status_code == 404

    r = client.post("/api/analysis/combine/preview", json={"dataset_ids": ["a", "b"]}, headers=analyst_auth)
    assert r.status_code == 404

    r = client.post("/api/analysis/combine/execute", json={"dataset_ids": ["a", "b"]}, headers=analyst_auth)
    assert r.status_code == 404


def test_dataset_manager_intact_and_functional(isolated, analyst_auth):
    client, _ = isolated

    # Dataset manager upload must still work perfectly
    upload_res = client.post(
        "/api/datasets/upload",
        data={"name": "Operational Dataset"},
        files={"file": ("orders.csv", CSV_ORDERS)},
        headers=analyst_auth,
    )
    assert upload_res.status_code == 201
    ds_id = upload_res.json()["dataset_id"]

    # Listing datasets must succeed
    list_res = client.get("/api/datasets", headers=analyst_auth)
    assert list_res.status_code == 200
    datasets = list_res.json()["datasets"]
    assert any(d["dataset_id"] == ds_id for d in datasets)

    # Selecting dataset must succeed
    select_res = client.post(f"/api/datasets/{ds_id}/select", headers=analyst_auth)
    assert select_res.status_code == 200
    assert select_res.json()["dataset_id"] == ds_id
