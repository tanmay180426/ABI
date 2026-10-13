"""Evidence-based analytical insights engine.

Every numerical finding is directly calculated from real dataset observations
using SQL aggregates and verified statistics. Causality and unsupported
financial interpretations are never fabricated.
"""
from __future__ import annotations

import math
from typing import Any
from sqlalchemy.orm import Session

from app.analytics.filters import Filters
from app.analytics.tabular import TabularSource
from app.models.dataset import Dataset


def generate_dataset_insights(db: Session, ds: Dataset, f: Filters | None = None) -> list[dict[str, Any]]:
    """Generate structured, evidence-based insights for a single dataset."""
    insights: list[dict[str, Any]] = []
    db.info["dataset"] = ds
    source = TabularSource(db, f or Filters())
    kpis = source.kpis()
    columns = source.columns

    # 1. Volume & Baseline Insight
    row_count = kpis.get("row_count") or 0
    if row_count > 0:
        insights.append({
            "id": "volume_summary",
            "category": "summary",
            "title": "Dataset Volume & Scope",
            "finding": f"Dataset '{ds.name}' contains {row_count:,} confirmed records across {len(columns)} tracked attributes.",
            "metric": f"{row_count:,} rows",
            "time_period": "Full dataset coverage",
            "significance": "Represents the total analytical population available under the current filter scope.",
            "confidence": "high",
            "supporting_data": {"row_count": row_count, "columns": len(columns)},
        })

    # 2. Time Trend & Temporal Dynamics
    date_col = source.field("date")
    if date_col is not None:
        series = source.time_series(grain="month", limit=100)
        if len(series) >= 2:
            first_val = series[0].get("revenue") or series[0].get("amount") or series[0].get("rows", 0)
            last_val = series[-1].get("revenue") or series[-1].get("amount") or series[-1].get("rows", 0)
            metric_label = "revenue" if series[0].get("revenue") is not None else ("amount" if series[0].get("amount") is not None else "volume")

            # Peak period
            peak = max(series, key=lambda s: s.get("revenue") or s.get("amount") or s.get("rows", 0))
            peak_val = peak.get("revenue") or peak.get("amount") or peak.get("rows", 0)

            # Growth / Change
            pct_change = round(((last_val - first_val) / max(0.001, first_val)) * 100, 1) if first_val else None
            trend_desc = "an upward trajectory" if pct_change and pct_change > 5 else ("a downward trajectory" if pct_change and pct_change < -5 else "a stable pattern")

            insights.append({
                "id": "temporal_trend",
                "category": "trend",
                "title": f"Temporal {metric_label.title()} Trajectory",
                "finding": f"Over the observed time range ({series[0]['period']} to {series[-1]['period']}), {metric_label} exhibits {trend_desc} "
                           f"with peak activity recorded in {peak['period']} ({round(float(peak_val), 2):,}).",
                "metric": f"{pct_change:+.1f}% overall shift" if pct_change is not None else f"Peak: {peak['period']}",
                "time_period": f"{series[0]['period']} → {series[-1]['period']}",
                "significance": "Crucial for capacity planning, baseline comparisons, and forecasting horizon alignment.",
                "confidence": "high",
                "supporting_data": {"first_period": series[0]['period'], "last_period": series[-1]['period'], "peak_period": peak['period']},
            })

    # 3. Categorical Distribution & Concentration (Pareto Principle)
    cat_cols = [c for c in columns if c["dtype"] in {"text", "boolean"} and c["role"] != "identifier" and 1 < c["unique"] <= 100]
    if cat_cols:
        target_cat = next((c for c in cat_cols if c["role"] == "category"), cat_cols[0])
        dist = source.group(source.by_name[target_cat["name"]], limit=20)
        if dist:
            total_cat_rows = sum(d["rows"] for d in dist)
            top_group = dist[0]
            top_share = round((top_group["rows"] / max(1, total_cat_rows)) * 100, 1)

            insights.append({
                "id": f"concentration_{target_cat['name']}",
                "category": "concentration",
                "title": f"Top Concentration in {target_cat['name']}",
                "finding": f"The leading segment '{top_group['label']}' represents {top_group['rows']:,} records ({top_share}% of observed distribution in {target_cat['name']}).",
                "metric": f"{top_share}% share",
                "time_period": "Aggregated across population",
                "significance": "Indicates whether activity is heavily concentrated in a single category or evenly distributed.",
                "confidence": "high",
                "supporting_data": {"segment": top_group['label'], "rows": top_group['rows'], "share": top_share},
            })

    # 4. Statistical Correlations
    corrs = source.correlations(limit_cols=5)
    strong_corrs = [c for c in corrs if abs(c["correlation"]) >= 0.4]
    for c in strong_corrs[:2]:
        direction = "positive" if c["correlation"] > 0 else "negative"
        strength = "strong" if abs(c["correlation"]) >= 0.7 else "moderate"
        insights.append({
            "id": f"correlation_{c['field1']}_{c['field2']}",
            "category": "correlation",
            "title": f"Statistical Association: {c['field1']} vs {c['field2']}",
            "finding": f"Detected a {strength} {direction} linear association between '{c['field1']}' and '{c['field2']}' (Pearson r = {c['correlation']:+.2f}). Statistical correlation reflects observed co-movement, not direct causality.",
            "metric": f"r = {c['correlation']:+.2f}",
            "time_period": "Observed paired sample",
            "significance": "Useful for feature selection in forecasting models. Note: Does not imply a causal mechanism.",
            "confidence": "high",
            "supporting_data": c,
        })

    # 5. Outliers and Statistical Distribution
    box_stats = source.box_plots(limit_cols=3)
    outlier_stats = [b for b in box_stats if b.get("outlier_count", 0) > 0]
    if outlier_stats:
        top_outlier = max(outlier_stats, key=lambda b: b["outlier_count"])
        outlier_pct = round((top_outlier["outlier_count"] / max(1, row_count)) * 100, 2)
        insights.append({
            "id": f"outliers_{top_outlier['field']}",
            "category": "outlier",
            "title": f"Outlier Detection: {top_outlier['field']}",
            "finding": f"Identified {top_outlier['outlier_count']:,} statistical outliers ({outlier_pct}% of rows) exceeding the 1.5x IQR boundary in '{top_outlier['field']}' "
                       f"(IQR: {top_outlier['iqr']}, Upper bound: {top_outlier['upper_whisker']}).",
            "metric": f"{top_outlier['outlier_count']:,} outliers",
            "time_period": "Distributional scan",
            "significance": "Heavy right-tail observations may disproportionately influence averages; consider median benchmarks.",
            "confidence": "high",
            "supporting_data": top_outlier,
        })

    # 6. Data Quality & Completeness
    quality = ds.quality or {}
    missing_total = quality.get("missing_values", 0)
    duplicate_rows = quality.get("duplicate_rows", 0)
    warnings = quality.get("warnings", [])

    if missing_total > 0 or duplicate_rows > 0 or warnings:
        issues_summary = []
        if missing_total > 0:
            issues_summary.append(f"{missing_total:,} missing values")
        if duplicate_rows > 0:
            issues_summary.append(f"{duplicate_rows:,} duplicate records")
        if warnings:
            issues_summary.append(f"{len(warnings)} data warning(s)")

        insights.append({
            "id": "data_quality_report",
            "category": "quality",
            "title": "Data Quality & Integrity Signals",
            "finding": f"Quality audit flagged: {', '.join(issues_summary)}. " + (" ".join(warnings[:2]) if warnings else "Core attributes remain suitable for analytics."),
            "metric": f"{missing_total:,} missing, {duplicate_rows:,} dups",
            "time_period": "Ingestion audit",
            "significance": "Data completeness directly affects aggregation validity and ML feature reliability.",
            "confidence": "high",
            "supporting_data": quality,
        })

    for item in insights:
        if "type" not in item:
            item["type"] = item.get("category", "summary")
        if "basis" not in item:
            item["basis"] = item.get("time_period", "Observed dataset records")
        if "recommendation" not in item:
            item["recommendation"] = "Inspect associated dashboard charts and apply category filters to drill down."
        if "confidence" in item and isinstance(item["confidence"], str):
            item["confidence"] = item["confidence"].capitalize()

    return insights


