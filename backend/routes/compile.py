from fastapi import APIRouter

from models.schemas import AnalyzeRequest
from services import workflow

router = APIRouter()


@router.post("/compile")
def compile_code(req: AnalyzeRequest):
    return workflow.compile_only(req.source, req.compiler, req.optimization)
