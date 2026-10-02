"""Central, configurable assumptions for GreenCompile.

Everything that affects an *estimated* number lives here so it can be
documented, changed via environment variables, and exposed through the API.
"""
import os
from pathlib import Path


def _load_dotenv() -> None:
    """Tiny .env loader (avoids an extra dependency)."""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# ---- Request / execution limits -------------------------------------------
MAX_SOURCE_CHARS = 20_000
COMPILE_TIMEOUT_S = _float("GC_COMPILE_TIMEOUT", 20.0)
RUN_TIMEOUT_S = _float("GC_RUN_TIMEOUT", 5.0)
RUNS = max(1, min(_int("GC_RUNS", 5), 15))          # repeated runs -> median
MAX_OUTPUT_BYTES = 64 * 1024
MEMORY_LIMIT_MB = 512                                # POSIX only (RLIMIT_AS)

# ---- Energy / carbon assumptions (ESTIMATES, not measurements) ------------
POWER_WATTS = _float("GC_POWER_WATTS", 15.0)
CARBON_INTENSITY_G_PER_KWH = _float("GC_CARBON_INTENSITY", 475.0)

# ---- Green Score (project-defined) ----------------------------------------
# Each dimension is scored 0-100 on a log scale between a "best" value
# (score 100) and a "worst" value (score 0).
SCORE_RANGES = {
    "performance": (1.0, 1000.0),      # execution time, ms
    "cpu": (1.0, 1000.0),              # CPU time, ms
    "memory": (1.0, 256.0),            # peak memory, MB
    "energy": (0.015, 15.0),           # estimated energy, J
    "carbon": (0.000002, 0.002),       # estimated carbon, gCO2e
}
# "static" = source-level efficiency from detected patterns (100 - penalties)
SCORE_WEIGHTS = {
    "performance": 0.25,
    "cpu": 0.15,
    "memory": 0.15,
    "energy": 0.20,
    "carbon": 0.10,
    "static": 0.15,
}
PATTERN_PENALTY = {"high": 25, "medium": 15, "low": 5}

# ---- AI advisor -------------------------------------------------------------
AI_API_URL = "https://api.anthropic.com/v1/messages"
AI_MODEL = os.getenv("GC_AI_MODEL", "claude-sonnet-5")
AI_TIMEOUT_S = 60.0


def anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY", "").strip()
