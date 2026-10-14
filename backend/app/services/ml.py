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
        runtime = {}
        for key in present:
            try:
                asset = _load_artifact(key)
                expected = 'pipeline' if key == 'sales_prediction' else 'model'
                if not isinstance(asset, dict) or not hasattr(asset.get(expected), 'predict') or not asset.get('features'):
                    raise ValueError('Invalid serving bundle.')
                if asset['features'] != metas[key].get('features_schema'):
                    raise ValueError('Artifact feature order does not match its registered schema.')
                if key in {'customer_segmentation','product_segmentation'} and not hasattr(asset.get('scaler'),'transform'):
                    raise ValueError('Required trained preprocessing scaler is missing.')
                runtime[key] = {'ready':True,'reason':None}
            except FileNotFoundError:
                runtime[key] = {'ready':False,'reason':'Trusted trained artifact is missing at the configured model directory.'}
            except Exception:
                runtime[key] = {'ready':False,'reason':'Artifact exists but its loader or serving contract failed. Check package versions and trusted artifact format.'}
        artifacts_ready = all(runtime[k]['ready'] for k in present)
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
                        "runtime_ready": runtime[k]['ready'],
                        "runtime_reason": runtime[k]['reason'],
                        "version": metas[k].get('version'),
                    }
                    for k in present
                ],
            }
        )
    return features


@lru_cache(maxsize=8)
def _load_artifact(name: str):
    import joblib
    import hashlib

    meta = load_all_metadata().get(name)
    if not meta or not meta.get("artifact"):
        raise FileNotFoundError(f"no artifact metadata for {name}")
    path = models_dir() / meta["artifact"]
    if Path(meta['artifact']).name != meta['artifact']:
        raise ValueError('Artifact must be a trusted model-directory filename.')
    if not path.exists():
        raise FileNotFoundError(f"artifact missing: {path}")
    expected_hash = meta.get("artifact_sha256")
    if expected_hash:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected_hash:
            raise ValueError(f"artifact integrity check failed for {name}")
    return joblib.load(path)


def forecast(periods: int = 30, target: str = "orders", db=None, f=None) -> dict:
    """Recursive daily forecast using lag/rolling features."""
    import numpy as np
    import pandas as pd

    if target not in {"orders", "revenue"} or not 1 <= periods <= 90:
        raise ValueError("Invalid forecast target or horizon.")
    if db is None:
        raise ValueError("Dataset context is required for inference.")
    from app.analytics import metrics
    from app.analytics.filters import Filters
    points = metrics.time_series(db, f or Filters(), "day", limit=100_000)
    if len(points) < 30:
        raise ValueError("Forecasting requires at least 30 daily observations.")
    series = pd.DataFrame(points).rename(columns={"period": "date"})
    series["date"] = pd.to_datetime(series["date"])
    series = series.sort_values("date")
    hist = series.set_index("date")[target].astype(float).copy()
    dates = hist.index[-30:]
    if hist.index.has_duplicates or not ((dates[1:] - dates[:-1]).days == 1).all():
        raise ValueError("Forecast history must contain consecutive daily observations.")
    if not np.isfinite(hist.to_numpy()).all():
        raise ValueError("Forecast history contains non-finite values.")
    bundle = _load_artifact(f"sales_forecast_{target}")
    model, feature_cols = bundle["model"], bundle["features"]
    expected_features = ["lag1", "lag7", "lag14", "lag30", "roll7", "roll30"]
    if feature_cols != expected_features or bundle.get("target", f"sales_forecast_{target}") != f"sales_forecast_{target}":
        raise ValueError("Forecast artifact feature or target contract does not match the inference service.")
    if model is None and bundle.get("algorithm") != "SeasonalNaive7":
        raise ValueError("Forecast artifact does not contain a usable estimator.")
    last_date = hist.index.max()
    values = list(hist.values)

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
        if model is None and bundle.get("algorithm") == "SeasonalNaive7":
            yhat = float(feats["lag7"])
        else:
            row = pd.DataFrame([[feats[c] for c in feature_cols]], columns=feature_cols)
            yhat = float(model.predict(row)[0])
        if not np.isfinite(yhat):
            raise ValueError("Model returned a non-finite prediction.")
        values.append(yhat)
        preds.append({"date": (last_date + pd.Timedelta(days=step + 1)).strftime("%Y-%m-%d"), target: round(yhat, 2)})
    return {"history_tail": [{"date": d.strftime("%Y-%m-%d"), target: float(v)} for d, v in list(hist.items())[-30:]],
            "forecast": preds, "model": bundle.get("algorithm", "LinearRegression (lag/rolling features)"),
            "model_version": "+".join(filter(None, [bundle.get("version", "0.1.0"), bundle.get("training_run_id")]))}


