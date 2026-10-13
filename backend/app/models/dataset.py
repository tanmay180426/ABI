"""Dataset registry and per-user selection in the existing application database."""
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, JSON, LargeBinary, DateTime
from app.database.session import Base


class Dataset(Base):
    __tablename__ = "app_dataset"
    id = Column(String(36), primary_key=True)
    name = Column(String(120), nullable=False)
    owner = Column(String(120), nullable=True, index=True)
    status = Column(String(32), nullable=False)
    source_type = Column(String(32), nullable=False)
    adapter = Column(String(32), nullable=False, default="tabular")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    profile = Column(JSON, default=dict)
    semantics = Column(JSON, default=dict)
    capabilities = Column(JSON, default=dict)
    quality = Column(JSON, default=dict)
    error = Column(String(500), nullable=True)
    # Bounded uploads preserved privately; never included in public metadata.
    raw_source = Column(LargeBinary, nullable=True)


class DatasetSelection(Base):
    __tablename__ = "app_dataset_selection"
    username = Column(String(120), primary_key=True)
    dataset_id = Column(String(36), nullable=False)


class AnalyticalSourceSelection(Base):
    """Explicitly persist whether a user's source is a collection or one file."""
    __tablename__ = "app_analytical_source_selection"
    username = Column(String(120), primary_key=True)
    source_mode = Column(String(32), nullable=False)
    source_id = Column(String(36), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

