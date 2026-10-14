from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.analytics.filters import Filters, analytics_filters
from app.database.deps import get_db
from app.services import ml as ml_service

router = APIRouter()


class SalesPredictRequest(BaseModel):
    purchase_month: int = Field(..., ge=1, le=12)
    purchase_weekday: int = Field(..., ge=0, le=6)
    purchase_hour: int = Field(..., ge=0, le=23)
    n_items: int = Field(..., ge=1)
    customer_state: str = "SP"
    product_category_name: str = "unknown"


@router.get("/status")
def ml_status(db=Depends(get_db), f=Depends(analytics_filters)):
    features = ml_service.feature_status()
    for feature in features:
        for model in feature["models"]:
            model["compatibility"] = ml_service.compatibility(model["name"], db, f)
            model["metrics_scope"] = "Offline training/evaluation on Olist; not an evaluation of the selected dataset."
    candidates = []
    candidate_path = ml_service.REPO_ROOT / 'ml/candidates/abi-revenue/provenance.json'
    if candidate_path.is_file():
        import json
        candidate = json.loads(candidate_path.read_text(encoding='utf-8'))
        candidates.append({'name':'abi_gradient_boosting_revenue','status':'blocked','models':[{
            'name':'abi_gradient_boosting_revenue','algorithm':'GradientBoostingRegressor (source candidate)',
            'trained_at':None,
            'artifact_available':(candidate_path.parent/'gradient_boosting_sales_model.joblib').is_file(),
            'runtime_ready':False,'runtime_reason':'Inactive source candidate: verified training/preprocessing and provenance inputs are missing; it is not loaded in this API process.',
            'metrics':None,'metrics_scope':'Source evaluation claims are not reproducible and are not selected-dataset metrics.',
            'compatibility':{'compatible':False,'reasons':candidate.get('missing_evidence',[]),'contract':{},'training_domain':None},
            'source_commit':candidate.get('source_commit'),'artifact_sha256':candidate.get('artifact_sha256')
        }]})
    return {"features": features, "source_candidates": candidates, "dataset_id": db.info["dataset"].id}


@router.get("/models/{name}")
def ml_model_detail(name: str, db=Depends(get_db), f=Depends(analytics_filters)):
    meta = ml_service.load_all_metadata().get(name)
    if not meta:
        raise HTTPException(status_code=404, detail=f"model '{name}' not found")
    return {**meta, "compatibility": ml_service.compatibility(name, db, f)}


def _infer(name, db, f, function):
    check = ml_service.compatibility(name, db, f)
    if not check["compatible"]:
        return {"status": "not_applicable", "reason": " ".join(check["reasons"]), "compatibility": check,
                "dataset_id": db.info["dataset"].id}
    try:
        result = function()
        ml_service.validate_output(result)
        return {**result, "status": "available", "compatibility": check, "dataset_id": db.info["dataset"].id}
    except FileNotFoundError:
        raise HTTPException(503, "The trained model artifact is unavailable. Contact the administrator.") from None
    except (ValueError, KeyError, IndexError):
        raise HTTPException(422, "Model inference could not produce valid output for this dataset and filter selection.") from None


@router.get("/forecast")
def ml_forecast(periods: int = 30, target: str = "orders", db=Depends(get_db), f=Depends(analytics_filters)):
    if not (1 <= periods <= 90):
        raise HTTPException(status_code=400, detail="periods must be between 1 and 90")
    if target not in ("orders", "revenue"):
        raise HTTPException(status_code=400, detail="target must be orders or revenue")
    return _infer(f"sales_forecast_{target}", db, f, lambda: ml_service.forecast(periods, target, db, f))


@router.get("/forecast/evaluation")
def ml_forecast_evaluation(target: str = "orders"):
    if target not in ("orders", "revenue"):
        raise HTTPException(status_code=400, detail="target must be orders or revenue")
    try:
        return ml_service.forecast_evaluation(target)
    except FileNotFoundError:
        raise HTTPException(503, "A reproducible holdout evaluation is not available for this target.") from None
    except (ValueError, KeyError, IndexError):
        raise HTTPException(503, "The registered holdout evaluation is invalid or incomplete.") from None


@router.get("/segments/customers")
def ml_customer_segments(db=Depends(get_db), f=Depends(analytics_filters)):
    return _infer("customer_segmentation", db, f, lambda: ml_service.customer_segments(db, f))


@router.get("/anomalies")
def ml_anomalies(db=Depends(get_db), f=Depends(analytics_filters)):
    return _infer("anomaly_detection", db, f, lambda: ml_service.anomalies(db, f))


@router.post("/predict/sales")
def ml_predict_sales(payload: SalesPredictRequest, db=Depends(get_db), f=Depends(analytics_filters)):
    return _infer("sales_prediction", db, f, lambda: ml_service.predict_sales(payload.model_dump()))


@router.get("/product-segmentation")
def ml_product_segmentation(
    f=Depends(analytics_filters),
    db=Depends(get_db)
):
    return _infer("product_segmentation", db, f, lambda: ml_service.product_segments(db, f))
