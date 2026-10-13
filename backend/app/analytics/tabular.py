"""Typed-table source adapter for the existing analytics metric layer.

SQL aggregation stays in the warehouse; only bounded aggregate results leave
the database. No source column name is interpolated into a query.
"""
from __future__ import annotations

import json
import math
from functools import wraps

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import DateTime, cast, func, select

from app.analytics.filters import Filters, period_expr
from app.services.datasets import storage_table


class TabularSource:
    def __init__(self, db, f=None):
        self.db = db
        self.ds = db.info["dataset"]
        self.table = storage_table(self.ds, db)
        self.columns = self.ds.profile["columns"]
        self.by_name = {c["name"]: self.table.c[c["storage"]] for c in self.columns}
        self.fields = self.ds.semantics.get("fields", {})
        self.fields = dict(self.fields)
        if "user" in self.fields:
            self.fields.setdefault("customer", self.fields["user"])
        self.f = f or Filters()
        self.where = []
        date = self.field("date")
        if self.f.date_from or self.f.date_to:
            if date is None:
                raise HTTPException(422, "Date filters require a confirmed analytical date field.")
            if self.f.date_from:
                self.where.append(date >= self.f.date_from)
            if self.f.date_to:
                self.where.append(date < self.f.date_to + "T99")
        roles = {"category": "category", "customer_state": "location", "seller_state": "seller_location",
                 "order_status": "status", "payment_type": "payment_type", "review_score": "rating"}
        for parameter, role in roles.items():
            value = getattr(self.f, parameter)
            if value is not None:
                column = self.field(role)
                if column is None:
                    raise HTTPException(422, f"{parameter} is unavailable for this dataset.")
                self.where.append(column == value)
        for name, value in json.loads(self.f.column_filters or "{}").items():
            if name not in self.by_name:
                raise HTTPException(422, "A filter field does not belong to this dataset.")
            self.where.append(self.by_name[name] == value)

    def field(self, role):
        return self.by_name.get(self.fields.get(role))

    def statement(self, *expressions):
        return select(*expressions).select_from(self.table).where(*self.where)

    def rows(self, statement):
        return [dict(r) for r in self.db.execute(statement).mappings()]

    def scalar(self, expression):
        return self.db.scalar(self.statement(expression))

    def count(self, role):
        col = self.field(role)
        return self.scalar(func.count(func.distinct(col))) if col is not None else None

    def amount(self):
        col = self.field("revenue")
        return col if col is not None else self.field("currency")

    def kpis(self):
        n = self.scalar(func.count())
        amount, quantity, rating = self.field("revenue"), self.field("quantity"), self.field("rating")
        revenue = self.scalar(func.sum(amount)) if amount is not None else None
        currency = self.field("currency")
        return {"row_count": n, "total_orders": self.count("order"),
                "total_revenue": revenue, "total_amount": self.scalar(func.sum(currency)) if currency is not None else None,
                "unique_customers": self.count("customer"),
                "products_sold": self.count("product"), "active_sellers": self.count("seller"),
                "items_sold": self.scalar(func.sum(quantity)) if quantity is not None else None,
                "avg_order_value": None, "avg_review_score": self.scalar(func.avg(rating)) if rating is not None else None,
                "avg_delivery_days": None}

    def numeric_stats(self, col):
        c = self.by_name[col["name"]]
        stats = self.rows(self.statement(func.count(c).label("count"), func.sum(c).label("sum"),
                                         func.avg(c).label("mean"), func.min(c).label("min"), func.max(c).label("max")))[0]
        ordered = self.statement(c.label("v")).where(c.is_not(None)).order_by(c).subquery()
        n = stats["count"]
        if n:
            middle = select(ordered.c.v).offset((n - 1) // 2).limit(2 if n % 2 == 0 else 1).subquery()
            stats["median"] = self.db.scalar(select(func.avg(middle.c.v)))
        else:
            stats["median"] = None
        return {"field": col["name"], **stats}

    def group(self, col, limit=20):
        amount = self.amount()
        expressions = [col.label("label"), func.count().label("rows")]
        if amount is not None:
            expressions.append(func.sum(amount).label("amount"))
        return self.rows(self.statement(*expressions).where(col.is_not(None)).group_by(col)
                         .order_by(func.count().desc(), col).limit(limit))

    def time_series(self, grain=None, limit=400):
        from sqlalchemy import literal_column
        col = self.field("date")
        if col is None:
            return []
        if not grain:
            if self.f and self.f.date_from and self.f.date_to:
                from datetime import date
                try:
                    d_from = date.fromisoformat(self.f.date_from)
                    d_to = date.fromisoformat(self.f.date_to)
                    delta_days = (d_to - d_from).days
                    if delta_days <= 31:
                        grain = "day"
                    elif delta_days <= 90:
                        grain = "week"
                    else:
                        grain = "month"
                except Exception:
                    grain = "month"
            else:
                grain = "month"
        # Identifiers are generated c0..c99; dialect function is whitelisted.
        expression = f"{self.table.name}.{col.name}"
        if self.db.get_bind().dialect.name == "postgresql":
            expression = f"CAST({expression} AS timestamp)"
        period = literal_column(period_expr(self.db, expression, grain))
        cols = [period.label("period"), func.count().label("rows")]
        amount, order = self.amount(), self.field("order")
        if amount is not None:
            cols.append(func.sum(amount).label("revenue" if self.field("revenue") is not None else "amount"))
        if order is not None:
            cols.append(func.count(func.distinct(order)).label("orders"))
        rows = self.rows(self.statement(*cols).where(col.is_not(None)).group_by(period).order_by(period.desc())
                          .limit(limit))[::-1]
        if grain == "day" and self.f and self.f.date_from and self.f.date_to:
            from datetime import date, timedelta
            try:
                start_d = date.fromisoformat(self.f.date_from)
                end_d = date.fromisoformat(self.f.date_to)
                if start_d <= end_d and (end_d - start_d).days <= 1000:
                    raw_map = {r["period"]: r for r in rows if r.get("period")}
                    filled = []
                    cur = start_d
                    rev_key = "revenue" if self.field("revenue") is not None else "amount"
                    while cur <= end_d:
                        cur_str = cur.isoformat()
                        if cur_str in raw_map:
                            filled.append(raw_map[cur_str])
                        else:
                            empty_row = {"period": cur_str, "rows": 0}
                            if amount is not None:
                                empty_row[rev_key] = 0.0
                            if order is not None:
                                empty_row["orders"] = 0
                            filled.append(empty_row)
                        cur += timedelta(days=1)
                    return filled
            except Exception:
                pass
        return rows

    def filters(self):
        filters = []
        for c in self.columns:
            if c["dtype"] in {"text", "boolean"} and c["role"] != "identifier" and c["unique"] <= 100:
                col = self.by_name[c["name"]]
                values = [str(r["value"]) for r in self.rows(self.statement(col.label("value")).where(col.is_not(None))
                                                           .distinct().order_by(col).limit(100))]
                filters.append({"field": c["name"], "label": c["name"], "values": values})
        date = self.field("date")
        dates = self.rows(self.statement(func.min(date).label("min"), func.max(date).label("max")))[0] if date is not None else {"min": "", "max": ""}
        return {"dataset_id": self.ds.id, "dynamic": filters, "has_date": date is not None,
                "date_range": {k: str(v or "") for k, v in dates.items()}, "categories": [], "customer_states": [],
                "seller_states": [], "order_statuses": [], "payment_types": [], "review_scores": []}

    def correlations(self, limit_cols=6):
        # Exclude IDs, surrogate keys, row numbers, and predicted artifact columns
        ignore_patterns = ("_id", "id", "index", "row_num", "predicted_")
        num_cols = [
            c for c in self.columns
            if c["dtype"] == "numeric"
            and not c["name"].lower().startswith("predicted_")
            and not c["name"].lower().endswith(("_id", "_idx", "_index"))
            and c["name"].lower() not in ("id", "index", "row_number")
        ][:limit_cols]
        if len(num_cols) < 2:
            return []
        col_exprs = [self.by_name[c["name"]].label(c["name"]) for c in num_cols]
        rows = self.rows(self.statement(*col_exprs).limit(5000))
        if len(rows) < 3:
            return []
        df = pd.DataFrame(rows).dropna()
        if len(df) < 3:
            return []
        corr_matrix = df.corr()
        results = []
        for i, c1 in enumerate(num_cols):
            for c2 in num_cols[i + 1:]:
                r = corr_matrix.loc[c1["name"], c2["name"]]
                if pd.notna(r) and math.isfinite(r):
                    results.append({
                        "field1": c1["name"],
                        "field2": c2["name"],
                        "correlation": round(float(r), 3)
                    })
        return results

    def box_plots(self, limit_cols=6):
        num_cols = [
            c for c in self.columns
            if c["dtype"] == "numeric"
            and not c["name"].lower().startswith("predicted_")
            and not c["name"].lower().endswith(("_id", "_idx", "_index"))
            and c["name"].lower() not in ("id", "index", "row_number")
        ][:limit_cols]
        plots = []
        for c_info in num_cols:
            c = self.by_name[c_info["name"]]
            ordered = self.statement(c.label("v")).where(c.is_not(None)).order_by(c).subquery()
            n = self.db.scalar(self.statement(func.count(c)).where(c.is_not(None)))
            if not n or n < 4:
                continue
            q1_idx = max(0, int(n * 0.25))
            q2_idx = max(0, int(n * 0.50))
            q3_idx = max(0, int(n * 0.75))
            q1_val = self.db.scalar(select(ordered.c.v).offset(q1_idx).limit(1))
            median_val = self.db.scalar(select(ordered.c.v).offset(q2_idx).limit(1))
            q3_val = self.db.scalar(select(ordered.c.v).offset(q3_idx).limit(1))
            min_val = self.db.scalar(self.statement(func.min(c)))
            max_val = self.db.scalar(self.statement(func.max(c)))
            if q1_val is not None and q3_val is not None:
                iqr = float(q3_val) - float(q1_val)
                lower_whisker = max(float(min_val), float(q1_val) - 1.5 * iqr)
                upper_whisker = min(float(max_val), float(q3_val) + 1.5 * iqr)
                outlier_count = self.db.scalar(self.statement(func.count(c)).where((c < lower_whisker) | (c > upper_whisker))) or 0
                plots.append({
                    "field": c_info["name"],
                    "min": round(float(min_val), 2) if min_val is not None else None,
                    "q1": round(float(q1_val), 2),
                    "median": round(float(median_val), 2) if median_val is not None else None,
                    "q3": round(float(q3_val), 2),
                    "max": round(float(max_val), 2) if max_val is not None else None,
                    "iqr": round(iqr, 2),
                    "lower_whisker": round(lower_whisker, 2),
                    "upper_whisker": round(upper_whisker, 2),
                    "outlier_count": int(outlier_count),
                })
        return plots

    def histograms(self, limit_cols=2, num_bins=10):
        num_cols = [c for c in self.columns if c["dtype"] == "numeric"][:limit_cols]
        hists = []
        for c_info in num_cols:
            c = self.by_name[c_info["name"]]
            min_val = self.db.scalar(self.statement(func.min(c)))
            max_val = self.db.scalar(self.statement(func.max(c)))
            if min_val is None or max_val is None or min_val == max_val:
                continue
            vals = [float(r["v"]) for r in self.rows(self.statement(c.label("v")).where(c.is_not(None)).limit(10000)) if r.get("v") is not None]
            if not vals:
                continue
            counts, bin_edges = np.histogram(vals, bins=num_bins)
            bins_data = []
            for idx in range(len(counts)):
                bins_data.append({
                    "bin_start": round(float(bin_edges[idx]), 2),
                    "bin_end": round(float(bin_edges[idx + 1]), 2),
                    "label": f"{round(float(bin_edges[idx]), 1)} - {round(float(bin_edges[idx + 1]), 1)}",
                    "count": int(counts[idx]),
                })
            hists.append({
                "field": c_info["name"],
                "bins": bins_data,
            })
        return hists

    def scatter_data(self, limit_points=100):
        num_cols = [c for c in self.columns if c["dtype"] == "numeric"]
        if len(num_cols) < 2:
            return None
        x_col, y_col = num_cols[0], num_cols[1]
        x_expr, y_expr = self.by_name[x_col["name"]], self.by_name[y_col["name"]]
        rows = self.rows(
            self.statement(x_expr.label("x"), y_expr.label("y"))
            .where(x_expr.is_not(None), y_expr.is_not(None))
            .limit(limit_points)
        )
        return {
            "x_field": x_col["name"],
            "y_field": y_col["name"],
            "points": [{"x": round(float(r["x"]), 2), "y": round(float(r["y"]), 2)} for r in rows if r.get("x") is not None and r.get("y") is not None]
        }

    def view(self, section, grain=None):
        capability = self.ds.capabilities.get(section, {"available": True})
        if not capability["available"]:
            return {"dataset_id": self.ds.id, "status": "not_applicable", "reason": capability["reason"],
                    "metric_cards": [], "section": section}
        numeric = [self.numeric_stats(c) for c in self.columns if c["dtype"] == "numeric"]
        kpis = self.kpis()
        cards = [{"label": "Rows", "value": kpis["row_count"]}]
        for role, label in (("customer", "Customers"), ("product", "Products"), ("seller", "Sellers"), ("order", "Orders / transactions")):
            if role == "customer" and "customer" not in self.ds.semantics.get("fields", {}) and "user" in self.fields:
                label = "Users / accounts"
            count = self.count(role)
            if count is not None:
                cards.append({"label": label, "value": count})
        for stat in numeric:
            cards.extend([{"label": f"Total {stat['field']}", "value": stat["sum"]},
                          {"label": f"Average {stat['field']}", "value": stat["mean"]}])
        distributions = []
        for c in self.columns:
            if c["dtype"] in {"text", "boolean"} and c["role"] != "identifier" and 1 < c["unique"] <= 100:
                distributions.append({"field": c["name"], "series": self.group(self.by_name[c["name"]])})
        entity_role = {"customers": "customer", "products": "product", "sellers": "seller", "orders": "order"}.get(section)
        entities = self.group(self.field(entity_role), 50) if entity_role else []
        delivery = None
        if section == "delivery":
            from sqlalchemy import literal_column
            from app.analytics.filters import date_diff_expr
            date, delivered = self.field("date"), self.field("delivery_date")
            difference = literal_column(date_diff_expr(self.db, f"{self.table.name}.{delivered.name}", f"{self.table.name}.{date.name}"))
            delivery = self.rows(self.statement(func.count(delivered).label("delivered_rows"), func.avg(difference).label("average_days")))[0]
            estimated = self.field("estimated_date")
            if estimated is not None:
                from sqlalchemy import case
                delivery["on_time_percentage"] = self.scalar(func.avg(case((delivered.is_(None) | estimated.is_(None), None),
                                                                             (delivered <= estimated, 100.0), else_=0.0)))
            cards.extend({"label": name.replace("_", " "), "value": value} for name, value in delivery.items())
        return {"dataset_id": self.ds.id, "dataset_name": self.ds.name, "status": "available", "section": section,
                "filters": self.f.as_dict(), "kpis": kpis, "metric_cards": cards, "numeric_statistics": numeric,
                "distributions": distributions, "entities": entities, "time_series": self.time_series(grain=grain),
                "correlations": self.correlations(), "box_plots": self.box_plots(), "histograms": self.histograms(),
                "scatter": self.scatter_data(),
                "currency_code": self.ds.semantics.get("currency_code"), "capabilities": self.ds.capabilities,
                "quality": self.ds.quality, "delivery": delivery}


def dataset_metric(function):
    """Select a warehouse source once at the shared metric boundary."""
    @wraps(function)
    def wrapped(db, *args, **kwargs):
        ds = db.info.get("dataset")
        if ds is None or ds.adapter == "star_schema":
            f = args[0] if args and isinstance(args[0], Filters) else None
            if f and f.column_filters:
                raise HTTPException(422, "Column filters are not supported by this reference warehouse.")
            return function(db, *args, **kwargs)
        f = args[0] if args and isinstance(args[0], Filters) else kwargs.get("f")
        source = TabularSource(db, f)
        name = function.__name__
        if name == "kpis":
            return source.kpis()
        if name == "filter_options":
            return source.filters()
        if name == "time_series":
            return source.time_series(args[1] if len(args) > 1 else kwargs.get("grain", "month"), kwargs.get("limit", 400))
        if name == "revenue_by_category":
            col = source.field("category")
            return [{"category": r["label"], "revenue": r.get("amount"), "items": r["rows"]} for r in source.group(col)] if col is not None else []
        if name == "orders_by_status":
            col = source.field("status")
            return [{"status": r["label"], "orders": r["rows"]} for r in source.group(col)] if col is not None else []
        if name in {"overview", "sales", "orders", "customers", "products", "sellers", "delivery"}:
            return source.view("dashboard" if name == "overview" else name, grain=args[1] if len(args) > 1 else kwargs.get("grain"))
        # Specialized legacy submetrics cannot read the reference warehouse.
        raise HTTPException(422, f"{name.replace('_', ' ')} requires reference-specific fields.")
    return wrapped