def forecast_evaluation(target: str) -> dict:
    """Return genuine one-day-ahead holdout rows from the training run."""
    import hashlib
    import numpy as np
    import pandas as pd

    if target not in {"orders", "revenue"}:
        raise ValueError("Invalid forecast target.")
    name = f"sales_forecast_{target}"
    meta = load_all_metadata().get(name)
    if not meta or not meta.get("evaluation"):
        raise FileNotFoundError("No reproducible holdout evaluation is registered for this target.")
    evaluation_name = Path(meta["evaluation"])
    if evaluation_name.name != str(meta["evaluation"]):
        raise ValueError("Evaluation report must be a file in the trusted reports directory.")
    reports = REPO_ROOT / "ml" / "reports"
    report_path = reports / evaluation_name.name
    if not report_path.is_file():
        raise FileNotFoundError("Registered holdout evaluation report is unavailable.")
    evaluation_digest = meta.get("evaluation_sha256")
    if evaluation_digest and hashlib.sha256(report_path.read_bytes()).hexdigest() != evaluation_digest:
        raise ValueError("Registered holdout evaluation failed its integrity check.")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("selected_candidate") != meta.get("algorithm"):
        raise ValueError("Holdout evaluation model does not match the registered production model.")
    prediction_name = Path(report.get("holdout_predictions_file", ""))
    if prediction_name.name != report.get("holdout_predictions_file"):
        raise ValueError("Prediction file must be in the trusted reports directory.")
    prediction_path = reports / prediction_name.name
    if not prediction_path.is_file():
        raise FileNotFoundError("Registered holdout predictions are unavailable.")
    predictions_digest = report.get("holdout_predictions_sha256") or meta.get("holdout_predictions_sha256")
    if predictions_digest and hashlib.sha256(prediction_path.read_bytes()).hexdigest() != predictions_digest:
        raise ValueError("Registered holdout predictions failed their integrity check.")
    frame = pd.read_csv(prediction_path)
    selected = report.get("selected_candidate")
    frame = frame[frame["model"] == selected].copy()
    if frame.empty or frame["date"].duplicated().any():
        raise ValueError("Selected-model holdout rows are empty or contain duplicate dates.")
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    values = frame[["actual", "predicted"]].to_numpy(dtype=float)
    if frame["date"].isna().any() or not np.isfinite(values).all():
        raise ValueError("Selected-model holdout contains invalid dates or values.")
    frame = frame.sort_values("date")
    records = [{"date": row.date.strftime("%Y-%m-%d"), "actual": float(row.actual),
                "predicted": float(row.predicted), "residual": float(row.actual - row.predicted)}
               for row in frame.itertuples(index=False)]
    return {
        "status": "available", "target": target, "model": selected,
        "model_version": "+".join(filter(None, [meta.get("version"), meta.get("training_run_id")])),
        "data_scope": "Unified Olist extended dataset; chronological held-out period. The source generation summary identifies the extension as synthetic/generated. Mixed-data evaluation does not establish real-world accuracy and is independent of active-upload accuracy.",
        "target_definition": report.get("target_definition"), "training_period": report.get("training_period"),
        "validation_period": report.get("validation_period"), "evaluation_period": report.get("holdout_period"),
        "forecast_horizon_days": 1, "n_evaluated": len(records), "metrics": report["holdout_metrics"][selected],
        "baseline_metrics": report["holdout_metrics"].get("SeasonalNaive7"),
        "candidate_metrics": report["holdout_metrics"], "validation_metrics": report["validation_metrics"],
        "validation_windows": report.get("validation_windows", []), "data_sha256": report.get("data_sha256"),
        "points": records,
    }


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
        if getattr(ds,'source_type',None) == 'bundle':
            from app.analytics.bundle import BundleSource
            source = BundleSource(db,f)
            customer=source.customer; order=source.oc['order_id']; date=source.oc['order_purchase_timestamp']; amount=source.amount
            rows=source.rows(source.statement(customer.label('customer'),func.max(date).label('last_purchase'),func.count(func.distinct(order)).label('frequency'),func.sum(amount).label('monetary')).where(customer.is_not(None),date.is_not(None),amount.is_not(None)).group_by(customer))
        elif ds.adapter == "tabular":
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
    if ds is not None and getattr(ds,'source_type',None) == 'bundle':
        from app.analytics.bundle import BundleSource
        from sqlalchemy import func
        source=BundleSource(db,f)
        ic,pc=source.ic,source.pc
        df=pd.DataFrame(source.rows(source.item_statement(ic['product_id'].label('product'),func.min(pc['product_category_name']).label('category'),func.count().label('total_qty'),func.sum(ic['price']).label('total_revenue'),func.avg(ic['price']).label('avg_price'),func.avg(pc['product_weight_g']).label('product_weight_g')).group_by(ic['product_id'])))
    elif ds is not None and ds.adapter == "tabular":
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
    if getattr(ds,'source_type',None) == 'bundle':
        from app.analytics.bundle import BundleSource
        source=BundleSource(db,f)
        roles={'date','order'}
        if source.amount is not None: roles.update({'revenue','price','quantity','product','seller'})
        if source.enabled('orders','customers'): roles.update({'customer','location'})
        if source.pc: roles.add('category')
        if 'product_weight_g' in source.pc and next(c['dtype'] for c in source.tables['products'][0].profile['columns'] if c['name']=='product_weight_g')=='numeric': roles.add('weight_g')
        for role in contract.get('required_semantics',[]):
            if role not in roles: reasons.append(f'Missing validated {role} relationship or field. Review bundle relationships or select a compatible table.')
        if contract.get('currency_code') and ds.semantics.get('currency_code')!=contract['currency_code']:
            reasons.append(f"This trained model requires confirmed {contract['currency_code']} monetary units. Confirm bundle currency in Dataset Manager.")
        if ds.semantics.get('domain') not in {'commerce','transactions'}:
            reasons.append('Confirm the commerce domain in Dataset Manager.')
        required=contract.get('required_semantics',[])
        checks=[('date','orders','order_purchase_timestamp'),('customer','customers','customer_unique_id'),('price','items','price'),('revenue','items','price'),('weight_g','products','product_weight_g')]
        for role,table,column in checks:
            if role in required and table in source.tables:
                profile=next((c for c in source.tables[table][0].profile['columns'] if c['name']==column),None)
                if profile and profile['missing'] and role!='weight_g': reasons.append(f'Required {role} contains missing values. Review table quality before inference.')
                if profile and profile.get('statistics',{}).get('min',0)<0: reasons.append(f'Required {role} contains negative values outside the trained contract.')
    elif ds.adapter == "tabular":
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
            else:
                dates = pd.to_datetime([p["period"] for p in points][-30:])
                if len(dates) > 1 and not ((dates[1:] - dates[:-1]).days == 1).all():
                    reasons.append("The latest 30 daily observations must be consecutive; missing days cannot be assumed to be zero.")
        else:
            if getattr(ds,'source_type',None) == 'bundle':
                from sqlalchemy import func
                n=db.scalar(__import__('sqlalchemy').select(func.count()).select_from(source.order_ids().subquery()))
            elif ds.adapter == "star_schema":
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
