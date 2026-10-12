"""API routes for Multi-Dataset Analysis Workspace."""
from __future__ import annotations

from typing import Any, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_bi_user
from app.database.deps import get_db
from app.services import analysis as service

router = APIRouter()


class CreateSessionRequest(BaseModel):
    name: str = Field(default="New Analysis", min_length=1, max_length=120)
    dataset_ids: list[str] = Field(default_factory=list)
    mode: Literal["compare", "combine", "insights"] = "compare"
    config: dict[str, Any] = Field(default_factory=dict)


class UpdateSessionRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    dataset_ids: list[str] | None = None
    mode: Literal["compare", "combine", "insights"] | None = None
    config: dict[str, Any] | None = None


class AddDatasetsRequest(BaseModel):
    dataset_ids: list[str] = Field(..., min_length=1)


class DatasetIdsRequest(BaseModel):
    dataset_ids: list[str] = Field(..., min_length=2)


class CombinePreviewRequest(BaseModel):
    operation: Literal["union", "join"] = "union"
    dataset_ids: list[str] = Field(..., min_length=2)
    columns: list[str] | None = None
    join_key: str | None = None
    join_type: Literal["inner", "left", "outer"] = "inner"


class CombineExecuteRequest(BaseModel):
    operation: Literal["union", "join"] = "union"
    dataset_ids: list[str] = Field(..., min_length=2)
    output_name: str | None = Field(default=None, max_length=120)
    columns: list[str] | None = None
    join_key: str | None = None
    join_type: Literal["inner", "left", "outer"] = "inner"


# -------------------------------------------------------------------------
# Session Endpoints
# -------------------------------------------------------------------------

@router.post("/sessions", status_code=201)
def create_analysis_session(req: CreateSessionRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.create_session(db, user, req.name, req.dataset_ids, req.mode, req.config)


@router.get("/sessions")
def list_analysis_sessions(db=Depends(get_db), user=Depends(require_bi_user)):
    return {"sessions": service.list_sessions(db, user)}


@router.get("/sessions/{session_id}")
def get_analysis_session(session_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.get_session(db, user, session_id)


@router.patch("/sessions/{session_id}")
def update_analysis_session(session_id: str, req: UpdateSessionRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.update_session(db, user, session_id, req.name, req.dataset_ids, req.mode, req.config)


@router.delete("/sessions/{session_id}")
def delete_analysis_session(session_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.delete_session(db, user, session_id)


@router.post("/sessions/{session_id}/datasets")
def add_datasets_to_session(session_id: str, req: AddDatasetsRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.add_datasets_to_session(db, user, session_id, req.dataset_ids)


@router.delete("/sessions/{session_id}/datasets/{dataset_id}")
def remove_dataset_from_session(session_id: str, dataset_id: str, db=Depends(get_db), user=Depends(require_bi_user)):
    return service.remove_dataset_from_session(db, user, session_id, dataset_id)


# -------------------------------------------------------------------------
# Mode Endpoints
# -------------------------------------------------------------------------

@router.post("/compare")
def compare_datasets(req: DatasetIdsRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    """Mode A: Compare datasets side-by-side without merging records."""
    return service.compare_datasets_independently(db, user, req.dataset_ids)


@router.post("/combine/compatibility")
def check_compatibility(req: DatasetIdsRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    """Mode B: Check schema compatibility for Union and Join operations."""
    return service.check_combine_compatibility(db, user, req.dataset_ids)


@router.post("/combine/preview")
def preview_combine_operation(req: CombinePreviewRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    """Mode B: 20-row preview with column lineage and grain warnings."""
    return service.preview_combine(db, user, req.model_dump())


@router.post("/combine/execute", status_code=201)
def execute_combine_operation(req: CombineExecuteRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    """Mode B: Execute validated union/join and register new derived dataset."""
    return service.execute_combine(db, user, req.model_dump())


@router.post("/insights")
def generate_insights(req: DatasetIdsRequest, db=Depends(get_db), user=Depends(require_bi_user)):
    """Mode C: Generate cross-dataset comparative, correlation, and overlap insights."""
    return service.generate_cross_dataset_insights(db, user, req.dataset_ids)
