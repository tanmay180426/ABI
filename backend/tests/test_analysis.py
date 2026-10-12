import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.deps import get_db
from app.services import datasets as ds_service

CSV_ORDERS = b"""order_id,date,customer_id,revenue
ord_1,2025-01-01,cust_1,150.00
ord_2,2025-01-02,cust_2,250.00
ord_3,2025-01-03,cust_1,350.00
"""

CSV_CUSTOMERS = b"""customer_id,customer_name,state
cust_1,Alice,SP
cust_2,Bob,RJ
cust_3,Charlie,MG
"""

CSV_SALES_EXT = b"""order_id,date,customer_id,revenue
ord_4,2025-01-04,cust_2,450.00
ord_5,2025-01-05,cust_3,550.00
"""


@pytest.fixture
def isolated(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'analysis_test.db').as_posix()}", connect_args={"check_same_thread": False})
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


def test_session_lifecycle_and_dataset_preservation(isolated, analyst_auth):
    client, factory = isolated

    # 1. Upload two datasets
    r1 = client.post(
        "/api/datasets/upload",
        data={"name": "Orders Dataset"},
        files={"file": ("orders.csv", CSV_ORDERS)},
        headers=analyst_auth,
    )
    assert r1.status_code == 201
    ds1_id = r1.json()["dataset_id"]

    r2 = client.post(
        "/api/datasets/upload",
        data={"name": "Customers Dataset"},
        files={"file": ("customers.csv", CSV_CUSTOMERS)},
        headers=analyst_auth,
    )
    assert r2.status_code == 201
    ds2_id = r2.json()["dataset_id"]

    # 2. Create Analysis Session
    create_res = client.post(
        "/api/analysis/sessions",
        json={"name": "Q1 Performance Review", "dataset_ids": [ds1_id, ds2_id], "mode": "compare"},
        headers=analyst_auth,
    )
    assert create_res.status_code == 201
    session = create_res.json()
    session_id = session["id"]
    assert session["name"] == "Q1 Performance Review"
    assert session["mode"] == "compare"
    assert len(session["dataset_ids"]) == 2

    # 3. List sessions
    list_res = client.get("/api/analysis/sessions", headers=analyst_auth)
    assert list_res.status_code == 200
    assert any(s["id"] == session_id for s in list_res.json()["sessions"])

    # 4. Upload a third dataset and add to ongoing session
    r3 = client.post(
        "/api/datasets/upload",
        data={"name": "Sales Ext Dataset"},
        files={"file": ("sales_ext.csv", CSV_SALES_EXT)},
        headers=analyst_auth,
    )
    assert r3.status_code == 201
    ds3_id = r3.json()["dataset_id"]

    add_res = client.post(
        f"/api/analysis/sessions/{session_id}/datasets",
        json={"dataset_ids": [ds3_id]},
        headers=analyst_auth,
    )
    assert add_res.status_code == 200
    assert ds3_id in add_res.json()["dataset_ids"]
    assert len(add_res.json()["dataset_ids"]) == 3

    # 5. Remove dataset from session without deleting underlying dataset
    remove_res = client.delete(
        f"/api/analysis/sessions/{session_id}/datasets/{ds3_id}",
        headers=analyst_auth,
    )
    assert remove_res.status_code == 200
    assert ds3_id not in remove_res.json()["dataset_ids"]
    assert len(remove_res.json()["dataset_ids"]) == 2

    # Verify underlying dataset STILL EXISTS in dataset manager
    detail_res = client.get(f"/api/datasets/{ds3_id}", headers=analyst_auth)
    assert detail_res.status_code == 200
    assert detail_res.json()["dataset_name"] == "Sales Ext Dataset"


