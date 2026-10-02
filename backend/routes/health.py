from fastapi import APIRouter

from services.ai_service import ai_status
from services.compiler_service import environment_info

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "GreenCompile"}


@router.get("/environment")
def environment():
    """Compiler availability, OS and AI configuration (never returns the API key)."""
    return {**environment_info(), "ai": ai_status()}
