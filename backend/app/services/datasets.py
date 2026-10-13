"""Bounded ingestion, schema intelligence, registry and authorized resolution.

Uploaded datasets live in isolated typed tables in the existing database.
Only server-generated identifiers enter SQL; source names remain metadata.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import Column, Float, Integer, MetaData, String, Table, Text, func, inspect, select
from sqlalchemy.orm import Session

from app.models.dataset import AnalyticalSourceSelection, Dataset, DatasetSelection
from app.core.config import settings

MAX_BYTES = settings.DATASET_MAX_BYTES
MAX_ZIP_BYTES = settings.DATASET_MAX_ZIP_BYTES
MAX_ROWS = settings.DATASET_MAX_ROWS
MAX_COLUMNS = settings.DATASET_MAX_COLUMNS
MAX_SECONDS = int(os.getenv("DATASET_MAX_SECONDS", 300))
MAX_CELLS = settings.DATASET_MAX_CELLS
MAX_BATCH_FILES = settings.DATASET_MAX_BATCH_FILES
MAX_BATCH_BYTES = settings.DATASET_MAX_BATCH_BYTES
MAX_EXTRACTED_BYTES = settings.DATASET_MAX_EXTRACTED_BYTES
MAX_EXTRACTED_FILES = settings.DATASET_MAX_EXTRACTED_FILES
MAX_ZIP_DEPTH = settings.DATASET_MAX_ZIP_DEPTH
MAX_COMPRESSION_RATIO = settings.DATASET_MAX_COMPRESSION_RATIO
REFERENCE_ID = "00000000-0000-0000-0000-000000000001"

EXECUTABLE_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".sh", ".ps1",
    ".vbs", ".js", ".mjs", ".jar", ".com", ".scr", ".msi", ".bin",
    ".py", ".elf", ".app", ".reg", ".wsf", ".cpl"
}


def unique_dataset_name(db: Session, owner: str, base_name: str, existing_in_batch: set[str] | None = None) -> str:
    """Ensure dataset name is unique for the user and within the current upload batch."""
    from sqlalchemy import select
    ensure_registry(db)
    clean_base = re.sub(r"\s+", " ", str(base_name)).strip()[:110] or "Dataset"
    existing_db = set(db.scalars(select(Dataset.name).where(Dataset.owner == owner)).all())
    if existing_in_batch:
        existing_db.update(existing_in_batch)
    if clean_base not in existing_db:
        return clean_base
    counter = 1
    while f"{clean_base} ({counter})" in existing_db:
        counter += 1
    return f"{clean_base} ({counter})"


def inspect_and_extract_zip(raw_zip: bytes) -> list[tuple[str, bytes, str]]:
    """
    Safely inspect and extract a ZIP archive in-memory.
    Enforces:
    - Path traversal rejection ('..', absolute paths, rooted paths, null bytes)
    - Executable rejection across all archive entries
    - Size and zip-bomb protection (uncompressed total size limit and ratio checks)
    - File count limits
    - Filters to supported data types (.csv, .xlsx, .xls, .json)
    - Skips macOS __MACOSX / ._ files and hidden metadata (.DS_Store)
    Returns list of (clean_dataset_name, file_bytes, suffix).
    """
    if len(raw_zip) > MAX_ZIP_BYTES:
        raise HTTPException(413, f"ZIP file exceeds the {MAX_ZIP_BYTES // (1024 * 1024)} MB limit.")

    try:
        archive = zipfile.ZipFile(io.BytesIO(raw_zip))
    except (zipfile.BadZipFile, Exception):
        raise HTTPException(422, "Invalid or corrupted ZIP archive.")

    infolist = archive.infolist()
    if not infolist:
        raise HTTPException(422, "The ZIP archive is empty.")

    total_uncompressed = sum(info.file_size for info in infolist)
    if total_uncompressed > MAX_EXTRACTED_BYTES:
        raise HTTPException(413, f"ZIP uncompressed content exceeds the safety limit of {MAX_EXTRACTED_BYTES // (1024 * 1024)} MB.")

    # Zip bomb ratio protection
    if len(raw_zip) > 0 and (total_uncompressed / max(1, len(raw_zip))) > MAX_COMPRESSION_RATIO:
        raise HTTPException(413, "ZIP compression ratio exceeds safety limits (possible zip bomb).")

    extracted_files: list[tuple[str, bytes, str]] = []
    supported_extensions = {".csv", ".xlsx", ".xls", ".json"}

    for info in infolist:
        filename = info.filename
        # Path traversal checks
        if ".." in filename or filename.startswith("/") or filename.startswith("\\") or ":" in filename or "\x00" in filename:
            raise HTTPException(422, f"Path traversal detected in ZIP entry: {filename}")

        # Check for symbolic links (POSIX S_IFLNK)
        if (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise HTTPException(422, f"Symbolic links are not permitted in ZIP archive: {filename}")

        # Check nesting depth
        clean_entry = filename.replace("\\", "/").strip("/")
        if clean_entry.count("/") > MAX_ZIP_DEPTH:
            raise HTTPException(422, f"ZIP entry exceeds maximum allowed folder nesting depth of {MAX_ZIP_DEPTH}: {filename}")

        # Check for executables
        ext = Path(filename).suffix.lower()
        if ext in EXECUTABLE_EXTENSIONS:
            raise HTTPException(422, f"Executable files are not permitted in ZIP archive: {filename}")

        # Skip directories and macOS hidden resource forks
        if info.is_dir() or "__MACOSX" in filename or Path(filename).name.startswith("._") or Path(filename).name == ".DS_Store":
            continue

        if ext in supported_extensions:
            if info.file_size > MAX_BYTES:
                raise HTTPException(413, f"File {Path(filename).name} in ZIP exceeds {MAX_BYTES // (1024 * 1024)} MB limit.")
            file_data = archive.read(info)
            stem = Path(filename).stem.strip() or "Dataset"
            extracted_files.append((stem, file_data, ext))

    if not extracted_files:
        raise HTTPException(422, "No supported data files (.csv, .xlsx, .xls, .json) found in ZIP archive.")

    if len(extracted_files) > MAX_EXTRACTED_FILES:
        raise HTTPException(422, f"ZIP archive contains {len(extracted_files)} data files, exceeding the {MAX_EXTRACTED_FILES} files limit.")

    return extracted_files


def ingest_zip_archive_file(archive_path: Path, db: Session, user: dict, archive_name: str) -> dict:
    """Safely stream and process all supported files in a ZIP archive from disk."""
    stat = archive_path.stat()
    if stat.st_size > MAX_ZIP_BYTES:
        raise HTTPException(413, f"ZIP file exceeds upload size limit ({MAX_ZIP_BYTES // (1024 * 1024)} MB).")

    try:
        archive = zipfile.ZipFile(archive_path, "r")
    except (zipfile.BadZipFile, Exception):
        raise HTTPException(422, "Invalid or corrupted ZIP archive.")

    with archive:
        infolist = archive.infolist()
        if not infolist:
            raise HTTPException(422, "The ZIP archive is empty.")

        if len(infolist) > MAX_EXTRACTED_FILES:
            raise HTTPException(413, f"ZIP archive contains {len(infolist)} files, exceeding the {MAX_EXTRACTED_FILES} files limit.")

        total_uncompressed = sum(info.file_size for info in infolist)
        if total_uncompressed > MAX_EXTRACTED_BYTES:
            raise HTTPException(413, f"ZIP uncompressed content ({total_uncompressed // (1024 * 1024)} MB) exceeds the safety limit of {MAX_EXTRACTED_BYTES // (1024 * 1024)} MB.")

        if stat.st_size > 0 and (total_uncompressed / max(1, stat.st_size)) > MAX_COMPRESSION_RATIO:
            raise HTTPException(413, "ZIP compression ratio exceeds safety limits (possible zip bomb).")

        supported_extensions = {".csv", ".xlsx", ".xls", ".json"}
        for info in infolist:
            filename = info.filename
            if ".." in filename or filename.startswith("/") or filename.startswith("\\") or ":" in filename or "\x00" in filename:
                raise HTTPException(422, f"Path traversal detected in ZIP entry: {filename}")
            # Check for symbolic links (POSIX S_IFLNK)
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise HTTPException(422, f"Symbolic links are not permitted in ZIP archive: {filename}")
            # Check nesting depth
            clean_entry = filename.replace("\\", "/").strip("/")
            if clean_entry.count("/") > MAX_ZIP_DEPTH:
                raise HTTPException(422, f"ZIP entry exceeds maximum allowed folder nesting depth of {MAX_ZIP_DEPTH}: {filename}")
            ext = Path(filename).suffix.lower()
            if ext in EXECUTABLE_EXTENSIONS:
                raise HTTPException(422, f"Executable files are not permitted in ZIP archive: {filename}")
            if info.flag_bits & 0x1:
                raise HTTPException(422, f"Encrypted or password-protected entries are not supported: {filename}")

        successful_datasets = []
        collection_id = str(uuid.uuid4())
        errors = []
        skipped_files = []
        used_names: set[str] = set()

        supported_entries = [
            info for info in infolist
            if not info.is_dir()
            and "__MACOSX" not in info.filename
            and not Path(info.filename).name.startswith("._")
            and Path(info.filename).name != ".DS_Store"
            and Path(info.filename).suffix.lower() in supported_extensions
        ]

        if not supported_entries:
            raise HTTPException(422, "No supported data files (.csv, .xlsx, .xls, .json) found in ZIP archive.")

        for info in infolist:
            if info.is_dir() or "__MACOSX" in info.filename or Path(info.filename).name.startswith("._") or Path(info.filename).name == ".DS_Store":
                continue

            ext = Path(info.filename).suffix.lower()
            if ext not in supported_extensions:
                skipped_files.append({"path": info.filename, "reason": f"Unsupported format ({ext or 'no extension'})"})
                continue

            if info.file_size > MAX_BYTES:
                errors.append({"path": info.filename, "error": f"Extracted file exceeds {MAX_BYTES // (1024 * 1024)} MB limit."})
                continue

            stem = Path(info.filename).stem.strip() or "Dataset"
            try:
                unique_name = unique_dataset_name(db, user["username"], stem, used_names)
                used_names.add(unique_name)
                file_bytes = archive.read(info)
                ds = ingest(db, user, unique_name, file_bytes, ext, provenance={
                    "source_mode": "ZIP_COLLECTION", "collection_id": collection_id,
                    "collection_name": archive_name, "archive": archive_name,
                    "relative_path": info.filename,
                })
                if ds.status == "FAILED":
                    errors.append({"path": info.filename, "error": ds.error or "Dataset processing failed."})
                else:
                    successful_datasets.append(public(ds))
            except Exception as e:
                errors.append({"path": info.filename, "error": str(e)})

        return {
            "archive_name": archive_name,
            "collection_id": collection_id,
            "archive_size": stat.st_size,
            "files_discovered": len(infolist),
            "supported_files": len(supported_entries),
            "successful": len(successful_datasets),
            "failed": len(errors),
            "skipped": len(skipped_files),
            "skipped_files": skipped_files,
            "datasets": successful_datasets,
            "errors": errors,
        }

# Deliberately conservative: ambiguous 'amount' is currency, not revenue;
# arbitrary identifiers and numeric fields never become customers or sales.
ALIASES = {
    "revenue": {"revenue", "sales", "salesamount", "totalrevenue", "itemrevenue"},
    "currency": {"amount", "totalamount", "transactionamount", "paymentvalue"},
    "price": {"price", "unitprice", "sellingprice"},
    "quantity": {"quantity", "qty", "units", "unitssold", "nitems"},
    "customer": {"customer", "customerid", "customeruniqueid", "custid", "clientid"},
    "user": {"userid", "accountid"},
    "product": {"product", "productid", "item", "itemid", "sku", "service"},
    "seller": {"seller", "sellerid", "vendor", "vendorid", "merchantid"},
    "order": {"orderid", "order", "transactionid", "invoiceid"},
    "category": {"category", "productcategory", "productcategoryname", "department"},
    "location": {"region", "location", "city", "state", "country", "customerstate"},
    "seller_location": {"sellerstate", "vendorstate"},
    "status": {"status", "orderstatus", "transactionstatus"},
    "payment_type": {"paymenttype", "paymentmethod"},
    "rating": {"rating", "reviewscore", "rating score"},
    "delivery_date": {"deliverydate", "delivereddate", "deliveredcustomerdate"},
    "estimated_date": {"estimateddeliverydate", "estimateddate"},
    "weight_g": {"productweightg", "weightg"},
}
ROLES = set(ALIASES) | {"date", "identifier", "numeric_measure", "percentage", "text", "boolean"}
REFERENCE_FIELDS = {"date": "purchase_date", "order": "order_id", "customer": "customer_unique_id",
                    "revenue": "item_revenue", "status": "order_status", "rating": "review_score",
                    "delivery_date": "delivered_customer_date", "estimated_date": "estimated_delivery_date"}


def reference_profile(db):
    columns = inspect(db.get_bind()).get_columns("fact_orders")
    return {"grain": "orders", "columns": [
        {"name": c["name"], "dtype": str(c["type"]), "role": next((r for r, n in REFERENCE_FIELDS.items() if n == c["name"]), "reference field"),
         "confidence": 1, "missing": None, "unique": None, "constant": False, "ambiguous_date": False} for c in columns]}


def key(name):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"([a-z])([A-Z])", r"\1_\2", str(name)).lower())


def ensure_registry(db: Session):
    bind = db.get_bind()
    Dataset.__table__.create(bind, checkfirst=True)
    DatasetSelection.__table__.create(bind, checkfirst=True)
    AnalyticalSourceSelection.__table__.create(bind, checkfirst=True)
    if not db.get(Dataset, REFERENCE_ID) and "fact_orders" in inspect(bind).get_table_names():
        from sqlalchemy import text
        n = db.scalar(text("SELECT COUNT(*) FROM fact_orders"))
        if n:
            profile = reference_profile(db)
            db.add(Dataset(id=REFERENCE_ID, name="Olist", owner=None, status="READY",
                           source_type="warehouse", adapter="star_schema", row_count=n,
                           column_count=len(profile["columns"]), profile=profile,
                           semantics={"currency_code": "BRL", "domain": "commerce", "fields": REFERENCE_FIELDS},
                           capabilities={s: {"available": True, "reason": None} for s in
                                         ("dashboard", "sales", "orders", "customers", "products", "sellers", "delivery")}))
            db.commit()
    reference = db.get(Dataset, REFERENCE_ID)
    if reference and not reference.profile.get("columns"):
        reference.profile = reference_profile(db)
        reference.column_count = len(reference.profile["columns"])
        reference.semantics = {**reference.semantics, "fields": REFERENCE_FIELDS}
        db.commit()


def public(ds):
    result = {"dataset_id": ds.id, "dataset_name": ds.name, "owner": ds.owner,
            "status": ds.status, "source_type": ds.source_type,
            "created_at": ds.created_at.isoformat() if ds.created_at else None,
            "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
            "row_count": ds.row_count, "column_count": ds.column_count,
            "schema": {**ds.profile, "columns": [
                {k: v for k, v in column.items() if k != "storage"}
                for column in ds.profile.get("columns", [])]}, "semantics": ds.semantics,
            "capabilities": ds.capabilities, "quality": ds.quality, "error": ds.error,
            "provenance": ds.profile.get("provenance", {}),
            "read_only": ds.owner is None}
    # Older metadata may predate finite-statistic validation. Unknown values
    # remain unavailable rather than becoming fabricated zeroes.
    def safe(value):
        if isinstance(value, float) and not math.isfinite(value):
            return None
        if isinstance(value, dict):
            return {k: safe(v) for k, v in value.items()}
        if isinstance(value, list):
            return [safe(v) for v in value]
        return value
    return safe(result)


def authorized(db, dataset_id, user, ready=False):
    ds = db.get(Dataset, dataset_id)
    if ds is None:
        raise HTTPException(404, "Dataset not found.")
    # Admin privileges do not implicitly grant access to private analyst data.
    if ds.owner is not None and ds.owner != user["username"]:
        raise HTTPException(403, "You do not have access to this dataset.")
    if ready and ds.status != "READY":
        raise HTTPException(409, "Dataset is not ready. Review its processing status.")
    return ds


def collection_members(db, collection_id, user, ready=True):
    """Resolve a collection by its persisted opaque ID and enforce owner scope."""
    ensure_registry(db)
    members = db.scalars(select(Dataset).where(
        Dataset.owner == user["username"],
    ).order_by(Dataset.created_at, Dataset.id)).all()
    members = [d for d in members if (d.profile or {}).get("provenance", {}).get("collection_id") == collection_id]
    if not members:
        raise HTTPException(404, "Collection not found.")
    if ready and any(d.status != "READY" for d in members):
        raise HTTPException(409, "Collection processing is incomplete. Review its file-level status before analysis.")
    return members


def resolve_collection(db, user, collection_id):
    members = collection_members(db, collection_id, user)
    db.info["source_mode"] = (members[0].profile or {}).get("provenance", {}).get("source_mode", "ZIP_COLLECTION")
    db.info["collection_id"] = collection_id
    db.info["collection_datasets"] = members
    # Kept only as an explicit compatibility handle for endpoints that have not
    # yet migrated to collection metrics; these callers must not silently run.
    return members


def resolve(db, user, requested=None):
    ensure_registry(db)
    selection = db.get(DatasetSelection, user["username"])
    source_selection = db.get(AnalyticalSourceSelection, user["username"])
    if requested is None and source_selection and source_selection.source_mode in {"ZIP_COLLECTION", "FOLDER_COLLECTION"}:
        members = resolve_collection(db, user, source_selection.source_id)
        ds = members[0]
        db.info["dataset"] = ds
        return ds
    db.info["source_mode"] = "INDIVIDUAL_FILE"
    db.info.pop("collection_id", None)
    db.info.pop("collection_datasets", None)
    dataset_id = requested or (selection.dataset_id if selection else None)
    if not dataset_id:
        # Migration initializes existing users to the registered reference once.
        # A removed or failed selection is never replaced by reference data.
        if db.get(Dataset, REFERENCE_ID):
            selection = DatasetSelection(username=user["username"], dataset_id=REFERENCE_ID)
            db.add(selection)
            db.commit()
            dataset_id = REFERENCE_ID
        else:
            raise HTTPException(409, "Select a ready dataset in Dataset Manager.")
    ds = authorized(db, dataset_id, user, ready=True)
    db.info["dataset"] = ds
    return ds


def storage_table(ds, db=None, columns=None):
    # Revalidate even persisted IDs before constructing database identifiers.
    ident = uuid.UUID(ds.id).hex
    name = "dataset_" + ident
    if columns is None:
        tables = db.info.setdefault("dataset_tables", {})
        if ds.id not in tables:
            tables[ds.id] = Table(name, MetaData(), autoload_with=db.connection())
        return tables[ds.id]
    return Table(name, MetaData(), Column("row_id", Integer, primary_key=True), *[
        Column(f"c{i}", Float if c["dtype"] == "numeric" else Text, nullable=True)
        for i, c in enumerate(columns)
    ])


def _headers(values):
    names = [str(v).strip() if v is not None else "" for v in values]
    if not names or any(not n or n.lower().startswith("unnamed:") for n in names):
        raise ValueError("Missing column headers were detected.")
    if len(names) > MAX_COLUMNS:
        raise ValueError(f"Dataset exceeds the {MAX_COLUMNS} column limit.")
    if len({n.casefold() for n in names}) != len(names):
        raise ValueError("Duplicate column names were detected.")
    if any(len(n) > 200 for n in names):
        raise ValueError("Column names must be at most 200 characters.")
    if all(re.fullmatch(r"[\d.]+", n) for n in names):
        raise ValueError("A header row is required.")
    return names


def parse_source(raw, suffix):
    if not raw:
        raise ValueError("The uploaded file is empty.")
    if len(raw) > MAX_BYTES:
        raise ValueError(f"File exceeds the {MAX_BYTES // 1024 // 1024} MB limit.")
    if suffix == ".csv":
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ValueError("CSV must use UTF-8 encoding. Please export it as UTF-8.") from None
        if "\x00" in content:
            raise ValueError("CSV contains invalid binary content.")
        try:
            sample = content[:16384]
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        # Ensure standard doublequote and quotechar handling
        reader = csv.reader(
            io.StringIO(content),
            dialect=dialect,
            doublequote=True,
            escapechar="\\",
            skipinitialspace=True,
        )
        names = _headers(next(reader, []))
        rows = []
        malformed_count = 0
        for line_no, row in enumerate(reader, start=2):
            if not row:
                continue
            if len(row) != len(names):
                malformed_count += 1
                # If a single row is genuinely malformed, raise precise diagnostic or skip if empty padding
                raise ValueError(f"CSV row {line_no} has {len(row)} fields; expected {len(names)} matching header.")
            if len(rows) >= MAX_ROWS:
                raise ValueError(f"Dataset exceeds the {MAX_ROWS} row limit.")
            if (len(rows) + 1) * len(names) > MAX_CELLS:
                raise ValueError("Dataset exceeds the configured processing memory budget.")
            rows.append(row)
        df = pd.DataFrame(rows, columns=names)
    elif suffix == ".json":
        def pairs(items):
            result = {}
            for k, v in items:
                if k in result:
                    raise ValueError("Duplicate JSON field names were detected.")
                result[k] = v
            return result
        obj = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=pairs,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON numbers are unsupported.")))
        if not isinstance(obj, list) or not obj or not all(isinstance(r, dict) for r in obj):
            raise ValueError("JSON must contain a non-empty array of flat records.")
        if len(obj) > MAX_ROWS:
            raise ValueError(f"Dataset exceeds the {MAX_ROWS} row limit.")
        if any(isinstance(v, (dict, list)) for r in obj for v in r.values()):
            raise ValueError("Nested JSON fields are unsupported; use flat records.")
        names = _headers(list(dict.fromkeys(k for r in obj for k in r)))
        if len(names) * len(obj) > MAX_CELLS:
            raise ValueError("Dataset exceeds the configured processing memory budget.")
        df = pd.DataFrame(obj)
        df.columns = _headers(df.columns)
    elif suffix in {".xlsx", ".xls"}:
        if suffix == ".xlsx":
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if sum(i.file_size for i in archive.infolist()) > MAX_BYTES * 10:
                    raise ValueError("Spreadsheet expanded size exceeds the safety limit.")
                if any("vbaProject" in i.filename or "externalLinks/" in i.filename for i in archive.infolist()):
                    raise ValueError("Macros and external spreadsheet links are unsupported.")
            import openpyxl
            workbook = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            try:
                if len(workbook.worksheets) != 1:
                    raise ValueError("Upload a workbook with one worksheet.")
                sheet = workbook.worksheets[0]
                if (sheet.max_column or 0) > MAX_COLUMNS or (sheet.max_row or 0) > MAX_ROWS + 1 or (sheet.max_column or 0) * (sheet.max_row or 0) > MAX_CELLS:
                    raise ValueError("Spreadsheet dimensions exceed the configured processing limits.")
            finally:
                workbook.close()
        try:
            book = pd.ExcelFile(io.BytesIO(raw), engine="openpyxl" if suffix == ".xlsx" else "xlrd")
        except ImportError:
            raise ValueError("Legacy XLS support requires xlrd; export this workbook as XLSX or CSV.") from None
        if len(book.sheet_names) != 1:
            raise ValueError("Upload a workbook with one worksheet. Separate sheets are separate datasets.")
        frame = pd.read_excel(book, header=None, nrows=MAX_ROWS + 2)
        names = _headers(frame.iloc[0].tolist() if not frame.empty else [])
        df = frame.iloc[1:].copy()
        df.columns = names
    else:
        raise ValueError("Unsupported file type. Use CSV, XLSX, XLS or flat-record JSON.")
    if df.empty:
        raise ValueError("Dataset contains no data rows.")
    if len(df) > MAX_ROWS or len(df.columns) > MAX_COLUMNS or len(df) * len(df.columns) > MAX_CELLS:
        raise ValueError("Dataset exceeds the configured row or column limit.")
    return df.replace(r"^\s*$", None, regex=True).replace({"NaN": None, "null": None})


def profile_frame(df, date_order=None):
    cols, warnings = [], []
    normalized = df.copy()
    for i, name in enumerate(df.columns):
        s = df[name]
        present = s.dropna()
        canonical = key(name)
        currency_code = next((code for code in ("BRL", "USD", "INR", "EUR", "GBP")
                              if canonical.endswith(code.lower()) and canonical[:-3] in ALIASES["revenue"] | ALIASES["currency"] | ALIASES["price"]), None)
        semantic_key = canonical[:-3] if currency_code else canonical
        idlike = canonical.endswith("id") or canonical in {"phone", "phonenumber", "zipcode", "postalcode"}
        role = next((r for r, aliases in ALIASES.items() if semantic_key in aliases), None)
        if canonical in {"currency", "currencycode"}:
            codes = set(present.astype(str).str.upper().str.strip())
            currency_code = next(iter(codes)) if len(codes) == 1 and codes <= {"BRL", "USD", "INR", "EUR", "GBP"} else None
            role = "text"
        numeric = pd.to_numeric(s, errors="coerce")
        boolean = bool(len(present) and set(present.astype(str).str.lower()) <= {"true", "false", "yes", "no"})
        is_num = len(present) > 0 and numeric.notna().sum() == len(present) and not idlike and not boolean
        dtype, confidence = "text", 0.6
        ambiguous = False
        date_candidate = any(t in canonical for t in ("date", "timestamp", "datetime"))
        date_candidate |= bool(len(present) and present.astype(str).str.match(r"^\d{4}-\d{2}-\d{2}(?:[ T].*)?$").all())
        if date_candidate and len(present):
            slash = present.astype(str).str.extract(r"^(\d{1,2})[/-](\d{1,2})[/-]\d{4}$").dropna()
            ambiguous = bool(not slash.empty and (slash.astype(int) <= 12).all().all() and not date_order)
            if ambiguous:
                warnings.append(f"Choose day/month order for {name} before using it as an analytical date.")
            else:
                first_large = not slash.empty and (slash[0].astype(int) > 12).any()
                second_large = not slash.empty and (slash[1].astype(int) > 12).any()
                if first_large and second_large and not date_order:
                    dates = pd.Series(pd.NaT, index=s.index)
                else:
                    dates = pd.to_datetime(s.astype("string"), errors="coerce", format="mixed",
                                           dayfirst=date_order == "dayfirst" or (date_order is None and first_large), utc=True)
                if dates.notna().sum() == len(present):
                    dtype, confidence = "datetime", 0.98
                    role = role if role in {"delivery_date", "estimated_date"} else "date"
                    normalized[name] = dates.map(lambda d: d.isoformat() if pd.notna(d) else None)
                else:
                    warnings.append(f"{name} contains invalid date values; date analytics are disabled for this field.")
        if dtype == "text" and is_num and not date_candidate:
            if not all(math.isfinite(float(v)) for v in numeric.dropna()):
                raise ValueError(f"{name} contains non-finite numeric values.")
            dtype, confidence = "numeric", 0.9
            normalized[name] = numeric
        if dtype == "text" and not role:
            if idlike:
                role = "identifier"
            elif boolean:
                role, dtype = "boolean", "boolean"
            elif s.nunique() <= min(50, max(2, len(s) // 2)):
                role = "category"
            else:
                role = "text"
        if dtype == "numeric" and not role:
            role = "percentage" if any(t in canonical for t in ("percent", "percentage", "attendance")) else "numeric_measure"
        # Monetary/quantity roles require numeric evidence; timestamps require parsed values.
        if role in {"revenue", "currency", "price", "quantity", "rating", "weight_g"} and dtype != "numeric":
            role = "text"
        if role in {"delivery_date", "estimated_date", "date"} and dtype != "datetime":
            role = "text"
        c = {"name": str(name), "storage": f"c{i}", "dtype": dtype, "role": role,
             "currency_code": currency_code,
             "confidence": round(confidence if role in {"text", "category", "numeric_measure"} else min(confidence, .95), 2),
             "missing": int(s.isna().sum()), "missing_percentage": round(float(s.isna().mean() * 100), 2),
             "unique": int(s.nunique()), "constant": bool(s.nunique() <= 1), "ambiguous_date": ambiguous}
        if date_candidate:
            c["invalid_dates"] = int(len(present) - dates.notna().sum()) if not ambiguous and len(present) else 0
        if dtype == "numeric":
            c["statistics"] = {k: (float(v) if pd.notna(v) else None) for k, v in
                               {"min": numeric.min(), "max": numeric.max(), "mean": numeric.mean(),
                                "median": numeric.median(), "std": numeric.std()}.items()}
            if any(v is not None and not math.isfinite(v) for v in c["statistics"].values()):
                raise ValueError(f"{name} produces non-finite calculated statistics; reduce the numeric range.")
        cols.append(c)
    return normalized, cols, {"missing_values": int(df.isna().sum().sum()),
                              "duplicate_rows": int(df.duplicated().sum()), "warnings": warnings}


def infer_semantics(cols):
    mappings, ambiguous = {}, []
    for role in ROLES - {"identifier", "text", "boolean", "numeric_measure", "percentage"}:
        candidates = [c for c in cols if c["role"] == role]
        if len(candidates) == 1:
            mappings[role] = candidates[0]["name"]
        elif candidates:
            ambiguous.append({"role": role, "candidates": [c["name"] for c in candidates]})
    codes = {c.get("currency_code") for c in cols if c.get("currency_code")}
    return {"fields": mappings, "ambiguities": ambiguous, "currency_code": next(iter(codes)) if len(codes) == 1 else None,
            "domain": "commerce" if "revenue" in mappings or "product" in mappings else "general"}


def detect_capabilities(semantics):
    fields = dict(semantics.get("fields", {}))
    if "user" in fields:
        fields.setdefault("customer", fields["user"])
    requirements = {"dashboard": [], "sales": [], "orders": ["order"], "customers": ["customer"],
                    "products": ["product"], "sellers": ["seller"], "delivery": ["date", "delivery_date"]}
    return {name: {"available": all(f in fields for f in needed),
                   "reason": None if all(f in fields for f in needed) else
                   "No " + ", ".join(f.replace("_", " ") for f in needed if f not in fields) + " field was confirmed."}
            for name, needed in requirements.items()}


def ingest(db, user, name, raw, suffix, provenance: dict | None = None):
    ensure_registry(db)
    raw_to_store = raw if len(raw) <= 10 * 1024 * 1024 else None
    ds = Dataset(id=str(uuid.uuid4()), name=name, owner=user["username"], status="PROCESSING",
                 source_type=suffix.lstrip("."), raw_source=raw_to_store)
    db.add(ds)
    db.commit()
    started = time.monotonic()
    table = None
    try:
        source = parse_source(raw, suffix)
        normalized, columns, quality = profile_frame(source)
        if time.monotonic() - started > MAX_SECONDS:
            raise ValueError("Dataset processing exceeded the time limit.")
        table = storage_table(ds, columns=columns)
        table.create(db.connection())
        # Small insert batches keep memory and statement size bounded.
        for start in range(0, len(normalized), 1000):
            rows = []
            for values in normalized.iloc[start:start + 1000].itertuples(index=False, name=None):
                rows.append({f"c{i}": None if pd.isna(v) else float(v) if columns[i]["dtype"] == "numeric" else str(v)
                             for i, v in enumerate(values)})
            db.execute(table.insert(), rows)
            if time.monotonic() - started > MAX_SECONDS:
                raise ValueError("Dataset processing exceeded the time limit.")
        for col in columns:
            if col["role"] in {"date", "category", "customer", "product", "seller", "order", "location", "status"}:
                from sqlalchemy import Index
                Index(f"ix_{table.name}_{col['storage']}", table.c[col["storage"]]).create(db.connection())
        ds.row_count, ds.column_count = len(source), len(columns)
        ds.profile = {"columns": columns, "provenance": provenance or {}}
        ds.quality = {**quality, "processing_seconds": round(time.monotonic() - started, 3)}
        ds.semantics = infer_semantics(columns)
        ds.capabilities = detect_capabilities(ds.semantics)
        ds.status = "READY"
        db.commit()
    except Exception as exc:
        db.rollback()
        if table is not None:
            table.drop(db.connection(), checkfirst=True)
        ds = db.get(Dataset, ds.id)
        ds.status = "FAILED"
        ds.error = str(exc)[:400] if isinstance(exc, (ValueError, csv.Error, json.JSONDecodeError)) else "Dataset could not be processed. Check the file format and structure."
        db.commit()
    return ds
