from fastapi import APIRouter

from models.schemas import OptimizeRequest
from services import workflow

router = APIRouter()


@router.post("/optimize")
def optimize(req: OptimizeRequest):
    return workflow.optimize(req.source, req.compiler, req.optimization, req.analysis_id,
                             req.optimized_code, req.recommendation_id)
