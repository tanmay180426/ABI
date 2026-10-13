from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import require_bi_user
from app.database.deps import get_db
from app.models.dataset import AnalyticalSourceSelection, Dataset, DatasetSelection
from app.services import datasets as service

import tempfile
import uuid

router = APIRouter()


def dataset_context(request: Request, db=Depends(get_db), user=Depends(require_bi_user),
                    x_dataset_id: str | None = Header(None), x_collection_id: str | None = Header(None),
                    dataset_id: str | None = None):
    if x_dataset_id and dataset_id and x_dataset_id != dataset_id:
        raise HTTPException(422, "Conflicting dataset identifiers.")
    if x_collection_id and (x_dataset_id or dataset_id):
        raise HTTPException(422, "Select either an individual dataset or a collection, not both.")
    allowed = {"dataset_id", "date_from", "date_to", "category", "customer_state", "seller_state", "order_status",
               "payment_type", "review_score", "column_filters", "grain", "limit", "periods", "target", "report"}
    if any(k not in allowed for k in request.query_params):
        raise HTTPException(422, "An unsupported dataset query parameter was supplied.")
    if "grain" in request.query_params:
        from app.analytics.filters import parse_filters
        parse_filters(grain=request.query_params["grain"])
    if request.url.path.startswith("/api/ml") and request.query_params.get("grain", "day") != "day":
        raise HTTPException(422, "ML inference uses daily history or entity aggregates. Remove the unsupported time grain filter.")
    if x_collection_id:
        members = service.resolve_collection(db, user, x_collection_id)
        representative = members[0]
        db.info["dataset"] = representative
        return representative
    return service.resolve(db, user, x_dataset_id or dataset_id)


@router.get("/limits")
def get_limits():
    return {
        "max_bytes": service.MAX_BYTES,
        "max_bytes_mb": service.MAX_BYTES // (1024 * 1024),
        "max_zip_bytes": service.MAX_ZIP_BYTES,
        "max_zip_bytes_mb": service.MAX_ZIP_BYTES // (1024 * 1024),
        "max_batch_bytes": service.MAX_BATCH_BYTES,
        "max_batch_bytes_mb": service.MAX_BATCH_BYTES // (1024 * 1024),
        "max_batch_files": service.MAX_BATCH_FILES,
        "max_extracted_bytes": service.MAX_EXTRACTED_BYTES,
        "max_extracted_bytes_mb": service.MAX_EXTRACTED_BYTES // (1024 * 1024),
        "max_extracted_files": service.MAX_EXTRACTED_FILES,
        "max_rows": service.MAX_ROWS,
        "max_columns": service.MAX_COLUMNS,
        "max_cells": service.MAX_CELLS,
        "max_zip_depth": service.MAX_ZIP_DEPTH,
        "max_compression_ratio": service.MAX_COMPRESSION_RATIO,
        "supported_file_types": [".csv", ".json", ".xlsx", ".xls"],
        "supported_archive_types": [".zip"],
    }


