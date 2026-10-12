"""Multi-dataset analysis workspace and cross-dataset analytical engine.

Supports:
- Analysis session lifecycle (create, list, get, update, delete, add/remove datasets)
- Mode A: Independent comparison without merging records (safe across disparate schemas)
- Mode B: Compatibility checking, previewing, and execution of validated unions and joins
- Mode C: Cross-dataset pattern and trend insights grounded in actual data
"""
from __future__ import annotations

import io
import json
import math
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.models.dataset import AnalysisSession, Dataset
from app.services import datasets as ds_service


def resolve_datasets(db: Session, user: dict, dataset_ids: list[str]) -> list[Dataset]:
    """Validate that all dataset IDs exist, are accessible to the user, and are READY."""
    ds_service.ensure_registry(db)
    if not dataset_ids:
        raise HTTPException(422, "At least two datasets must be selected for multi-dataset analysis.")

    unique_ids = list(dict.fromkeys(dataset_ids))
    if len(unique_ids) < 2:
        raise HTTPException(422, "Multi-dataset analysis requires at least two distinct datasets.")

    stmt = select(Dataset).where(Dataset.id.in_(unique_ids))
    datasets = db.scalars(stmt).all()
    found_map = {d.id: d for d in datasets}

    missing = [did for did in unique_ids if did not in found_map]
    if missing:
        raise HTTPException(404, f"Dataset(s) not found: {', '.join(missing)}")

    username = user.get("username")
    role = user.get("role")
    for d in datasets:
        if d.owner is not None and d.owner != username and role != "admin":
            raise HTTPException(403, f"Access denied to dataset: {d.name} ({d.id})")
        if d.status != "READY":
            raise HTTPException(422, f"Dataset '{d.name}' ({d.id}) is not ready for analysis (status: {d.status}).")

    # Return in requested order
    return [found_map[did] for did in unique_ids]


def load_dataset_dataframe(db: Session, ds: Dataset, limit: int | None = None) -> pd.DataFrame:
    """Load records for a dataset into a pandas DataFrame safely."""
    if ds.id == ds_service.REFERENCE_ID:
        query = "SELECT * FROM fact_orders"
        if limit:
            query += f" LIMIT {limit}"
        return pd.read_sql_query(text(query), db.connection())

    table_name = f"dataset_{ds.id.replace('-', '')}"
    bind = db.get_bind()
    if table_name not in inspect(bind).get_table_names():
        return pd.DataFrame()

    columns = ds.profile.get("columns", [])
    col_map = {c["storage"]: c["name"] for c in columns}
    query = f'SELECT * FROM "{table_name}"'
    if limit:
        query += f" LIMIT {limit}"
    df = pd.read_sql_query(text(query), db.connection())
    if "row_id" in df.columns:
        df = df.drop(columns=["row_id"])
    df = df.rename(columns=col_map)
    return df


# -------------------------------------------------------------------------
# Session Management
# -------------------------------------------------------------------------