def test_mode_a_independent_comparison(isolated, analyst_auth):
    client, _ = isolated

    r1 = client.post(
        "/api/datasets/upload",
        data={"name": "Orders"},
        files={"file": ("orders.csv", CSV_ORDERS)},
        headers=analyst_auth,
    )
    r2 = client.post(
        "/api/datasets/upload",
        data={"name": "Customers"},
        files={"file": ("customers.csv", CSV_CUSTOMERS)},
        headers=analyst_auth,
    )
    ds1_id = r1.json()["dataset_id"]
    ds2_id = r2.json()["dataset_id"]

    comp_res = client.post(
        "/api/analysis/compare",
        json={"dataset_ids": [ds1_id, ds2_id]},
        headers=analyst_auth,
    )
    assert comp_res.status_code == 200
    body = comp_res.json()
    assert body["mode"] == "compare"
    assert body["dataset_count"] == 2
    assert len(body["summaries"]) == 2

    orders_sum = next(s for s in body["summaries"] if s["dataset_id"] == ds1_id)
    cust_sum = next(s for s in body["summaries"] if s["dataset_id"] == ds2_id)

    # Orders has revenue and date
    assert orders_sum["revenue"]["available"] is True
    assert orders_sum["revenue"]["total"] == 750.0
    assert orders_sum["date_range"]["has_date"] is True

    # Customers has no revenue
    assert cust_sum["revenue"]["available"] is False
    assert cust_sum["revenue"]["total"] is None

    # Comparison table
    assert len(body["comparison_table"]) == 2


def test_mode_b_combine_compatibility_preview_execute(isolated, analyst_auth):
    client, _ = isolated

    r1 = client.post(
        "/api/datasets/upload",
        data={"name": "Orders"},
        files={"file": ("orders.csv", CSV_ORDERS)},
        headers=analyst_auth,
    )
    r2 = client.post(
        "/api/datasets/upload",
        data={"name": "Customers"},
        files={"file": ("customers.csv", CSV_CUSTOMERS)},
        headers=analyst_auth,
    )
    ds1_id = r1.json()["dataset_id"]
    ds2_id = r2.json()["dataset_id"]

    # 1. Compatibility check
    compat_res = client.post(
        "/api/analysis/combine/compatibility",
        json={"dataset_ids": [ds1_id, ds2_id]},
        headers=analyst_auth,
    )
    assert compat_res.status_code == 200
    compat = compat_res.json()
    assert compat["join"]["has_candidates"] is True
    candidate_keys = [k["key"] for k in compat["join"]["candidate_keys"]]
    assert "customer_id" in candidate_keys

    # Find customer_id candidate
    cust_cand = next(k for k in compat["join"]["candidate_keys"] if k["key"] == "customer_id")
    # Orders has multiple orders per customer (not unique), Customers has unique customer_id
    assert cust_cand["left_unique"] is False
    assert cust_cand["right_unique"] is True
    assert cust_cand["relationship"] == "N:1"

    # 2. Preview join
    prev_res = client.post(
        "/api/analysis/combine/preview",
        json={
            "operation": "join",
            "dataset_ids": [ds1_id, ds2_id],
            "join_key": "customer_id",
            "join_type": "inner",
        },
        headers=analyst_auth,
    )
    assert prev_res.status_code == 200
    preview = prev_res.json()
    assert preview["total_preview_count"] == 3
    assert "customer_name" in preview["columns"]
    assert "revenue" in preview["columns"]

    # 3. Execute join and create derived dataset
    exec_res = client.post(
        "/api/analysis/combine/execute",
        json={
            "operation": "join",
            "dataset_ids": [ds1_id, ds2_id],
            "join_key": "customer_id",
            "join_type": "inner",
            "output_name": "Orders Enriched With Customers",
        },
        headers=analyst_auth,
    )
    assert exec_res.status_code == 201
    derived = exec_res.json()
    assert derived["dataset_name"] == "Orders Enriched With Customers"
    assert derived["row_count"] == 3
    assert derived["provenance"]["source_type"] == "derived_join"


def test_mode_c_cross_dataset_insights(isolated, analyst_auth):
    client, _ = isolated

    r1 = client.post(
        "/api/datasets/upload",
        data={"name": "Orders A"},
        files={"file": ("orders.csv", CSV_ORDERS)},
        headers=analyst_auth,
    )
    r2 = client.post(
        "/api/datasets/upload",
        data={"name": "Customers B"},
        files={"file": ("customers.csv", CSV_CUSTOMERS)},
        headers=analyst_auth,
    )
    ds1_id = r1.json()["dataset_id"]
    ds2_id = r2.json()["dataset_id"]

    insights_res = client.post(
        "/api/analysis/insights",
        json={"dataset_ids": [ds1_id, ds2_id]},
        headers=analyst_auth,
    )
    assert insights_res.status_code == 200
    insights = insights_res.json()
    assert insights["mode"] == "insights"
    assert insights["insights_count"] >= 1
    # Check that customer_id entity overlap was detected
    entity_insight = next((i for i in insights["insights"] if "customer_id" in i["title"]), None)
    assert entity_insight is not None
    assert "common 'customer_id' values" in entity_insight["finding"]
