"""GreenCompile Green Score: a transparent, project-defined composite (NOT an industry standard)."""
import math

from config import PATTERN_PENALTY, SCORE_RANGES, SCORE_WEIGHTS

LABELS = {"performance": "Performance", "cpu": "CPU Efficiency", "memory": "Memory",
          "energy": "Energy Efficiency", "carbon": "Carbon Efficiency", "static": "Static Code Efficiency"}


def _log_score(value, best, worst):
    if value is None:
        return None
    value = max(value, best)
    frac = math.log10(value / best) / math.log10(worst / best)
    return round(max(0.0, min(100.0, 100.0 * (1.0 - frac))), 1)


def compute_green_score(performance, energy, carbon, patterns):
    raw = {
        "performance": performance.get("execution_time_ms"),
        "cpu": performance.get("cpu_time_ms"),
        "memory": performance.get("peak_memory_mb"),
        "energy": energy.get("energy_joules"),
        "carbon": carbon.get("carbon_gco2e"),
    }
    dims = {k: _log_score(v, *SCORE_RANGES[k]) for k, v in raw.items()}
    penalty = sum(PATTERN_PENALTY.get(p["severity"], 0) for p in patterns)
    dims["static"] = float(max(0, 100 - penalty))

    available = {k: v for k, v in dims.items() if v is not None}
    if not available or performance.get("execution_time_ms") is None:
        return {"available": False, "score": None, "dimensions": [], "weights": SCORE_WEIGHTS,
                "name": "GreenCompile Green Score (project-defined)",
                "reason": "Runtime metrics unavailable, so the score was not computed."}
    wsum = sum(SCORE_WEIGHTS[k] for k in available)
    score = sum(available[k] * SCORE_WEIGHTS[k] for k in available) / wsum
    missing = [LABELS[k] for k in dims if dims[k] is None]
    return {
        "available": True, "score": round(score, 1),
        "name": "GreenCompile Green Score (project-defined)",
        "dimensions": [{"key": k, "label": LABELS[k], "score": v, "weight": round(SCORE_WEIGHTS[k] / wsum, 3),
                        "raw_value": raw.get(k)} for k, v in available.items()],
        "weights": SCORE_WEIGHTS,
        "excluded_dimensions": missing,
        "rating": "Excellent" if score >= 85 else "Good" if score >= 70 else "Fair" if score >= 50 else "Needs work",
        "method": ("Weighted mean of 0-100 dimension scores. Runtime dimensions are log-scaled between a best "
                   "and a worst reference value (see backend/config.py); the static dimension is 100 minus "
                   "penalties for detected inefficient patterns. Missing dimensions are excluded and weights "
                   "re-normalised."),
        "disclaimer": "Project-defined metric for comparison within GreenCompile only; not an industry-standard score.",
    }
