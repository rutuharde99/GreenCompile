from typing import Literal, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    source: str = Field(..., max_length=200_000)
    compiler: Literal["clang", "gcc"] = "clang"
    optimization: Literal["O0", "O1", "O2", "O3"] = "O2"


class RecommendRequest(AnalyzeRequest):
    analysis_id: Optional[str] = None


class OptimizeRequest(RecommendRequest):
    optimized_code: Optional[str] = Field(None, max_length=200_000)
    recommendation_id: Optional[str] = None


class ExplainRequest(BaseModel):
    source: str = Field(..., max_length=200_000)
    recommendation: dict
