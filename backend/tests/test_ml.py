import pytest

EXPECTED_FEATURES = {
    "sales_forecast",
    "sales_prediction",
    "customer_segmentation",
    "product_segmentation",
    "anomaly_detection",
}


def test_ml_status_lists_all_features(client, analyst_auth):
    r = client.get("/api/ml/status", headers=analyst_auth)
    assert r.status_code == 200
    names = {f["name"] for f in r.json()["features"]}
    assert EXPECTED_FEATURES <= names


def test_ml_status_is_honest(client, analyst_auth):
    for f in client.get("/api/ml/status", headers=analyst_auth).json()["features"]:
        assert f["status"] in {
            "planned",
            "data_preparation",
            "training",
            "testing",
            "integration",
            "available",
            "failed",
        }


def test_ml_requires_authentication(client):
    assert client.get("/api/ml/status").status_code == 401


def test_ml_endpoints_available_to_both_roles(client, analyst_auth, auth):
    for headers in (analyst_auth, auth):
        assert client.get("/api/ml/status", headers=headers).status_code == 200
        # Endpoints requiring ML artifacts succeed on auth; if unbundled .joblib is absent, 503 is returned
        assert client.get("/api/ml/anomalies", headers=headers).status_code in {200, 503}
        assert client.get("/api/ml/segments/customers", headers=headers).status_code in {200, 503}
        assert client.get("/api/ml/product-segmentation", headers=headers).status_code in {200, 503}
        assert client.get("/api/ml/forecast?target=orders", headers=headers).status_code in {200, 503}
        assert client.get("/api/ml/forecast?target=revenue", headers=headers).status_code in {200, 503}

def test_ml_invalid_forecast_target(client, analyst_auth):
    assert client.get("/api/ml/forecast?target=invalid", headers=analyst_auth).status_code == 400


def test_login_returns_expected_access_token_response(client):
    r = client.post("/api/auth/login", data={"username": "analyst", "password": "analyst123"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body.get("token_type") == "bearer"
    assert body.get("user", {}).get("role") == "analyst"

    r_admin = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert r_admin.status_code == 200
    body_admin = r_admin.json()
    assert "access_token" in body_admin
    assert body_admin.get("token_type") == "bearer"
    assert body_admin.get("user", {}).get("role") == "admin"


def test_forecast_unauthenticated_returns_401(client):
    r_rev = client.get("/api/ml/forecast?target=revenue&periods=7")
    assert r_rev.status_code == 401
    assert r_rev.json()["detail"] == "Authentication required"

    r_ord = client.get("/api/ml/forecast?target=orders&periods=7")
    assert r_ord.status_code == 401
    assert r_ord.json()["detail"] == "Authentication required"


def test_forecast_invalid_or_expired_token_rejected(client):
    r_bad = client.get(
        "/api/ml/forecast?target=revenue&periods=7",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert r_bad.status_code == 401
    assert r_bad.json()["detail"] == "Authentication required"

    from app.core.security import create_access_token

    expired_token = create_access_token("analyst", "analyst", expires_minutes=-10)
    r_exp = client.get(
        "/api/ml/forecast?target=revenue&periods=7",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert r_exp.status_code == 401
    assert r_exp.json()["detail"] == "Authentication required"


@pytest.fixture
def revenue_history_fixture():
    from datetime import date, timedelta
    from sqlalchemy.orm import Session
    from app.database.session import engine
    from app.models.warehouse import DimDate, FactOrders, FactOrderItems
    from app.services import datasets as ds_service

    with Session(engine) as db:
        start = date(2023, 1, 1)
        for i in range(370):
            day = start + timedelta(days=i)
            db.merge(DimDate(date_key=day, year=day.year, month=day.month, day=day.day,
                             quarter=(day.month - 1) // 3 + 1, weekday=day.weekday()))
            db.merge(FactOrders(
                order_id=f"rev-fixture-{i}",
                customer_unique_id="test-customer",
                purchase_date=day,
                order_status="delivered",
                item_revenue=150.0 + (i % 20) * 10,
                freight_value=5,
                payment_type="credit_card",
                payment_installments=1,
                review_score=5,
                delivery_days=2,
                delivered_customer_date=day + timedelta(days=2),
                estimated_delivery_date=day + timedelta(days=3),
                is_late=False,
            ))
            db.merge(FactOrderItems(
                order_id=f"rev-fixture-{i}",
                order_item_id=1,
                product_id="test-product",
                seller_id="test-seller",
                customer_unique_id="test-customer",
                purchase_date=day,
                price=150.0 + (i % 20) * 10,
                freight_value=5,
                product_category_name_en="books",
            ))
        db.commit()
        ds_service.ensure_registry(db)


def test_revenue_forecast_reaches_inference_with_valid_authentication(client, analyst_auth, auth, revenue_history_fixture):
    for headers in (analyst_auth, auth):
        r = client.get("/api/ml/forecast?target=revenue&periods=7", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "available"
        forecast_items = body.get("forecast", [])
        assert len(forecast_items) == 7
        for item in forecast_items:
            assert "date" in item
            assert "revenue" in item
            assert isinstance(item["revenue"], (int, float))
            assert item["revenue"] > 0


def test_orders_forecast_behaves_as_before(client, analyst_auth, auth):
    for headers in (analyst_auth, auth):
        r = client.get("/api/ml/forecast?target=orders&periods=7", headers=headers)
        # Authentication succeeds (never 401/403)
        assert r.status_code not in {401, 403}
        # In current repo without orders joblib artifact, 503 is returned
        assert r.status_code in {200, 503}


def test_ml_role_restrictions_enforced(client, analyst_auth, auth):
    # ML endpoint accessible to analyst and admin
    assert client.get("/api/ml/status", headers=analyst_auth).status_code == 200
    assert client.get("/api/ml/status", headers=auth).status_code == 200

    # Admin endpoint forbidden to analyst (403)
    assert client.get("/api/admin/system/status", headers=analyst_auth).status_code == 403

    # Admin endpoint accessible to admin (200)
    assert client.get("/api/admin/system/status", headers=auth).status_code == 200

