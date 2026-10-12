import os

from pathlib import Path

from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = (BACKEND_DIR / "sem5.db").resolve()
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


def resolve_database_url(url: str | None = None) -> str:
    candidate = url if url is not None else os.getenv("DATABASE_URL")
    if not candidate or candidate in {"sqlite:///./sem5.db", "sqlite:///sem5.db"}:
        return DEFAULT_DATABASE_URL
    return candidate


class Settings(BaseSettings):
    API_V1_STR: str = "/api"
    DATABASE_URL: str = DEFAULT_DATABASE_URL
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", "10080"))
    ENV: str = os.getenv("ENV", "dev")

    # Auth / RBAC. Two roles only: admin and analyst.
    # Defaults to true: every protected router rejects anonymous callers with 401.
    AUTH_REQUIRED: bool = os.getenv("AUTH_REQUIRED", "true").lower() in {"1", "true", "yes"}
    AUTH_ADMIN_PASSWORD: str = os.getenv("AUTH_ADMIN_PASSWORD", "admin123")
    AUTH_ANALYST_PASSWORD: str = os.getenv("AUTH_ANALYST_PASSWORD", "analyst123")

    # AI assistant (provider-agnostic; Ollama preferred)
    ENABLE_LLM_ASSISTANT: bool = os.getenv("ENABLE_LLM_ASSISTANT", "false").lower() in {"1", "true", "yes"}
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama")
    LLM_TIMEOUT_SECONDS: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "20"))

    # Dataset upload configuration
    DATASET_MAX_BYTES: int = int(os.getenv("DATASET_MAX_BYTES", str(100 * 1024 * 1024)))
    DATASET_MAX_ZIP_BYTES: int = int(os.getenv("DATASET_MAX_ZIP_BYTES", str(500 * 1024 * 1024)))
    DATASET_MAX_BATCH_FILES: int = int(os.getenv("DATASET_MAX_BATCH_FILES", "100"))
    DATASET_MAX_BATCH_BYTES: int = int(os.getenv("DATASET_MAX_BATCH_BYTES", str(600 * 1024 * 1024)))
    DATASET_MAX_EXTRACTED_BYTES: int = int(os.getenv("DATASET_MAX_EXTRACTED_BYTES", str(1024 * 1024 * 1024)))
    DATASET_MAX_EXTRACTED_FILES: int = int(os.getenv("DATASET_MAX_EXTRACTED_FILES", "2000"))
    DATASET_MAX_ROWS: int = int(os.getenv("DATASET_MAX_ROWS", "1000000"))
    DATASET_MAX_COLUMNS: int = int(os.getenv("DATASET_MAX_COLUMNS", "100"))
    DATASET_MAX_CELLS: int = int(os.getenv("DATASET_MAX_CELLS", "20000000"))

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: str | None) -> str:
        return resolve_database_url(v)

settings = Settings()