def session_public(session: AnalysisSession, db: Session | None = None) -> dict[str, Any]:
    dataset_details = []
    if db and session.dataset_ids:
        datasets = db.scalars(select(Dataset).where(Dataset.id.in_(session.dataset_ids))).all()
        d_map = {d.id: ds_service.public(d) for d in datasets}
        dataset_details = [d_map[did] for did in session.dataset_ids if did in d_map]

    return {
        "id": session.id,
        "name": session.name,
        "owner": session.owner,
        "mode": session.mode,
        "dataset_ids": session.dataset_ids or [],
        "datasets": dataset_details,
        "config": session.config or {},
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


def create_session(db: Session, user: dict, name: str, dataset_ids: list[str], mode: str = "compare", config: dict | None = None) -> dict[str, Any]:
    ds_service.ensure_registry(db)
    clean_name = name.strip() if name else "New Analysis"
    if not clean_name:
        clean_name = "New Analysis"

    # Validate dataset IDs if provided
    valid_ids = []
    if dataset_ids:
        # Check they exist and user has access
        datasets = resolve_datasets(db, user, dataset_ids)
        valid_ids = [d.id for d in datasets]

    session = AnalysisSession(
        id=str(uuid.uuid4()),
        name=clean_name,
        owner=user["username"],
        mode=mode if mode in {"compare", "combine", "insights"} else "compare",
        dataset_ids=valid_ids,
        config=config or {},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    return session_public(session, db)


def list_sessions(db: Session, user: dict) -> list[dict[str, Any]]:
    ds_service.ensure_registry(db)
    stmt = select(AnalysisSession).where(AnalysisSession.owner == user["username"]).order_by(AnalysisSession.updated_at.desc())
    sessions = db.scalars(stmt).all()
    return [session_public(s, db) for s in sessions]


def get_session(db: Session, user: dict, session_id: str) -> dict[str, Any]:
    ds_service.ensure_registry(db)
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(404, "Analysis session not found.")
    if session.owner != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Access denied to this analysis session.")
    return session_public(session, db)


def update_session(db: Session, user: dict, session_id: str, name: str | None = None,
                   dataset_ids: list[str] | None = None, mode: str | None = None,
                   config: dict | None = None) -> dict[str, Any]:
    ds_service.ensure_registry(db)
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(404, "Analysis session not found.")
    if session.owner != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Access denied to this analysis session.")

    if name is not None and name.strip():
        session.name = name.strip()
    if mode is not None and mode in {"compare", "combine", "insights"}:
        session.mode = mode
    if dataset_ids is not None:
        if dataset_ids:
            datasets = resolve_datasets(db, user, dataset_ids)
            session.dataset_ids = [d.id for d in datasets]
        else:
            session.dataset_ids = []
    if config is not None:
        session.config = config

    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    return session_public(session, db)


def add_datasets_to_session(db: Session, user: dict, session_id: str, dataset_ids: list[str]) -> dict[str, Any]:
    ds_service.ensure_registry(db)
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(404, "Analysis session not found.")
    if session.owner != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Access denied to this analysis session.")

    existing_ids = list(session.dataset_ids or [])
    new_ids = [did for did in dataset_ids if did not in existing_ids]
    if new_ids:
        # Validate newly added datasets
        all_candidate_ids = existing_ids + new_ids
        datasets = resolve_datasets(db, user, all_candidate_ids)
        session.dataset_ids = [d.id for d in datasets]
        session.updated_at = datetime.now(timezone.utc)
        db.commit()

    return session_public(session, db)


def remove_dataset_from_session(db: Session, user: dict, session_id: str, dataset_id: str) -> dict[str, Any]:
    """Remove a dataset from an ongoing analysis session WITHOUT deleting the underlying dataset."""
    ds_service.ensure_registry(db)
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(404, "Analysis session not found.")
    if session.owner != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Access denied to this analysis session.")

    current_ids = list(session.dataset_ids or [])
    if dataset_id in current_ids:
        current_ids.remove(dataset_id)
        session.dataset_ids = current_ids
        session.updated_at = datetime.now(timezone.utc)
        db.commit()

    return session_public(session, db)


def delete_session(db: Session, user: dict, session_id: str) -> dict[str, Any]:
    """Delete an analysis session without touching source datasets."""
    ds_service.ensure_registry(db)
    session = db.get(AnalysisSession, session_id)
    if not session:
        raise HTTPException(404, "Analysis session not found.")
    if session.owner != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Access denied to this analysis session.")

    db.delete(session)
    db.commit()
    return {"message": "Analysis session deleted successfully.", "session_id": session_id}


# -------------------------------------------------------------------------
# MODE A: Independent Comparison
# -------------------------------------------------------------------------

def compare_datasets_independently(db: Session, user: dict, dataset_ids: list[str]) -> dict[str, Any]:
    """Mode A: Compare datasets side-by-side without merging records."""
    datasets = resolve_datasets(db, user, dataset_ids)

    dataset_summaries = []
    comparison_table = []

    for ds in datasets:
        df = load_dataset_dataframe(db, ds)
        columns = ds.profile.get("columns", [])
        semantics = ds.semantics or {}
        fields = semantics.get("fields", {})

        date_col_name = fields.get("date")
        revenue_col_name = fields.get("revenue") or fields.get("currency")
        order_col_name = fields.get("order")

        # Date range analysis
        date_min, date_max = None, None
        has_date = False
        if date_col_name and date_col_name in df.columns:
            has_date = True
            date_series = pd.to_datetime(df[date_col_name], errors="coerce")
            valid_dates = date_series.dropna()
            if not valid_dates.empty:
                date_min = valid_dates.min().strftime("%Y-%m-%d")
                date_max = valid_dates.max().strftime("%Y-%m-%d")

        # Revenue metrics
        total_revenue = None
        avg_revenue = None
        revenue_available = False
        if revenue_col_name and revenue_col_name in df.columns:
            rev_numeric = pd.to_numeric(df[revenue_col_name], errors="coerce").dropna()
            if not rev_numeric.empty:
                revenue_available = True
                total_revenue = round(float(rev_numeric.sum()), 2)
                avg_revenue = round(float(rev_numeric.mean()), 2)

        # Order metrics
        total_orders = None
        orders_available = False
        if order_col_name and order_col_name in df.columns:
            orders_available = True
            total_orders = int(df[order_col_name].nunique())

        # Missing values
        missing_count = int(df.isna().sum().sum())
        total_cells = max(1, len(df) * max(1, len(df.columns)))
        missing_pct = round(float(missing_count / total_cells * 100), 2)

        # Numeric column summaries
        numeric_summaries = {}
        for c in columns:
            if c.get("dtype") == "numeric" and c["name"] in df.columns:
                nums = pd.to_numeric(df[c["name"]], errors="coerce").dropna()
                if not nums.empty:
                    numeric_summaries[c["name"]] = {
                        "min": round(float(nums.min()), 2),
                        "max": round(float(nums.max()), 2),
                        "mean": round(float(nums.mean()), 2),
                        "median": round(float(nums.median()), 2),
                    }

        # Categorical top values
        categorical_summaries = {}
        for c in columns:
            if c.get("role") in {"category", "location", "status"} and c["name"] in df.columns:
                top_vals = df[c["name"]].value_counts().head(5).to_dict()
                categorical_summaries[c["name"]] = {
                    "cardinality": int(df[c["name"]].nunique()),
                    "top_values": {str(k): int(v) for k, v in top_vals.items()},
                }

        summary = {
            "dataset_id": ds.id,
            "dataset_name": ds.name,
            "source_type": ds.source_type,
            "row_count": len(df),
            "column_count": len(df.columns),
            "missing_values": missing_count,
            "missing_percentage": missing_pct,
            "date_range": {"min": date_min, "max": date_max, "has_date": has_date},
            "revenue": {
                "available": revenue_available,
                "field": revenue_col_name,
                "total": total_revenue,
                "average": avg_revenue,
                "currency": semantics.get("currency_code"),
            },
            "orders": {
                "available": orders_available,
                "field": order_col_name,
                "total": total_orders,
            },
            "numeric_summaries": numeric_summaries,
            "categorical_summaries": categorical_summaries,
            "columns": [
                {"name": c["name"], "dtype": c.get("dtype"), "role": c.get("role")}
                for c in columns
            ],
        }
        dataset_summaries.append(summary)

        comparison_table.append({
            "dataset_name": ds.name,
            "dataset_id": ds.id,
            "rows": len(df),
            "columns": len(df.columns),
            "date_coverage": f"{date_min} to {date_max}" if has_date and date_min else "No date column",
            "total_revenue": f"{total_revenue:,.2f} ({semantics.get('currency_code') or 'Unit'})" if revenue_available and total_revenue is not None else "N/A",
            "total_orders": f"{total_orders:,}" if orders_available and total_orders is not None else "N/A",
            "missing_pct": f"{missing_pct}%",
        })

    # Side-by-side KPI cards
    kpi_cards = [
        {
            "title": "Total Records Compared",
            "values": {s["dataset_name"]: f"{s['row_count']:,} rows" for s in dataset_summaries},
        },
        {
            "title": "Data Quality (Missing Cells)",
            "values": {s["dataset_name"]: f"{s['missing_percentage']}% missing" for s in dataset_summaries},
        },
        {
            "title": "Date Span",
            "values": {
                s["dataset_name"]: f"{s['date_range']['min']} to {s['date_range']['max']}"
                if s['date_range']['has_date'] and s['date_range']['min'] else "No dates"
                for s in dataset_summaries
            },
        },
        {
            "title": "Revenue / Monetary Scale",
            "values": {
                s["dataset_name"]: f"{s['revenue']['total']:,.2f} {s['revenue']['currency'] or ''}".strip()
                if s["revenue"]["available"] and s["revenue"]["total"] is not None else "Not applicable"
                for s in dataset_summaries
            },
        },
    ]

    return {
        "mode": "compare",
        "dataset_count": len(datasets),
        "summaries": dataset_summaries,
        "comparison_table": comparison_table,
        "kpi_cards": kpi_cards,
        "disclaimers": [
            "Metrics are computed independently per dataset without merging records.",
            "Revenue figures are never summed across datasets with different schemas or currencies.",
        ],
    }


# -------------------------------------------------------------------------
# MODE B: Combine Compatible Data (Union / Join)
# -------------------------------------------------------------------------

def check_combine_compatibility(db: Session, user: dict, dataset_ids: list[str]) -> dict[str, Any]:
    """Assess compatibility for Union and Join operations across selected datasets."""
    datasets = resolve_datasets(db, user, dataset_ids)
    if len(datasets) != 2:
        # We focus combine on 2 datasets at a time for high precision and grain safety
        pass

    ds_left = datasets[0]
    ds_right = datasets[1]

    cols_left = {c["name"]: c for c in ds_left.profile.get("columns", [])}
    cols_right = {c["name"]: c for c in ds_right.profile.get("columns", [])}

    left_names = set(cols_left.keys())
    right_names = set(cols_right.keys())

    common_columns = sorted(list(left_names & right_names))
    left_only = sorted(list(left_names - right_names))
    right_only = sorted(list(right_names - left_names))

    # Check Union Compatibility
    type_mismatches = []
    for col in common_columns:
        t_l = cols_left[col].get("dtype")
        t_r = cols_right[col].get("dtype")
        if t_l != t_r:
            type_mismatches.append({"column": col, "left_type": t_l, "right_type": t_r})

    union_compatible = len(common_columns) > 0 and len(type_mismatches) == 0
    union_quality_score = round(len(common_columns) / max(1, len(left_names | right_names)) * 100, 1)

    # Check Join Compatibility (candidate keys: identifiers or matching column names)
    df_left = load_dataset_dataframe(db, ds_left, limit=5000)
    df_right = load_dataset_dataframe(db, ds_right, limit=5000)

    candidate_join_keys = []
    for col in common_columns:
        role_l = cols_left[col].get("role")
        role_r = cols_right[col].get("role")

        left_unique = False
        right_unique = False
        left_nulls = 0
        right_nulls = 0

        if col in df_left.columns:
            left_unique = bool(df_left[col].nunique() == len(df_left))
            left_nulls = int(df_left[col].isna().sum())

        if col in df_right.columns:
            right_unique = bool(df_right[col].nunique() == len(df_right))
            right_nulls = int(df_right[col].isna().sum())

        # Determine grain relationship
        if left_unique and right_unique:
            grain = "1:1"
            risk = "Low"
            warning = None
        elif left_unique and not right_unique:
            grain = "1:N"
            risk = "Low"
            warning = f"Each row in '{ds_left.name}' may match multiple rows in '{ds_right.name}'."
        elif not left_unique and right_unique:
            grain = "N:1"
            risk = "Low"
            warning = f"Each row in '{ds_right.name}' may match multiple rows in '{ds_left.name}'."
        else:
            grain = "N:M (Many-to-Many)"
            risk = "High"
            warning = "Duplicate keys exist on both sides. A join may cause significant row multiplication!"

        candidate_join_keys.append({
            "key": col,
            "left_dtype": cols_left[col].get("dtype"),
            "right_dtype": cols_right[col].get("dtype"),
            "left_unique": left_unique,
            "right_unique": right_unique,
            "left_nulls": left_nulls,
            "right_nulls": right_nulls,
            "relationship": grain,
            "risk": risk,
            "warning": warning,
        })

    return {
        "datasets": [
            {"id": ds_left.id, "name": ds_left.name, "row_count": ds_left.row_count, "columns": list(left_names)},
            {"id": ds_right.id, "name": ds_right.name, "row_count": ds_right.row_count, "columns": list(right_names)},
        ],
        "union": {
            "compatible": union_compatible,
            "match_score_percent": union_quality_score,
            "common_columns": common_columns,
            "left_only_columns": left_only,
            "right_only_columns": right_only,
            "type_mismatches": type_mismatches,
            "expected_row_count": (ds_left.row_count or 0) + (ds_right.row_count or 0),
        },
        "join": {
            "has_candidates": len(candidate_join_keys) > 0,
            "candidate_keys": candidate_join_keys,
            "supported_join_types": ["inner", "left", "outer"],
        },
    }


def preview_combine(db: Session, user: dict, req: dict[str, Any]) -> dict[str, Any]:
    """Generate a 20-row preview of proposed Union or Join."""
    operation = req.get("operation", "union") # "union" or "join"
    dataset_ids = req.get("dataset_ids", [])
    datasets = resolve_datasets(db, user, dataset_ids)

    df_a = load_dataset_dataframe(db, datasets[0], limit=100)
    df_b = load_dataset_dataframe(db, datasets[1], limit=100)

    if operation == "union":
        columns_to_keep = req.get("columns") # optional list of specific columns
        if not columns_to_keep:
            common = sorted(list(set(df_a.columns) & set(df_b.columns)))
            columns_to_keep = common if common else sorted(list(set(df_a.columns) | set(df_b.columns)))

        df_a_sub = df_a.reindex(columns=columns_to_keep)
        df_b_sub = df_b.reindex(columns=columns_to_keep)
        combined = pd.concat([df_a_sub, df_b_sub], ignore_index=True)
        preview_rows = combined.head(20).replace({np.nan: None}).to_dict(orient="records")

        return {
            "operation": "union",
            "preview_rows": preview_rows,
            "columns": columns_to_keep,
            "total_preview_count": len(preview_rows),
            "estimated_total_rows": (datasets[0].row_count or 0) + (datasets[1].row_count or 0),
        }

    elif operation == "join":
        join_key = req.get("join_key")
        join_type = req.get("join_type", "inner")
        if not join_key:
            raise HTTPException(422, "A join key must be specified for a join operation.")
        if join_key not in df_a.columns or join_key not in df_b.columns:
            raise HTTPException(422, f"Join key '{join_key}' must exist in both datasets.")

        # Disambiguate overlapping columns
        suffix_a = f"_{datasets[0].name[:8]}"
        suffix_b = f"_{datasets[1].name[:8]}"
        merged = pd.merge(df_a, df_b, on=join_key, how=join_type, suffixes=(suffix_a, suffix_b))
        preview_rows = merged.head(20).replace({np.nan: None}).to_dict(orient="records")

        return {
            "operation": "join",
            "join_key": join_key,
            "join_type": join_type,
            "preview_rows": preview_rows,
            "columns": list(merged.columns),
            "total_preview_count": len(preview_rows),
            "lineage": {
                col: datasets[0].name if col.endswith(suffix_a) else datasets[1].name if col.endswith(suffix_b) else "Common Key"
                for col in merged.columns
            },
        }

    raise HTTPException(422, f"Unsupported combine operation: {operation}")


def execute_combine(db: Session, user: dict, req: dict[str, Any]) -> dict[str, Any]:
    """Execute a validated combine operation and register a new derived dataset."""
    operation = req.get("operation", "union")
    dataset_ids = req.get("dataset_ids", [])
    output_name = req.get("output_name")
    datasets = resolve_datasets(db, user, dataset_ids)

    df_a = load_dataset_dataframe(db, datasets[0])
    df_b = load_dataset_dataframe(db, datasets[1])

    if operation == "union":
        columns_to_keep = req.get("columns")
        if not columns_to_keep:
            common = sorted(list(set(df_a.columns) & set(df_b.columns)))
            columns_to_keep = common if common else sorted(list(set(df_a.columns) | set(df_b.columns)))

        df_a_sub = df_a.reindex(columns=columns_to_keep)
        df_b_sub = df_b.reindex(columns=columns_to_keep)
        combined = pd.concat([df_a_sub, df_b_sub], ignore_index=True)
        default_name = f"Union: {datasets[0].name} + {datasets[1].name}"
        provenance = {
            "source_type": "derived_union",
            "parent_datasets": [datasets[0].id, datasets[1].id],
            "parent_names": [datasets[0].name, datasets[1].name],
            "common_columns": columns_to_keep,
        }

    elif operation == "join":
        join_key = req.get("join_key")
        join_type = req.get("join_type", "inner")
        if not join_key:
            raise HTTPException(422, "A join key must be specified for join.")
        if join_key not in df_a.columns or join_key not in df_b.columns:
            raise HTTPException(422, f"Join key '{join_key}' missing from datasets.")

        suffix_a = f"_{datasets[0].name[:8]}"
        suffix_b = f"_{datasets[1].name[:8]}"
        combined = pd.merge(df_a, df_b, on=join_key, how=join_type, suffixes=(suffix_a, suffix_b))
        default_name = f"Join: {datasets[0].name} + {datasets[1].name}"
        provenance = {
            "source_type": "derived_join",
            "parent_datasets": [datasets[0].id, datasets[1].id],
            "parent_names": [datasets[0].name, datasets[1].name],
            "join_key": join_key,
            "join_type": join_type,
        }
    else:
        raise HTTPException(422, f"Unsupported combine operation: {operation}")

    # Serialize combined DataFrame to CSV in memory and ingest via standard pipeline
    csv_buffer = io.BytesIO()
    combined.to_csv(csv_buffer, index=False)
    csv_bytes = csv_buffer.getvalue()

    final_name = ds_service.unique_dataset_name(db, user["username"], output_name or default_name)
    ds = ds_service.ingest(db, user, final_name, csv_bytes, ".csv", provenance=provenance)
    return ds_service.public(ds)


# -------------------------------------------------------------------------
# MODE C: Cross-Dataset Insights
# -------------------------------------------------------------------------

def generate_cross_dataset_insights(db: Session, user: dict, dataset_ids: list[str]) -> dict[str, Any]:
    """Mode C: Generate grounded patterns, correlations, and comparative insights across datasets."""
    datasets = resolve_datasets(db, user, dataset_ids)
    insights = []

    # 1. Temporal Overlap & Trajectory Insight
    date_info = []
    for d in datasets:
        df = load_dataset_dataframe(db, d)
        date_col = d.semantics.get("fields", {}).get("date")
        if date_col and date_col in df.columns:
            dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
            if not dates.empty:
                date_info.append({
                    "dataset": d,
                    "df": df,
                    "date_col": date_col,
                    "min": dates.min(),
                    "max": dates.max(),
                })

    if len(date_info) >= 2:
        d1, d2 = date_info[0], date_info[1]
        overlap_start = max(d1["min"], d2["min"])
        overlap_end = min(d1["max"], d2["max"])

        if overlap_start <= overlap_end:
            overlap_days = (overlap_end - overlap_start).days + 1
            insights.append({
                "title": f"Temporal Overlap Alignment: {d1['dataset'].name} & {d2['dataset'].name}",
                "finding": f"Datasets share an active overlapping window of {overlap_days} days ({overlap_start.strftime('%Y-%m-%d')} to {overlap_end.strftime('%Y-%m-%d')}).",
                "magnitude": f"{overlap_days} days active overlap",
                "source_datasets": [d1["dataset"].name, d2["dataset"].name],
                "fields_used": [d1["date_col"], d2["date_col"]],
                "date_range": f"{overlap_start.strftime('%Y-%m-%d')} to {overlap_end.strftime('%Y-%m-%d')}",
                "method": "Interval intersection on confirmed datetime timestamps",
                "limitations": "Analysis strictly reflects records within the shared time boundary.",
            })
        else:
            gap_days = (max(d1["min"], d2["min"]) - min(d1["max"], d2["max"])).days
            insights.append({
                "title": f"Sequential / Disjoint Time Horizons: {d1['dataset'].name} & {d2['dataset'].name}",
                "finding": f"Datasets do not overlap chronologically. '{d1['dataset'].name}' spans {d1['min'].strftime('%Y-%m-%d')} to {d1['max'].strftime('%Y-%m-%d')}, while '{d2['dataset'].name}' spans {d2['min'].strftime('%Y-%m-%d')} to {d2['max'].strftime('%Y-%m-%d')} (gap of {gap_days} days).",
                "magnitude": f"{gap_days} days chronological separation",
                "source_datasets": [d1["dataset"].name, d2["dataset"].name],
                "fields_used": [d1["date_col"], d2["date_col"]],
                "date_range": f"{min(d1['min'], d2['min']).strftime('%Y-%m-%d')} to {max(d1['max'], d2['max']).strftime('%Y-%m-%d')}",
                "method": "Chronological boundary comparison",
                "limitations": "Direct day-by-day record correlation cannot be performed due to non-overlapping dates.",
            })

    # 2. Forecast vs Historical Baseline Analysis
    # If one dataset has 'forecast' in its name/columns and another has actual sales/revenue
    forecast_ds = next((d for d in datasets if "forecast" in d.name.lower()), None)
    actual_ds = next((d for d in datasets if d != forecast_ds and (d.semantics.get("fields", {}).get("revenue") or d.name.lower() == "olist")), None)

    if forecast_ds and actual_ds:
        df_fc = load_dataset_dataframe(db, forecast_ds)
        df_act = load_dataset_dataframe(db, actual_ds)

        fc_cols = forecast_ds.profile.get("columns", [])
        num_fc_cols = [c["name"] for c in fc_cols if c.get("dtype") == "numeric"]

        if num_fc_cols:
            mean_fc = float(pd.to_numeric(df_fc[num_fc_cols[0]], errors="coerce").mean())
            act_rev_field = actual_ds.semantics.get("fields", {}).get("revenue") or "item_revenue"
            if act_rev_field in df_act.columns:
                mean_act = float(pd.to_numeric(df_act[act_rev_field], errors="coerce").mean())
                diff_pct = round(((mean_fc - mean_act) / max(0.01, mean_act)) * 100, 1)
                direction = "higher" if diff_pct > 0 else "lower"

                insights.append({
                    "title": f"Forecast Variance vs Baseline: {forecast_ds.name}",
                    "finding": f"Projected average metric in '{forecast_ds.name}' ({mean_fc:,.2f}) is {abs(diff_pct)}% {direction} than baseline historical transactions in '{actual_ds.name}' ({mean_act:,.2f}).",
                    "magnitude": f"{diff_pct:+0.1f}% baseline delta",
                    "source_datasets": [forecast_ds.name, actual_ds.name],
                    "fields_used": [num_fc_cols[0], act_rev_field],
                    "date_range": "Forecast horizon vs Historical baseline",
                    "method": "Mean expectation variance against historical observation baseline",
                    "limitations": "Forecast assumes stationarity and no extreme supply shock.",
                })

    # 3. Numeric Correlation between compatible metrics
    dfs = {d.id: load_dataset_dataframe(db, d) for d in datasets}
    if len(datasets) >= 2:
        d_a, d_b = datasets[0], datasets[1]
        df_a, df_b = dfs[d_a.id], dfs[d_b.id]

        nums_a = [c["name"] for c in d_a.profile.get("columns", []) if c.get("dtype") == "numeric"]
        nums_b = [c["name"] for c in d_b.profile.get("columns", []) if c.get("dtype") == "numeric"]

        # Check if they have matching length or can be correlated by index or date
        date_a = d_a.semantics.get("fields", {}).get("date")
        date_b = d_b.semantics.get("fields", {}).get("date")

        if date_a in df_a.columns and date_b in df_b.columns and nums_a and nums_b:
            ts_a = df_a.copy()
            ts_a["_dt"] = pd.to_datetime(ts_a[date_a], errors="coerce").dt.to_period("M")
            agg_a = ts_a.groupby("_dt")[nums_a[0]].mean()

            ts_b = df_b.copy()
            ts_b["_dt"] = pd.to_datetime(ts_b[date_b], errors="coerce").dt.to_period("M")
            agg_b = ts_b.groupby("_dt")[nums_b[0]].mean()

            aligned = pd.concat([agg_a, agg_b], axis=1, join="inner").dropna()
            if len(aligned) >= 3:
                r = float(aligned.iloc[:, 0].corr(aligned.iloc[:, 1]))
                if math.isfinite(r):
                    strength = "Strong" if abs(r) > 0.7 else "Moderate" if abs(r) > 0.4 else "Weak"
                    direction = "Positive" if r > 0 else "Negative"
                    insights.append({
                        "title": f"Monthly Trajectory Correlation: {nums_a[0]} vs {nums_b[0]}",
                        "finding": f"Monthly aggregated averages exhibit a {strength.lower()} {direction.lower()} Pearson correlation (r = {r:0.2f}) across {len(aligned)} common monthly periods.",
                        "magnitude": f"r = {r:0.2f} ({strength} {direction})",
                        "source_datasets": [d_a.name, d_b.name],
                        "fields_used": [nums_a[0], nums_b[0]],
                        "date_range": f"{aligned.index.min()} to {aligned.index.max()}",
                        "method": "Monthly resampled Pearson correlation coefficient",
                        "limitations": "Correlation measures linear association and does not establish causality.",
                    })

    # 4. Entity and Key Intersection Insight
    if len(datasets) >= 2:
        d_a, d_b = datasets[0], datasets[1]
        df_a, df_b = dfs[d_a.id], dfs[d_b.id]

        common_keys = [c["name"] for c in d_a.profile.get("columns", []) if c["name"] in df_b.columns and c.get("role") in {"customer", "order", "product", "category", "location", "identifier"}]
        for k in common_keys[:2]:
            set_a = set(df_a[k].dropna().astype(str))
            set_b = set(df_b[k].dropna().astype(str))
            intersection = set_a & set_b
            if set_a and set_b:
                overlap_pct_a = round(len(intersection) / len(set_a) * 100, 1)
                overlap_pct_b = round(len(intersection) / len(set_b) * 100, 1)
                jaccard = round(len(intersection) / len(set_a | set_b) * 100, 1)

                insights.append({
                    "title": f"Entity Overlap on '{k}': {d_a.name} & {d_b.name}",
                    "finding": f"Datasets share {len(intersection):,} common '{k}' values ({overlap_pct_a}% of {d_a.name}, {overlap_pct_b}% of {d_b.name}, Jaccard similarity: {jaccard}%).",
                    "magnitude": f"{jaccard}% common entity index",
                    "source_datasets": [d_a.name, d_b.name],
                    "fields_used": [k],
                    "date_range": "Entire dataset extent",
                    "method": "Discrete set intersection and Jaccard similarity index",
                    "limitations": "Entity values matched strictly as normalized text keys.",
                })

    if not insights:
        insights.append({
            "title": "Independent Dataset Coexistence",
            "finding": f"Selected datasets ({', '.join(d.name for d in datasets)}) have independent schemas and non-overlapping keys. They can be compared side-by-side in Mode A.",
            "magnitude": "Independent Schemas",
            "source_datasets": [d.name for d in datasets],
            "fields_used": ["N/A"],
            "date_range": "Dataset lifecycles",
            "method": "Multi-dataset schema & key discrepancy analysis",
            "limitations": "No shared identifier or datetime overlap detected between selected records.",
        })

    return {
        "mode": "insights",
        "dataset_count": len(datasets),
        "insights_count": len(insights),
        "insights": insights,
    }