@router.get("/collections")
def get_collections(db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    datasets = db.scalars(
        select(Dataset).where((Dataset.owner == user["username"]) | Dataset.owner.is_(None))
        .order_by(Dataset.created_at.desc())
    ).all()
    collections_map: dict[str, dict] = {}
    for d in datasets:
        pub = service.public(d)
        prov = pub.get("provenance", {})
        collection_id = prov.get("collection_id")
        coll_name = prov.get("collection_name") or prov.get("archive")
        if not collection_id:
            # Legacy uploads lack a stable membership key. Keep each standalone
            # dataset isolated instead of guessing membership from filenames.
            collection_id = f"legacy:{d.id}"
            coll_name = coll_name or d.name
        source_mode = prov.get("source_mode", "INDIVIDUAL_FILE")
        source_type = "zip" if source_mode == "ZIP_COLLECTION" else ("folder" if source_mode == "FOLDER_COLLECTION" else "single")
        group_key = collection_id
        if group_key not in collections_map:
            collections_map[group_key] = {
                "collection_id": collection_id,
                "collection_name": coll_name,
                "source_mode": source_mode,
                "source_type": source_type,
                "dataset_count": 0,
                "total_rows": 0,
                "dataset_ids": [],
                "datasets": [],
            }
        c_entry = collections_map[group_key]
        c_entry["dataset_count"] += 1
        c_entry["total_rows"] += d.row_count or 0
        c_entry["dataset_ids"].append(d.id)
        c_entry["datasets"].append(pub)

    return {"collections": list(collections_map.values())}


@router.post("/collections/{collection_id}/select")
def select_collection(collection_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    members = service.collection_members(db, collection_id, user)
    source_mode = (members[0].profile or {}).get("provenance", {}).get("source_mode")
    if source_mode not in {"ZIP_COLLECTION", "FOLDER_COLLECTION"}:
        raise HTTPException(422, "This source is an individual dataset, not a collection.")
    current = db.get(AnalyticalSourceSelection, user["username"])
    if current:
        current.source_mode, current.source_id = source_mode, collection_id
        current.updated_at = datetime.now(timezone.utc)
    else:
        db.add(AnalyticalSourceSelection(username=user["username"], source_mode=source_mode, source_id=collection_id))
    # Keep legacy callers' selection pointer aligned for existing display code.
    selection = db.get(DatasetSelection, user["username"])
    if selection:
        selection.dataset_id = members[0].id
    else:
        db.add(DatasetSelection(username=user["username"], dataset_id=members[0].id))
    db.commit()
    return {"collection_id": collection_id, "source_mode": source_mode,
            "collection_name": (members[0].profile or {}).get("provenance", {}).get("collection_name"),
            "datasets": [service.public(d) for d in members]}


@router.get("")
def list_datasets(db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    datasets = db.scalars(select(Dataset).where((Dataset.owner == user["username"]) | Dataset.owner.is_(None))
                          .order_by(Dataset.created_at.desc())).all()
    selection = db.get(DatasetSelection, user["username"])
    if not selection and any(d.id == service.REFERENCE_ID for d in datasets):
        service.resolve(db, user)
        selection = db.get(DatasetSelection, user["username"])
    source_selection = db.get(AnalyticalSourceSelection, user["username"])
    return {"datasets": [service.public(d) for d in datasets],
            "active_dataset_id": selection.dataset_id if selection else None,
            "active_source": ({"source_mode": source_selection.source_mode,
                               "source_id": source_selection.source_id}
                              if source_selection else {"source_mode": "INDIVIDUAL_FILE",
                                                       "source_id": selection.dataset_id if selection else None})}


@router.post("/upload", status_code=201)
def upload(file: UploadFile = File(...), name: str = Form(..., min_length=1, max_length=120),
           db=Depends(get_db), user=Depends(require_bi_user)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix in service.EXECUTABLE_EXTENSIONS:
        raise HTTPException(422, "Executable files are not permitted.")
    if suffix not in {".csv", ".json", ".xlsx", ".xls"}:
        raise HTTPException(422, "Unsupported file type. Use CSV, XLSX, XLS or flat-record JSON.")
    raw = file.file.read(service.MAX_BYTES + 1)
    if len(raw) > service.MAX_BYTES:
        raise HTTPException(413, f"File exceeds the configured upload size limit ({service.MAX_BYTES // (1024 * 1024)} MB).")
    if not name.strip():
        raise HTTPException(422, "Dataset name is required.")
    unique_name = service.unique_dataset_name(db, user["username"], name.strip())
    provenance = {
        "source_type": "single_upload",
        "original_filename": file.filename or name.strip(),
        "relative_path": file.filename or name.strip(),
    }
    return service.public(service.ingest(db, user, unique_name, raw, suffix, provenance=provenance))


@router.post("/upload-batch", status_code=200)
def upload_batch(files: list[UploadFile] = File(...),
                 source_mode: Literal["FOLDER_COLLECTION", "EXPLICIT_MULTI_FILE_SELECTION"] = Form("EXPLICIT_MULTI_FILE_SELECTION"),
                 db=Depends(get_db), user=Depends(require_bi_user)):
    if not files:
        raise HTTPException(422, "No files uploaded.")
    if len(files) > service.MAX_BATCH_FILES:
        raise HTTPException(422, f"Batch upload exceeds maximum of {service.MAX_BATCH_FILES} files.")

    successful_datasets = []
    errors = []
    skipped = []
    used_names: set[str] = set()
    total_batch_bytes = 0
    collection_id = str(uuid.uuid4()) if source_mode == "FOLDER_COLLECTION" else None
    folder_roots = {((f.filename or "").replace("\\", "/").split("/", 1)[0]) for f in files}
    if source_mode == "FOLDER_COLLECTION" and (len(folder_roots) != 1 or any("/" not in (f.filename or "").replace("\\", "/") for f in files)):
        raise HTTPException(422, "Folder collections require files with a shared relative-path root.")
    collection_name = next(iter(folder_roots)) if collection_id else None

    for f in files:
        raw_filename = (f.filename or "").replace("\\", "/")
        if ".." in raw_filename or raw_filename.startswith("/") or ":" in raw_filename or "\x00" in raw_filename:
            errors.append({"filename": raw_filename, "error": "Invalid filename or path traversal detected."})
            continue

        clean_filename = Path(raw_filename).name
        suffix = Path(raw_filename).suffix.lower()

        if suffix in service.EXECUTABLE_EXTENSIONS:
            errors.append({"filename": clean_filename, "path": raw_filename, "error": "Executable files are not permitted."})
            continue

        if suffix not in {".csv", ".json", ".xlsx", ".xls"}:
            skipped.append({"filename": clean_filename, "path": raw_filename, "reason": f"Unsupported file type '{suffix}'."})
            errors.append({"filename": clean_filename, "path": raw_filename, "error": f"Unsupported file type '{suffix}'. Use CSV, XLSX, XLS or flat-record JSON."})
            continue

        try:
            raw = f.file.read(service.MAX_BYTES + 1)
            total_batch_bytes += len(raw)
            if total_batch_bytes > service.MAX_BATCH_BYTES:
                raise HTTPException(413, f"Batch upload exceeds maximum total size of {service.MAX_BATCH_BYTES // (1024 * 1024)} MB.")

            if len(raw) > service.MAX_BYTES:
                errors.append({"filename": clean_filename, "path": raw_filename, "error": f"File exceeds upload limit of {service.MAX_BYTES // (1024 * 1024)} MB."})
                continue

            base_name = Path(clean_filename).stem.strip() or "Dataset"
            unique_name = service.unique_dataset_name(db, user["username"], base_name, used_names)
            used_names.add(unique_name)

            provenance = {
                "source_type": "folder_upload" if collection_id else "batch_upload",
                "original_filename": clean_filename,
                "relative_path": raw_filename,
                **({"source_mode": source_mode, "collection_id": collection_id,
                    "collection_name": collection_name} if collection_id else {"source_mode": source_mode}),
            }
            ds = service.ingest(db, user, unique_name, raw, suffix, provenance=provenance)
            if ds.status == "FAILED":
                errors.append({"filename": clean_filename, "path": raw_filename, "error": ds.error or "Dataset processing failed."})
            else:
                successful_datasets.append(service.public(ds))
        except HTTPException:
            raise
        except Exception as e:
            errors.append({"filename": clean_filename, "path": raw_filename, "error": str(e)})

    return {
        "datasets": successful_datasets,
        "successful": len(successful_datasets),
        "failed": len(errors),
        "skipped": len(skipped),
        "skipped_files": skipped,
        "errors": errors,
        "total_files": len(files),
        "collection_id": collection_id,
        "source_mode": source_mode,
    }


@router.post("/upload-zip", status_code=200)
def upload_zip(file: UploadFile = File(...),
               db=Depends(get_db), user=Depends(require_bi_user)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix != ".zip":
        raise HTTPException(422, "Unsupported archive type. Only .zip files are supported.")

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = Path(tmp_file.name)
    total_size = 0

    try:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > service.MAX_ZIP_BYTES:
                tmp_file.close()
                tmp_path.unlink(missing_ok=True)
                raise HTTPException(413, f"ZIP file exceeds upload size limit ({service.MAX_ZIP_BYTES // (1024 * 1024)} MB).")
            tmp_file.write(chunk)
        tmp_file.close()

        result = service.ingest_zip_archive_file(tmp_path, db, user, archive_name=file.filename or "archive.zip")
        return result
    finally:
        tmp_path.unlink(missing_ok=True)


@router.get("/{dataset_id}")
def detail(dataset_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    return service.public(service.authorized(db, dataset_id, user))


@router.post("/{dataset_id}/select")
def select_dataset(dataset_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    ds = service.authorized(db, dataset_id, user, ready=True)
    selection = db.get(DatasetSelection, user["username"])
    if selection:
        selection.dataset_id = ds.id
    else:
        db.add(DatasetSelection(username=user["username"], dataset_id=ds.id))
    db.commit()
    source_selection = db.get(AnalyticalSourceSelection, user["username"])
    if source_selection:
        source_selection.source_mode = "INDIVIDUAL_FILE"
        source_selection.source_id = ds.id
        source_selection.updated_at = datetime.now(timezone.utc)
        db.commit()
    return service.public(ds)


class SchemaUpdate(BaseModel):
    fields: dict[str, str | None] = Field(default_factory=dict)
    currency_code: Literal["BRL", "USD", "INR", "EUR", "GBP"] | None = None
    domain: Literal["general", "commerce", "transactions"] = "general"
    date_order: Literal["dayfirst", "monthfirst"] | None = None


@router.patch("/{dataset_id}/schema")
def update_schema(dataset_id: str, payload: SchemaUpdate, db=Depends(get_db), user=Depends(require_bi_user)):
    ds = service.authorized(db, dataset_id, user, ready=True)
    if ds.owner is None:
        raise HTTPException(403, "Reference dataset schema is read-only.")
    columns = ds.profile["columns"]
    if payload.date_order:
        source = service.parse_source(ds.raw_source, "." + ds.source_type)
        normalized, columns, quality = service.profile_frame(source, payload.date_order)
        table = service.storage_table(ds, db)
        # Dates are stored as text; only date fields change on reparsing.
        date_columns = [c for c in columns if c["dtype"] == "datetime"]
        from sqlalchemy import update
        for idx, values in enumerate(normalized.itertuples(index=False, name=None), 1):
            if date_columns:
                db.execute(update(table).where(table.c.row_id == idx).values(**{
                    c["storage"]: None if __import__("pandas").isna(values[int(c["storage"][1:])]) else str(values[int(c["storage"][1:])])
                    for c in date_columns}))
        ds.profile = {"columns": columns}
        ds.quality = quality
    by_name = {c["name"]: c for c in columns}
    mappings = dict(service.infer_semantics(columns)["fields"] if payload.date_order else ds.semantics.get("fields", {}))
    for role, name in payload.fields.items():
        if role not in service.ROLES:
            raise HTTPException(422, "Unsupported semantic role.")
        if name is None:
            mappings.pop(role, None)
            continue
        if name not in by_name:
            raise HTTPException(422, "The selected field does not exist in this dataset.")
        dtype = by_name[name]["dtype"]
        if role in {"revenue", "currency", "price", "quantity", "rating", "weight_g"} and dtype != "numeric":
            raise HTTPException(422, "This semantic role requires a numeric field.")
        if role in {"date", "delivery_date", "estimated_date"} and dtype != "datetime":
            raise HTTPException(422, "This semantic role requires a validated date field. Confirm date order first.")
        mappings[role] = name
    ds.semantics = {**ds.semantics, "fields": mappings,
                    "currency_code": payload.currency_code, "domain": payload.domain,
                    "confirmed_by": user["username"], "ambiguities": [a for a in ds.semantics.get("ambiguities", []) if a["role"] not in payload.fields]}
    ds.capabilities = service.detect_capabilities(ds.semantics)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    return service.public(ds)


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    ds = service.authorized(db, dataset_id, user)
    if ds.owner is None:
        raise HTTPException(403, "The shared reference dataset cannot be deleted.")
    if ds.status == "PROCESSING":
        raise HTTPException(409, "Wait for dataset processing to finish.")
    if ds.status == "READY":
        service.storage_table(ds, db).drop(db.connection())
    # Keep selection pointing at the removed ID until explicit selection.
    # Subsequent calls fail visibly instead of silently reverting to reference.
    db.delete(ds)
    db.commit()


@router.get("/{dataset_id}/insights")
def dataset_insights(dataset_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    ds = service.authorized(db, dataset_id, user, ready=True)
    from app.analytics.insights_engine import generate_dataset_insights
    return {
        "dataset_id": ds.id,
        "dataset_name": ds.name,
        "insights": generate_dataset_insights(db, ds)
    }

