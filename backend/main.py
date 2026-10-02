"""GreenCompile API.  Run:  uvicorn main:app --reload --host 127.0.0.1 --port 8000"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes import analyze, compile as compile_routes, health, optimize
from services.safety import SourceRejected

app = FastAPI(title="GreenCompile API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.exception_handler(SourceRejected)
async def source_rejected(_: Request, exc: SourceRejected):
    return JSONResponse(status_code=400, content={"error": {"code": exc.code, "message": exc.message}})


for r in (health.router, compile_routes.router, analyze.router, optimize.router):
    app.include_router(r, prefix="/api")
