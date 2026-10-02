from fastapi import APIRouter

from models.schemas import AnalyzeRequest, ExplainRequest, RecommendRequest
from services import ai_service, workflow

router = APIRouter()


@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    return workflow.analyze_source(req.source, req.compiler, req.optimization)


@router.post("/recommend")
def recommend(req: RecommendRequest):
    return workflow.recommend(req.source, req.compiler, req.optimization, req.analysis_id)


@router.post("/explain")
def explain(req: ExplainRequest):
    return ai_service.explain(req.recommendation, req.source)
