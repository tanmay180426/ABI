from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import require_bi_user
from app.database.deps import get_db
from app.models.dataset import Dataset, DatasetSelection
from app.services import datasets as service

import tempfile

router = APIRouter()


def dataset_context(request: Request, db=Depends(get_db), user=Depends(require_bi_user),
                    x_dataset_id: str | None = Header(None), dataset_id: str | None = None):
    if x_dataset_id and dataset_id and x_dataset_id != dataset_id:
        raise HTTPException(422, "Conflicting dataset identifiers.")
    allowed = {"dataset_id", "date_from", "date_to", "category", "customer_state", "seller_state", "order_status",
               "payment_type", "review_score", "column_filters", "grain", "limit", "periods", "target", "report"}
    if any(k not in allowed for k in request.query_params):
        raise HTTPException(422, "An unsupported dataset query parameter was supplied.")
    if "grain" in request.query_params:
        from app.analytics.filters import parse_filters
        parse_filters(grain=request.query_params["grain"])
    if request.url.path.startswith("/api/ml") and request.query_params.get("grain", "day") != "day":
        raise HTTPException(422, "ML inference uses daily history or entity aggregates. Remove the unsupported time grain filter.")
    return service.resolve(db, user, x_dataset_id or dataset_id)


@router.get("")
def list_datasets(db=Depends(get_db), user=Depends(require_bi_user)):
    service.ensure_registry(db)
    datasets = db.scalars(select(Dataset).where((Dataset.owner == user["username"]) | Dataset.owner.is_(None))
                          .order_by(Dataset.created_at.desc())).all()
    selection = db.get(DatasetSelection, user["username"])
    if not selection and any(d.id == service.REFERENCE_ID for d in datasets):
        service.resolve(db, user)
        selection = db.get(DatasetSelection, user["username"])
    return {"datasets": [service.public(d) for d in datasets],
            "active_dataset_id": selection.dataset_id if selection else None}


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
                "source_type": "folder_upload" if "/" in raw_filename else "batch_upload",
                "original_filename": clean_filename,
                "relative_path": raw_filename,
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
