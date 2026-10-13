"""ML model registry + serving layer.

Reads model metadata written by the ml/ training scripts and lazily loads
joblib artifacts to serve predictions. All numbers come from real training runs.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

FEATURE_GROUPS: dict[str, list[str]] = {
    "sales_forecast": ["sales_forecast_orders", "sales_forecast_revenue"],
    "sales_prediction": ["sales_prediction"],
    "customer_segmentation": ["customer_segmentation"],
    "product_segmentation": ["product_segmentation"],
    "anomaly_detection": ["anomaly_detection"],
}


def models_dir() -> Path:
    env = os.getenv("ML_MODELS_DIR")
    return Path(env) if env else REPO_ROOT / "ml" / "models"


def processed_dir() -> Path:
    env = os.getenv("ML_DATA_DIR")
    return Path(env) if env else REPO_ROOT / "ml" / "data" / "processed"


@lru_cache(maxsize=1)
def load_all_metadata() -> dict[str, dict]:
    out: dict[str, dict] = {}
    d = models_dir()
    if not d.exists():
        return out
    for path in d.glob("*.metadata.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            out[path.name.replace(".metadata.json", "")] = data
        except (json.JSONDecodeError, OSError):
            continue
    return out


def artifact_available(name: str) -> bool:
    meta = load_all_metadata().get(name)
    if not meta or not meta.get("artifact"):
        return False
    return (models_dir() / meta["artifact"]).exists()


def feature_status() -> list[dict]:
    metas = load_all_metadata()
    features = []
    for feature, keys in FEATURE_GROUPS.items():
        present = [k for k in keys if k in metas]
        if not present:
            features.append({"name": feature, "status": "planned", "models": []})
            continue
        statuses = [metas[k].get("status", "planned") for k in present]
        all_available = all(s == "available" for s in statuses)
        artifacts_ready = all(artifact_available(k) for k in present)
        if all_available and artifacts_ready:
            status = "available"
        elif all_available:
            status = "integration"  # trained + documented, artifact not present locally
        else:
            status = statuses[0]
        features.append(
            {
                "name": feature,
                "status": status,
                "models": [
                    {
                        "name": k,
                        "algorithm": metas[k].get("algorithm"),
                        "trained_at": metas[k].get("trained_at"),
                        "metrics": metas[k].get("metrics"),
                        "artifact_available": artifact_available(k),
                    }
                    for k in present
                ],
            }
        )
    return features


@lru_cache(maxsize=8)
def _load_artifact(name: str):
    import joblib

    meta = load_all_metadata().get(name)
    if not meta or not meta.get("artifact"):
        raise FileNotFoundError(f"no artifact metadata for {name}")
    path = models_dir() / meta["artifact"]
    if not path.exists():
        raise FileNotFoundError(f"artifact missing: {path}")
    return joblib.load(path)


def forecast(periods: int = 30, target: str = "orders", db=None, f=None) -> dict:
    """Recursive daily forecast for orders or revenue."""
    import numpy as np
    import pandas as pd

    if target not in {"orders", "revenue"}:
        raise ValueError("target must be 'orders' or 'revenue'")
    if db is None:
        raise ValueError("Dataset context is required for inference.")

    from app.analytics import metrics
    from app.analytics.filters import Filters

    # Internal history filter: preserve all dimension filters (category, customer_state, etc.)
    # but do NOT restrict date_from, ensuring the model has sufficient multi-horizon history (365 days).
    feature_filter = Filters(
        date_from=None,
        date_to=None,
        category=f.category if f else None,
        customer_state=f.customer_state if f else None,
        seller_state=f.seller_state if f else None,
        order_status=f.order_status if f else None,
        payment_type=f.payment_type if f else None,
        review_score=f.review_score if f else None,
        column_filters=f.column_filters if f else None,
    ) if f else Filters()

    points = metrics.time_series(db, feature_filter, "day", limit=100_000)
    if not points:
        raise ValueError("No historical data available.")

    series = pd.DataFrame(points).rename(columns={"period": "date"})
    series["date"] = pd.to_datetime(series["date"])
    series = series.sort_values("date").drop_duplicates("date")
    series = series.set_index("date")

    start_date, last_date = series.index.min(), series.index.max()
    calendar = pd.date_range(start_date, last_date, freq="D")
    series = series.reindex(calendar).fillna(0.0)

    if target == "orders":
        bundle = _load_artifact("sales_forecast_orders")
        model, feature_cols = bundle["model"], bundle["features"]
        hist = series["orders"].astype(float).copy()
        values = list(hist.values)
        if len(values) < 30:
            raise ValueError("Orders forecasting requires at least 30 daily observations.")
        preds = []

        for step in range(periods):
            window = np.array(values, dtype=float)
            feats = {
                "lag1": window[-1],
                "lag7": window[-7],
                "lag14": window[-14],
                "lag30": window[-30],
                "roll7": window[-7:].mean(),
                "roll30": window[-30:].mean(),
            }
            row = pd.DataFrame(
                [[feats[c] for c in feature_cols]],
                columns=feature_cols,
            )
            yhat = max(0.0, float(model.predict(row)[0]))
            values.append(yhat)
            preds.append({
                "date": (last_date + pd.Timedelta(days=step + 1)).strftime("%Y-%m-%d"),
                target: round(yhat, 2),
            })

        all_hist = [
            {"date": d.strftime("%Y-%m-%d"), target: round(float(v), 2)}
            for d, v in zip(calendar, values[:len(calendar)])
        ]
        if f and (f.date_from or f.date_to):
            display_hist = [
                p for p in all_hist
                if (not f.date_from or p["date"] >= f.date_from)
                and (not f.date_to or p["date"] <= f.date_to)
            ]
            history_tail = display_hist if display_hist else all_hist[-30:]
        else:
            history_tail = all_hist[-30:]

        return {
            "history_tail": history_tail,
            "forecast": preds,
        }

    # Revenue model: raw sklearn estimator + registered metadata.
    model = _load_artifact("sales_forecast_revenue")
    meta = load_all_metadata()["sales_forecast_revenue"]
    feature_cols = meta["features_schema"]

    revenue_values = series["revenue"].astype(float).tolist()
    orders_values = series["orders"].astype(float).tolist()

    if len(revenue_values) < 365:
        raise ValueError("Revenue forecasting requires at least 365 daily observations.")

    preds = []
    for step in range(periods):
        day = last_date + pd.Timedelta(days=step + 1)

        # Estimate future orders using the same weekday from the prior week.
        estimated_orders = max(0.0, float(orders_values[-7]))

        rv = np.asarray(revenue_values, dtype=float)
        ov = np.asarray(orders_values, dtype=float)

        def sample_std(values):
            return float(np.std(values, ddof=1)) if len(values) > 1 else 0.0

        features = {
            "year": day.year,
            "month": day.month,
            "quarter": day.quarter,
            "day_of_week": day.dayofweek,
            "week_of_year": int(day.isocalendar().week),
            "day_of_month": day.day,
            "is_weekend": int(day.dayofweek >= 5),
        }

        for lag in (1, 7, 14, 28, 30, 365):
            features[f"revenue_lag_{lag}"] = float(rv[-lag])
            features[f"orders_lag_{lag}"] = float(ov[-lag])

        for window in (7, 14, 30, 90):
            recent = rv[-window:]
            features[f"revenue_roll_mean_{window}"] = float(np.mean(recent))
            features[f"revenue_roll_std_{window}"] = sample_std(recent)

        row = pd.DataFrame(
            [[features[col] for col in feature_cols]],
            columns=feature_cols,
        )
        yhat = max(0.0, float(model.predict(row)[0]))

        revenue_values.append(yhat)
        orders_values.append(estimated_orders)
        preds.append({
            "date": day.strftime("%Y-%m-%d"),
            "revenue": round(yhat, 2),
        })

    all_history = [
        {"date": d.strftime("%Y-%m-%d"), "revenue": round(float(v), 2)}
        for d, v in zip(calendar, revenue_values[:len(calendar)])
    ]
    if f and (f.date_from or f.date_to):
        display_history = [
            p for p in all_history
            if (not f.date_from or p["date"] >= f.date_from)
            and (not f.date_to or p["date"] <= f.date_to)
        ]
        history_tail = display_history if display_history else all_history[-30:]
    else:
        history_tail = all_history[-30:]

    return {"history_tail": history_tail, "forecast": preds}

def anomalies(db=None, f=None) -> dict:
    if db is not None:
        import pandas as pd
        from app.analytics import metrics
        from app.analytics.filters import Filters
        points = metrics.time_series(db, f or Filters(), "day", limit=100_000)
        frame = pd.DataFrame(points)
        bundle = _load_artifact("anomaly_detection")
        features = frame[bundle["features"]].astype(float)
        frame["anomaly"] = bundle["model"].predict(features)
        frame["score"] = bundle["model"].decision_function(features)
        selected = frame[frame.anomaly == -1].sort_values("score")
        return {"status": "available", "n_days": len(frame), "n_anomalies": len(selected),
                "anomalies": selected.rename(columns={"period": "date"}).head(100).to_dict("records")}
    meta = load_all_metadata().get("anomaly_detection", {})
    return {"metrics": meta.get("metrics", {}), "status": meta.get("status", "planned")}


def customer_segments(db=None, f=None) -> dict:
    if db is not None:
        import numpy as np
        import pandas as pd
        from sqlalchemy import func, select
        from app.analytics.filters import order_from, order_where, order_monetary_scope, Filters
        from app.analytics.tabular import TabularSource
        from sqlalchemy import text
        ds = db.info["dataset"]
        f = f or Filters()
        if ds.adapter == "tabular":
            source = TabularSource(db, f)
            customer, order, date, amount = (source.field(r) for r in ("customer", "order", "date", "revenue"))
            rows = source.rows(source.statement(customer.label("customer"), func.max(date).label("last_purchase"),
                                                func.count(func.distinct(order)).label("frequency"), func.sum(amount).label("monetary"))
                               .where(customer.is_not(None)).group_by(customer))
        else:
            where, params = order_where(f)
            source, amount = order_monetary_scope(f)
            rows = [dict(r) for r in db.execute(text(f"SELECT o.customer_unique_id AS customer, MAX(o.purchase_date) AS last_purchase, "
                f"COUNT(DISTINCT o.order_id) AS frequency, COALESCE(SUM({amount}), 0) AS monetary FROM {source} WHERE {where} "
                "AND o.purchase_date IS NOT NULL AND o.customer_unique_id IS NOT NULL "
                "GROUP BY o.customer_unique_id"), params).mappings()]
        frame = pd.DataFrame(rows)
        dates = pd.to_datetime(frame.last_purchase, utc=True)
        frame["recency_days"] = ((dates.max() + pd.Timedelta(days=1)) - dates).dt.days
        frame["monetary_log"] = np.log1p(frame.monetary.clip(lower=0))
        bundle = _load_artifact("customer_segmentation")
        frame["segment"] = bundle["model"].predict(bundle["scaler"].transform(frame[bundle["features"]].astype(float)))
        return {"status": "available", "segments": frame.groupby("segment").agg(customers=("customer", "count"),
                    monetary=("monetary", "sum")).reset_index().to_dict("records")}
    meta = load_all_metadata().get("customer_segmentation", {})
    return {"metrics": meta.get("metrics", {}), "status": meta.get("status", "planned")}


def product_segments(db, f) -> dict:
    import pandas as pd
    import numpy as np
    from app.analytics.filters import item_where, item_from

    bundle = _load_artifact("product_segmentation")
    model = bundle["model"]
    scaler = bundle["scaler"]
    features = bundle["features"]

    ds = db.info.get("dataset")
    if ds is not None and ds.adapter == "tabular":
        from app.analytics.tabular import TabularSource
        from sqlalchemy import func
        source = TabularSource(db, f)
        product, quantity, revenue, price, weight = (source.field(r) for r in ("product", "quantity", "revenue", "price", "weight_g"))
        category = source.field("category")
        columns = [product.label("product"), func.sum(quantity).label("total_qty"), func.sum(revenue).label("total_revenue"),
                   func.avg(price).label("avg_price"), func.avg(weight).label("product_weight_g")]
        if category is not None:
            columns.append(func.min(category).label("category"))
        df = pd.DataFrame(source.rows(source.statement(*columns).where(product.is_not(None)).group_by(product)))
        if "category" not in df:
            df["category"] = "Unspecified"
    else:
        df = _reference_product_features(db, f)

    return _product_predictions(df, bundle)


def _reference_product_features(db, f):
    import pandas as pd
    from app.analytics.filters import item_where, item_from
    where, params = item_where(f)
    sql = f"""
        SELECT SUBSTR(i.product_id, 1, 8) AS product,
               COALESCE(i.product_category_name_en, 'unknown') AS category,
               COALESCE(SUM(i.price), 0) AS total_revenue,
               COUNT(*) AS total_qty,
               AVG(i.price) AS avg_price,
               AVG(p.product_weight_g) AS product_weight_g
        FROM {item_from(f, with_product=True)}
        WHERE {where}
        GROUP BY i.product_id, category
    """
    df = pd.read_sql(sql, db.connection(), params=params)
    return df


def _product_predictions(df, bundle):
    import numpy as np
    model, scaler, features = bundle["model"], bundle["scaler"], bundle["features"]

    if df.empty:
        return {"segments": [], "top_products": [], "k": bundle.get("k", 0)}

    # Preprocessing identical to training
    df["qty_log"] = np.log1p(df["total_qty"].clip(lower=0))
    df["revenue_log"] = np.log1p(df["total_revenue"].clip(lower=0))

    # Impute missing values with medians (if dataset medians were saved, we'd use them, but here we just use batch median)
    df["product_weight_g"] = df["product_weight_g"].fillna(df["product_weight_g"].median())
    df["avg_price"] = df["avg_price"].fillna(df["avg_price"].median())

    # Handle the case where batch median is still NaN
    df["product_weight_g"] = df["product_weight_g"].fillna(0)
    df["avg_price"] = df["avg_price"].fillna(0)

    X = df[features].astype(float)
    Xs = scaler.transform(X)
    df["segment"] = model.predict(Xs).astype(int)

    # Aggregate
    agg = df.groupby("segment").agg(
        products=("product", "count"),
        revenue=("total_revenue", "sum"),
        quantity=("total_qty", "sum"),
        avg_price=("avg_price", "mean"),
    ).reset_index()

    # Get sample products per segment
    samples = []
    for s in agg["segment"].unique():
        sdf = df[df["segment"] == s].nlargest(5, "total_revenue")
        for _, row in sdf.iterrows():
            samples.append({
                "product": row["product"],
                "category": row["category"],
                "segment": int(row["segment"]),
                "revenue": round(float(row["total_revenue"]), 2),
                "quantity": int(row["total_qty"]),
                "avg_price": round(float(row["avg_price"]), 2)
            })

    # Add share pct
    total_rev = agg["revenue"].sum()
    total_qty = agg["quantity"].sum()

    out_segs = []
    for _, row in agg.iterrows():
        out_segs.append({
            "segment": int(row["segment"]),
            "products": int(row["products"]),
            "revenue": round(float(row["revenue"]), 2),
            "quantity": int(row["quantity"]),
            "avg_price": round(float(row["avg_price"]), 2),
            "revenue_share": round(float(row["revenue"]) / total_rev * 100, 1) if total_rev else 0.0,
            "quantity_share": round(float(row["quantity"]) / total_qty * 100, 1) if total_qty else 0.0
        })

    return {
        "segments": out_segs,
        "top_products": samples,
        "k": int(bundle.get("k", len(agg)))
    }


def predict_sales(payload: dict) -> dict:
    import pandas as pd

    bundle = _load_artifact("sales_prediction")
    pipe, features = bundle["pipeline"], bundle["features"]
    row = pd.DataFrame([{f: payload.get(f) for f in features}])
    yhat = float(pipe.predict(row)[0])
    return {"predicted_item_revenue": round(yhat, 2), "currency": "BRL"}


def compatibility(name, db, f=None):
    """Contracts describe trained-domain validity separately from availability."""
    from app.analytics.filters import Filters
    from app.analytics import metrics
    ds = db.info["dataset"]
    contract = load_all_metadata().get(name, {}).get("contract", {})
    reasons = []
    if not contract:
        reasons.append("No verified inference contract is registered for this model.")
    if ds.adapter == "tabular":
        from app.analytics.tabular import TabularSource
        source = TabularSource(db, f)
        for role in contract.get("required_semantics", []):
            if source.field(role) is None:
                reasons.append(f"Missing confirmed {role.replace('_', ' ')} field.")
        currency = contract.get("currency_code")
        if currency and ds.semantics.get("currency_code") != currency:
            reasons.append(f"This trained model requires confirmed {currency} monetary units.")
        if ds.semantics.get("domain") not in {"commerce", "transactions"}:
            reasons.append("The model was trained for commerce; this dataset's domain is unconfirmed or unrelated.")
        columns = {c["name"]: c for c in source.columns}
        for role in contract.get("required_semantics", []):
            column = columns.get(source.fields.get(role))
            if column and column["missing"]:
                reasons.append(f"Required {role} contains missing values; correct the dataset before inference.")
            if column and role in {"revenue", "price", "quantity", "weight_g"} and column.get("statistics", {}).get("min", 0) < 0:
                reasons.append(f"The {role} field contains negative values outside the trained feature contract.")
    if not reasons:
        if contract.get("frequency") == "daily":
            import pandas as pd
            points = metrics.time_series(db, f or Filters(), "day", limit=100_000)
            if len(points) < contract.get("minimum_observations", 1):
                reasons.append(f"At least {contract.get('minimum_observations')} daily observations are required after filtering.")
            elif ds.adapter == "tabular":
                dates = pd.to_datetime([p["period"] for p in points][-30:])
                if len(dates) > 1 and not ((dates[1:] - dates[:-1]).days == 1).all():
                    reasons.append("The latest 30 daily observations must be consecutive; missing days cannot be assumed to be zero.")
        else:
            if ds.adapter == "star_schema":
                from app.analytics.filters import order_from, order_where
                from sqlalchemy import text
                where, params = order_where(f or Filters())
                n = db.scalar(text(f"SELECT COUNT(*) FROM {order_from(f or Filters())} WHERE {where}"), params)
            else:
                from sqlalchemy import func
                n = source.scalar(func.count())
            if not n:
                reasons.append("No observations match the selected filters.")
    return {"compatible": not reasons, "reasons": reasons, "contract": contract,
            "training_domain": contract.get("training_domain"), "dataset_id": ds.id,
            "artifact_available": artifact_available(name)}


def validate_output(value):
    import math
    import numbers
    if isinstance(value, dict):
        for v in value.values():
            validate_output(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            validate_output(v)
    elif isinstance(value, numbers.Real) and not math.isfinite(float(value)):
        raise ValueError("Model returned a non-finite prediction.")


def forecast_options(db) -> dict:
    """Return available temporal and numeric columns for forecasting in the active dataset."""
    ds = db.info.get("dataset")
    if not ds:
        return {"date_columns": [], "target_columns": [], "compatible": False, "reason": "No dataset active."}

    date_cols: list[str] = []
    num_cols: list[str] = []

    if ds.adapter == "star_schema":
        date_cols = ["purchase_date"]
        num_cols = ["revenue", "orders", "customers", "items_sold"]
        objectives = {
            "revenue": {
                "label": "Revenue Forecasting",
                "target_column": "revenue",
                "description": "Predict gross monetary volume and cash flow trajectories.",
                "available": True,
            },
            "customers": {
                "label": "Customer Activity Forecasting",
                "target_column": "customers",
                "description": "Predict distinct active customer engagement and account demand.",
                "available": True,
            },
            "product_sales": {
                "label": "Product Sales & Unit Demand",
                "target_column": "orders",
                "description": "Predict transaction volume and item demand across product lines.",
                "available": True,
            },
        }
    else:
        columns = ds.profile.get("columns", [])
        for c in columns:
            if c.get("dtype") == "datetime":
                date_cols.append(c["name"])
            elif c.get("dtype") == "numeric" and c.get("role") != "identifier":
                num_cols.append(c["name"])

        # Detect revenue, customer, and product sales objectives
        revenue_target = None
        customer_target = None
        sales_target = None

        if ds.semantics and ds.semantics.get("fields"):
            fields = ds.semantics["fields"]
            revenue_target = fields.get("revenue") or fields.get("currency") or fields.get("price") or fields.get("total")
            customer_target = fields.get("customer") or fields.get("user")
            sales_target = fields.get("quantity") or fields.get("units")

        if not revenue_target:
            revenue_target = next((c for c in num_cols if any(k in c.lower() for k in ["revenue", "price", "amount", "sales", "total"])), None)
        if not customer_target:
            customer_target = next((c for c in num_cols if any(k in c.lower() for k in ["customer", "user", "order", "count", "client"])), None)
        if not sales_target:
            sales_target = next((c for c in num_cols if any(k in c.lower() for k in ["quantity", "qty", "unit", "item", "volume"])), None)

        objectives = {
            "revenue": {
                "label": "Revenue Forecasting",
                "target_column": revenue_target or (num_cols[0] if num_cols else None),
                "description": "Predict gross monetary turnover and future cash flow trajectories.",
                "available": bool(revenue_target),
            },
            "customers": {
                "label": "Customer Activity Forecasting",
                "target_column": customer_target or (num_cols[0] if num_cols else None),
                "description": "Predict distinct customer counts and user activity.",
                "available": bool(customer_target),
            },
            "product_sales": {
                "label": "Product Sales & Unit Demand",
                "target_column": sales_target or (num_cols[0] if num_cols else None),
                "description": "Predict units sold and inventory demand volume.",
                "available": bool(sales_target),
            },
        }

    default_date = ds.semantics.get("fields", {}).get("date") if ds.semantics else None
    if not default_date and date_cols:
        default_date = date_cols[0]

    default_target = ds.semantics.get("fields", {}).get("revenue") if ds.semantics else None
    if not default_target and ds.semantics:
        default_target = ds.semantics.get("fields", {}).get("currency") or ds.semantics.get("fields", {}).get("price") or ds.semantics.get("fields", {}).get("quantity")
    if not default_target and num_cols:
        default_target = num_cols[0]

    compatible = bool(date_cols and num_cols)
    reason = None if compatible else "Dataset must have at least one confirmed date column and one numeric measure column."

    return {
        "dataset_id": ds.id,
        "dataset_name": ds.name,
        "date_columns": date_cols,
        "target_columns": num_cols,
        "default_date_column": default_date,
        "default_target_column": default_target,
        "objectives": objectives,
        "compatible": compatible,
        "reason": reason,
    }


def dataset_forecast(db, target_column: str | None = None, date_column: str | None = None, periods: int = 30, grain: str = "day") -> dict:
    """Universal evidence-based time series forecasting for any compatible dataset.

    Features are time-aware and engineered without data leakage. Uses chronological
    train/validation splits, compares against a seasonal-naive baseline, and computes
    95% prediction intervals.
    """
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error

    ds = db.info.get("dataset")
    if not ds:
        raise ValueError("Dataset context is required for forecasting.")

    opts = forecast_options(db)
    if not opts["compatible"]:
        return {
            "status": "not_applicable",
            "compatible": False,
            "reason": opts["reason"],
            "dataset_id": ds.id,
            "dataset_name": ds.name,
        }

    date_col_name = date_column or opts["default_date_column"]
    target_col_name = target_column or opts["default_target_column"]

    if not date_col_name or not target_col_name:
        return {
            "status": "not_applicable",
            "compatible": False,
            "reason": "Could not determine valid date and target columns.",
            "dataset_id": ds.id,
            "dataset_name": ds.name,
        }

    # Extract historical time series
    if ds.adapter == "star_schema":
        from app.analytics import metrics
        from app.analytics.filters import Filters
        target_name = "orders" if target_col_name == "orders" else ("customers" if target_col_name == "customers" else "revenue")
        raw_points = metrics.time_series(db, Filters(), "day", limit=100_000)
        if not raw_points:
            return {"status": "not_applicable", "compatible": False, "reason": "No historical observations found."}
        df_records = []
        for p in raw_points:
            val = p.get(target_name)
            if val is None:
                val = p.get("orders") if target_name in ("orders", "customers") else p.get("revenue")
            df_records.append({"date": p["period"], "target": float(val or 0.0)})
        df = pd.DataFrame(df_records).dropna()
    else:
        from app.analytics.tabular import TabularSource
        source = TabularSource(db)
        if date_col_name not in source.by_name or target_col_name not in source.by_name:
            return {"status": "not_applicable", "compatible": False, "reason": "Selected columns do not exist in dataset."}
        d_expr = source.by_name[date_col_name]
        t_expr = source.by_name[target_col_name]
        from sqlalchemy import func
        rows = source.rows(
            source.statement(d_expr.label("period"), func.sum(t_expr).label("target"))
            .where(d_expr.is_not(None), t_expr.is_not(None))
            .group_by(d_expr)
            .order_by(d_expr)
        )
        if not rows:
            return {"status": "not_applicable", "compatible": False, "reason": "No historical observations found."}
        df = pd.DataFrame(rows).rename(columns={"period": "date"}).dropna()

    df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.sort_values("date").drop_duplicates("date").set_index("date")

    # Determine frequency mapping
    grain_str = str(grain).lower().strip()
    if grain_str in ("w", "week", "weekly"):
        target_freq = "W-MON"
    elif grain_str in ("m", "month", "monthly"):
        target_freq = "MS"
    else:
        target_freq = "D"

    df = df.resample(target_freq).sum().fillna(0.0)

    min_obs = 6 if target_freq in ("W-MON", "MS") else 14
    if len(df) < min_obs:
        return {
            "status": "not_applicable",
            "compatible": False,
            "reason": f"Insufficient historical continuity ({len(df)} {grain} observations found; minimum {min_obs} required).",
            "dataset_id": ds.id,
            "dataset_name": ds.name,
        }

    # Feature engineering (strictly lag-based to prevent lookahead leakage)
    target_series = df["target"].astype(float)
    features_df = pd.DataFrame(index=df.index)

    if target_freq == "W-MON":
        features_df["lag1"] = target_series.shift(1)
        features_df["lag2"] = target_series.shift(2)
        features_df["lag4"] = target_series.shift(4)
        features_df["roll_mean4"] = target_series.shift(1).rolling(4).mean()
        features_df["month"] = features_df.index.month
    elif target_freq == "MS":
        features_df["lag1"] = target_series.shift(1)
        features_df["lag2"] = target_series.shift(2)
        features_df["lag3"] = target_series.shift(3)
        features_df["roll_mean3"] = target_series.shift(1).rolling(3).mean()
        features_df["month"] = features_df.index.month
    else:
        features_df["lag1"] = target_series.shift(1)
        features_df["lag7"] = target_series.shift(7)
        features_df["lag14"] = target_series.shift(14)
        features_df["roll_mean7"] = target_series.shift(1).rolling(7).mean()
        features_df["day_of_week"] = features_df.index.dayofweek
        features_df["day_of_month"] = features_df.index.day
        features_df["month"] = features_df.index.month

    # Drop warm-up rows
    clean_idx = features_df.dropna().index
    X = features_df.loc[clean_idx]
    y = target_series.loc[clean_idx]

    min_clean = 3 if target_freq in ("W-MON", "MS") else 7
    if len(X) < min_clean:
        return {
            "status": "not_applicable",
            "compatible": False,
            "reason": "Insufficient observations after lag feature construction.",
            "dataset_id": ds.id,
            "dataset_name": ds.name,
        }

    # Chronological split
    val_size = max(2 if target_freq in ("W-MON", "MS") else 7, int(len(X) * 0.2))
    split_idx = len(X) - val_size
    if split_idx < min_clean:
        split_idx = len(X) // 2

    X_train, y_train = X.iloc[:split_idx], y.iloc[:split_idx]
    X_val, y_val = X.iloc[split_idx:], y.iloc[split_idx:]

    # Baseline: seasonal-naive or recent lag
    if "lag7" in X_val.columns:
        y_baseline = X_val["lag7"].fillna(X_val["lag1"]).values
    elif "lag4" in X_val.columns:
        y_baseline = X_val["lag4"].fillna(X_val["lag1"]).values
    else:
        y_baseline = X_val["lag1"].values

    base_mae = float(mean_absolute_error(y_val, y_baseline))
    base_rmse = float(np.sqrt(mean_squared_error(y_val, y_baseline)))

    # Candidate Model: GradientBoostingRegressor
    model = GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.08, random_state=42)
    model.fit(X_train, y_train)

    y_val_pred = model.predict(X_val)
    val_mae = float(mean_absolute_error(y_val, y_val_pred))
    val_rmse = float(np.sqrt(mean_squared_error(y_val, y_val_pred)))

    # Compute MAPE on non-zero observations
    non_zero = y_val > 0
    if non_zero.any():
        val_mape = float(np.mean(np.abs((y_val[non_zero] - y_val_pred[non_zero]) / y_val[non_zero])) * 100)
    else:
        val_mape = 0.0

    residuals = y_val.values - y_val_pred
    std_resid = float(np.std(residuals)) if len(residuals) > 1 else float(np.std(y_train))

    # Refit model on the entire dataset for final future forecasting
    model_full = GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.08, random_state=42)
    model_full.fit(X, y)

    # Recursive future forecast
    history_vals = list(target_series.values)
    forecast_points = []
    periods_clamped = min(90, max(1, periods))
    last_date = df.index.max()

    for step in range(periods_clamped):
        if target_freq == "D":
            future_day = last_date + pd.Timedelta(days=step + 1)
        elif target_freq == "W-MON":
            future_day = last_date + pd.Timedelta(weeks=step + 1)
        else: # MS
            future_day = last_date + pd.DateOffset(months=step + 1)

        win = np.array(history_vals, dtype=float)

        if target_freq == "W-MON":
            feats = {
                "lag1": win[-1],
                "lag2": win[-2] if len(win) >= 2 else win[-1],
                "lag4": win[-4] if len(win) >= 4 else win[-1],
                "roll_mean4": float(np.mean(win[-4:])) if len(win) >= 4 else win[-1],
                "month": future_day.month,
            }
        elif target_freq == "MS":
            feats = {
                "lag1": win[-1],
                "lag2": win[-2] if len(win) >= 2 else win[-1],
                "lag3": win[-3] if len(win) >= 3 else win[-1],
                "roll_mean3": float(np.mean(win[-3:])) if len(win) >= 3 else win[-1],
                "month": future_day.month,
            }
        else:
            feats = {
                "lag1": win[-1],
                "lag7": win[-7] if len(win) >= 7 else win[-1],
                "lag14": win[-14] if len(win) >= 14 else win[-1],
                "roll_mean7": float(np.mean(win[-7:])) if len(win) >= 7 else win[-1],
                "day_of_week": future_day.dayofweek,
                "day_of_month": future_day.day,
                "month": future_day.month,
            }

        row = pd.DataFrame([feats], columns=X.columns)
        yhat = max(0.0, float(model_full.predict(row)[0]))
        history_vals.append(yhat)

        # 95% Confidence interval
        lower = max(0.0, yhat - 1.96 * std_resid)
        upper = yhat + 1.96 * std_resid

        forecast_points.append({
            "date": future_day.strftime("%Y-%m-%d"),
            "forecast": round(yhat, 2),
            "lower_bound": round(lower, 2),
            "upper_bound": round(upper, 2),
        })

    # Historical sample for charting (tail 60 periods)
    hist_tail = [
        {"date": d.strftime("%Y-%m-%d"), "actual": round(float(v), 2)}
        for d, v in zip(df.index[-60:], target_series.values[-60:])
    ]

    # Validation comparison records
    val_records = [
        {"date": d.strftime("%Y-%m-%d"), "actual": round(float(act), 2), "predicted": round(float(pred), 2)}
        for d, act, pred in zip(X_val.index, y_val, y_val_pred)
    ]

    return {
        "status": "available",
        "compatible": True,
        "dataset_id": ds.id,
        "dataset_name": ds.name,
        "target_column": target_col_name,
        "date_column": date_col_name,
        "grain": grain,
        "periods": periods_clamped,
        "historical": hist_tail,
        "validation": val_records,
        "forecast": forecast_points,
        "metrics": {
            "mae": round(val_mae, 2),
            "rmse": round(val_rmse, 2),
            "mape": round(val_mape, 1),
            "baseline_mae": round(base_mae, 2),
            "baseline_rmse": round(base_rmse, 2),
            "total_forecast": round(sum(p["forecast"] for p in forecast_points), 2),
            "avg_forecast": round(float(np.mean([p["forecast"] for p in forecast_points])), 2),
        },
        "model_info": {
            "name": "Time-Aware Autoregressive Gradient Regressor",
            "features": list(X.columns),
            "total_observations": len(df),
            "train_samples": len(X_train),
            "val_samples": len(X_val),
            "split_date": X_val.index[0].strftime("%Y-%m-%d") if len(X_val) else None,
        },
    }