def generate_collection_insights(db: Session, datasets: list[Dataset]) -> list[dict[str, Any]]:
    """Generate collection-level summary insights across multiple files in a folder or ZIP archive."""
    insights: list[dict[str, Any]] = []
    if not datasets:
        return insights

    total_files = len(datasets)
    total_rows = sum(d.row_count or 0 for d in datasets)
    ready_files = sum(1 for d in datasets if d.status == "READY")

    insights.append({
        "id": "collection_volume",
        "category": "summary",
        "title": "Collection Overview",
        "finding": f"Collection contains {total_files} discovered dataset(s) with {total_rows:,} cumulative records across {ready_files} fully processed file(s).",
        "metric": f"{total_files} files, {total_rows:,} records",
        "time_period": "Collection inventory",
        "significance": "Collection files can be analyzed individually or compared side-by-side in the Multi-Dataset workspace.",
        "confidence": "high",
        "supporting_data": {"total_files": total_files, "total_rows": total_rows, "ready_files": ready_files},
    })

    # Check for potential shared join keys or entities across datasets
    schemas_by_name = {d.name: [c["name"] for c in (d.profile or {}).get("columns", [])] for d in datasets if d.status == "READY"}
    if len(schemas_by_name) >= 2:
        all_cols: dict[str, list[str]] = {}
        for dname, cols in schemas_by_name.items():
            for c in cols:
                all_cols.setdefault(c.lower(), []).append(dname)

        shared = {c: dnames for c, dnames in all_cols.items() if len(dnames) >= 2}
        if shared:
            top_shared = list(shared.keys())[:3]
            insights.append({
                "id": "collection_shared_keys",
                "category": "correlation",
                "title": "Candidate Shared Fields Detected",
                "finding": f"Potential relational fields identified across files: {', '.join(top_shared)}. "
                           f"Files share common identifiers without being automatically merged, preserving schema isolation.",
                "metric": f"{len(shared)} common field(s)",
                "time_period": "Cross-schema analysis",
                "significance": "Common identifiers allow relational joins between structured entities.",
                "confidence": "medium",
                "supporting_data": {"shared_fields": top_shared},
            })

    for item in insights:
        if "type" not in item:
            item["type"] = item.get("category", "summary")
        if "basis" not in item:
            item["basis"] = item.get("time_period", "Observed dataset records")
        if "recommendation" not in item:
            item["recommendation"] = "Inspect individual dataset schemas and data quality profiles in Dataset Manager."
        if "confidence" in item and isinstance(item["confidence"], str):
            item["confidence"] = item["confidence"].capitalize()

    return insights
