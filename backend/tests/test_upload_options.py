import io
import zipfile
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database.deps import get_db
from app.services import datasets as service

@pytest.fixture
def isolated(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'datasets.db').as_posix()}", connect_args={"check_same_thread": False})
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

CSV_A = b"date,order_id,revenue\n2025-01-01,o1,100\n2025-01-02,o2,200\n"
CSV_B = b"date,order_id,revenue\n2025-01-03,o3,300\n2025-01-04,o4,400\n"


def upload_single(client: TestClient, auth: dict, name: str, data: bytes, filename: str = "data.csv"):
    return client.post(
        "/api/datasets/upload",
        data={"name": name},
        files={"file": (filename, data)},
        headers=auth,
    )


def test_single_upload_backward_compatibility(isolated, analyst_auth):
    client, _ = isolated
    r = upload_single(client, analyst_auth, "Single Test", CSV_A)
    assert r.status_code == 201
    ds = r.json()
    assert ds["dataset_name"] == "Single Test"
    assert ds["status"] == "READY"
    assert ds["row_count"] == 2


def test_single_upload_duplicate_name_handling(isolated, analyst_auth):
    client, _ = isolated
    r1 = upload_single(client, analyst_auth, "Duplicate Name", CSV_A)
    assert r1.status_code == 201
    assert r1.json()["dataset_name"] == "Duplicate Name"

    r2 = upload_single(client, analyst_auth, "Duplicate Name", CSV_B)
    assert r2.status_code == 201
    assert r2.json()["dataset_name"] == "Duplicate Name (1)"


def test_single_upload_rejects_executable(isolated, analyst_auth):
    client, _ = isolated
    r = upload_single(client, analyst_auth, "Malware", b"MZ...", filename="virus.exe")
    assert r.status_code == 422


def test_batch_upload_multiple_files(isolated, analyst_auth):
    client, _ = isolated
    files = [
        ("files", ("sales_jan.csv", CSV_A, "text/csv")),
        ("files", ("sales_feb.csv", CSV_B, "text/csv")),
    ]
    r = client.post("/api/datasets/upload-batch", files=files, headers=analyst_auth)
    assert r.status_code == 200
    body = r.json()
    assert body["successful"] == 2
    assert body["failed"] == 0
    names = {d["dataset_name"] for d in body["datasets"]}
    assert "sales_jan" in names
    assert "sales_feb" in names


def test_batch_upload_folder_paths(isolated, analyst_auth):
    client, _ = isolated
    # Browser folder upload sends relative paths
    files = [
        ("files", ("folder1/data1.csv", CSV_A, "text/csv")),
        ("files", ("folder1/sub/data2.csv", CSV_B, "text/csv")),
    ]
    r = client.post("/api/datasets/upload-batch", files=files, headers=analyst_auth)
    assert r.status_code == 200
    body = r.json()
    assert body["successful"] == 2
    assert body["failed"] == 0


def test_batch_upload_partial_failures(isolated, analyst_auth):
    client, _ = isolated
    bad_csv = b"corrupted data without proper columns\n1,2,3,4,5"
    files = [
        ("files", ("valid.csv", CSV_A, "text/csv")),
        ("files", ("executable.bat", b"@echo off", "application/x-bat")),
        ("files", ("corrupted.csv", bad_csv, "text/csv")),
    ]
    r = client.post("/api/datasets/upload-batch", files=files, headers=analyst_auth)
    assert r.status_code == 200
    body = r.json()
    assert body["successful"] == 1
    assert body["failed"] == 2
    assert len(body["errors"]) == 2
    failed_files = {e["filename"] for e in body["errors"]}
    assert "executable.bat" in failed_files
    assert "corrupted.csv" in failed_files


def test_batch_upload_count_limit(isolated, analyst_auth, monkeypatch):
    client, _ = isolated
    monkeypatch.setattr(service, "MAX_BATCH_FILES", 2)
    files = [
        ("files", ("file1.csv", CSV_A, "text/csv")),
        ("files", ("file2.csv", CSV_A, "text/csv")),
        ("files", ("file3.csv", CSV_A, "text/csv")),
    ]
    r = client.post("/api/datasets/upload-batch", files=files, headers=analyst_auth)
    assert r.status_code == 422


def create_zip(entries: dict[str, bytes]) -> bytes:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return bio.getvalue()


def test_zip_upload_success(isolated, analyst_auth):
    client, _ = isolated
    zip_bytes = create_zip({
        "sales_2023.csv": CSV_A,
        "nested/sales_2024.csv": CSV_B,
    })
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("archive.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["successful"] == 2
    assert body["failed"] == 0
    names = {d["dataset_name"] for d in body["datasets"]}
    assert "sales_2023" in names
    assert "sales_2024" in names


def test_zip_upload_path_traversal_protection(isolated, analyst_auth):
    client, _ = isolated
    zip_bytes = create_zip({
        "../../etc/passwd.csv": CSV_A,
    })
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("malicious.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 422
    assert "Path traversal" in r.json()["detail"]


def test_zip_upload_executable_rejection(isolated, analyst_auth):
    client, _ = isolated
    zip_bytes = create_zip({
        "data.csv": CSV_A,
        "trojan.exe": b"MZ...",
    })
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("has_exe.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 422
    assert "Executable files" in r.json()["detail"]


def test_zip_upload_no_supported_files(isolated, analyst_auth):
    client, _ = isolated
    zip_bytes = create_zip({
        "notes.txt": b"some text note",
        "image.png": b"\x89PNG\r\n\x1a\n",
    })
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("no_data.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 422
    assert "No supported data files" in r.json()["detail"]


def test_zip_upload_size_limit(isolated, analyst_auth, monkeypatch):
    client, _ = isolated
    monkeypatch.setattr(service, "MAX_ZIP_BYTES", 50)
    zip_bytes = create_zip({"sales.csv": CSV_A})
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("archive.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 413
    assert "upload size limit" in r.json()["detail"]


def test_zip_upload_bomb_protection(isolated, analyst_auth):
    client, _ = isolated
    # High compression ratio: 1MB of null bytes compressed to tiny size
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("huge.csv", b"0" * (1024 * 1024))
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("bomb.zip", bio.getvalue(), "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 413
    assert "ratio" in r.json()["detail"].lower() or "safety" in r.json()["detail"].lower()


def test_zip_upload_skips_non_data_files(isolated, analyst_auth):
    client, _ = isolated
    zip_bytes = create_zip({
        "sales.csv": CSV_A,
        "readme.txt": b"Please read this first.",
    })
    r = client.post(
        "/api/datasets/upload-zip",
        files={"file": ("mixed.zip", zip_bytes, "application/zip")},
        headers=analyst_auth,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["successful"] == 1
    assert body["skipped"] == 1
    assert len(body["skipped_files"]) == 1
    assert body["skipped_files"][0]["path"] == "readme.txt"


def test_batch_upload_total_size_limit(isolated, analyst_auth, monkeypatch):
    client, _ = isolated
    monkeypatch.setattr(service, "MAX_BATCH_BYTES", 100)
    files = [
        ("files", ("f1.csv", CSV_A, "text/csv")),
        ("files", ("f2.csv", CSV_B, "text/csv")),
    ]
    r = client.post("/api/datasets/upload-batch", files=files, headers=analyst_auth)
    assert r.status_code == 413
    assert "total size" in r.json()["detail"].lower()

