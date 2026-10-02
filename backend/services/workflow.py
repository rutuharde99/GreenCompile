"""Orchestrates the full GreenCompile pipeline. Routes stay thin; all logic is here."""
import difflib
from contextlib import contextmanager
import tempfile
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone

import config
from services import ai_service
from services.analysis_service import analyze_static
from services.carbon_service import estimate_carbon
from services.compiler_service import compile_source, environment_info, public
from services.energy_service import estimate_energy
from services.green_score_service import compute_green_score
from services.pattern_detection_service import detect_patterns
from services.performance_service import measure
from services.safety import validate_source
from services.verification_service import verify

_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_CACHE_LOCK = threading.Lock()


@contextmanager
def _build_directory():
    temp = tempfile.TemporaryDirectory(prefix="gc_build_")
    try:
        yield temp.name
    finally:
        for attempt in range(6):
            try:
                temp.cleanup()
                break
            except PermissionError:
                if attempt == 5:
                    raise
                time.sleep(0.1 * (attempt + 1))


def _remember(result):
    with _CACHE_LOCK:
        _CACHE[result["analysis_id"]] = result
        while len(_CACHE) > 50:
            _CACHE.popitem(last=False)


def _recall(analysis_id, source, compiler, opt):
    with _CACHE_LOCK:
        r = _CACHE.get(analysis_id or "")
    if r and r["source_code"] == source and r["optimization_level"] == opt and r["compilation"]["requested_compiler"] == compiler:
        return r
    return None


def compile_only(source, compiler, opt):
    validate_source(source)
    with _build_directory() as wd:
        comp = compile_source(source, compiler, opt, wd)
    return public(comp)


def analyze_source(source, compiler, opt):
    """compile -> static analysis -> run/measure -> energy -> carbon -> patterns -> Green Score."""
    validate_source(source)
    static = analyze_static(source)
    patterns = detect_patterns(source)
    with _build_directory() as wd:
        comp = compile_source(source, compiler, opt, wd)
        if comp["success"]:
            perf = measure(comp["binary_path"])
        else:
            perf = {"executed": False, "timed_out": False, "crashed": False, "exit_code": None, "stdout": "",
                    "stderr": "", "execution_time_ms": None, "cpu_time_ms": None, "cpu_usage_percent": None,
                    "peak_memory_mb": None, "runs": 0, "deterministic_output": True,
                    "metrics_status": {"execution_time": "unavailable", "cpu": "unavailable", "memory": "unavailable"},
                    "notes": ["Program was not executed because compilation failed."],
                    "error": "Compilation failed."}
    energy = estimate_energy(perf["execution_time_ms"])
    carbon = estimate_carbon(energy["energy_joules"])
    score = compute_green_score(perf, energy, carbon, patterns) if comp["success"] else {
        "available": False, "score": None, "dimensions": [], "reason": "Compilation failed."}
    result = {
        "analysis_id": uuid.uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat(),
        "source_code": source, "compiler": comp["compiler"], "optimization_level": opt,
        "compilation": public(comp), "static_analysis": static, "performance": perf, "energy": energy,
        "carbon": carbon, "green_score": score, "patterns": patterns,
        "ai_recommendations": [], "optimization": None, "verification": None,
        "environment": {"power_watts": config.POWER_WATTS,
                        "carbon_intensity_gco2e_per_kwh": config.CARBON_INTENSITY_G_PER_KWH,
                        "runs": config.RUNS, **{k: v for k, v in environment_info().items() if k in ("os", "psutil")}},
    }
    _remember(result)
    return result


def _candidate_compiles(code, compiler, opt):
    try:
        validate_source(code)
    except ValueError as e:
        return False, [str(e)]
    comp = compile_only(code, compiler, opt)
    return comp["success"], [e["message"] for e in comp["errors"]][:3]


def recommend(source, compiler, opt, analysis_id=None):
    analysis = _recall(analysis_id, source, compiler, opt) or analyze_source(source, compiler, opt)
    out = ai_service.get_recommendations(source, analysis)
    for r in out["recommendations"]:
        if r.get("optimized_code"):
            r["compiles"], r["compile_errors"] = _candidate_compiles(r["optimized_code"], compiler, opt)
        else:
            r["compiles"], r["compile_errors"] = None, []
    analysis["ai_recommendations"] = out["recommendations"]
    return {"analysis_id": analysis["analysis_id"], "patterns": analysis["patterns"], **out}


def diff_lines(a: str, b: str):
    la, lb = a.split("\n"), b.split("\n")
    removed, added = [], []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, la, lb).get_opcodes():
        if tag in ("replace", "delete"):
            removed += list(range(i1 + 1, i2 + 1))
        if tag in ("replace", "insert"):
            added += list(range(j1 + 1, j2 + 1))
    return {"original_changed_lines": removed, "optimized_changed_lines": added}


def _pct(o, n):
    if o is None or n is None:
        return None
    if o == 0:
        return 0.0 if n == 0 else None
    return round((n - o) / abs(o) * 100, 2)


def compare(orig, opt):
    po, pn = orig["performance"], opt["performance"]
    spreads = []
    for p in (po, pn):
        w = p.get("wall_ms")
        if w and w["median"]:
            spreads.append((w["max"] - w["min"]) / w["median"] * 100)
    noise = round(max(spreads), 1) if spreads else None
    rows = [("execution_time_ms", "Execution Time", "ms", po.get("execution_time_ms"), pn.get("execution_time_ms"), True, True),
            ("cpu_time_ms", "CPU Time", "ms", po.get("cpu_time_ms"), pn.get("cpu_time_ms"), True, True),
            ("peak_memory_mb", "Memory", "MB", po.get("peak_memory_mb"), pn.get("peak_memory_mb"), True, False),
            ("energy_joules", "Estimated Energy", "J", orig["energy"].get("energy_joules"), opt["energy"].get("energy_joules"), True, True),
            ("carbon_gco2e", "Estimated Carbon", "gCO2e", orig["carbon"].get("carbon_gco2e"), opt["carbon"].get("carbon_gco2e"), True, True),
            ("green_score", "Green Score", "pts", orig["green_score"].get("score"), opt["green_score"].get("score"), False, False)]
    metrics = []
    for key, label, unit, o, n, lower_better, timing in rows:
        ch = _pct(o, n)
        within = bool(timing and ch is not None and noise is not None and abs(ch) <= noise)
        better = None if ch is None or ch == 0 else ((ch < 0) == lower_better)
        metrics.append({"key": key, "label": label, "unit": unit, "original": o, "optimized": n,
                        "change_percent": ch, "change_abs": None if o is None or n is None else round(n - o, 4),
                        "improved": better, "within_noise": within})
    insights = []
    timing_rows = [m for m in metrics if m["key"] in ("execution_time_ms", "energy_joules", "carbon_gco2e")]
    if timing_rows and all(m["within_noise"] or m["change_percent"] is None for m in timing_rows):
        insights.append(f"Measured runtime, energy and carbon differences are within run-to-run noise "
                        f"(about ±{noise}%), so no real runtime change can be claimed from this measurement.")
    if opt["optimization_level"] != "O0" and any(p["pattern"] == "Repeated computation inside loop" for p in orig["patterns"]):
        insights.append(f"At -{opt['optimization_level']} the compiler's own loop-invariant code motion may already "
                        "remove this redundancy, so the source change may not alter the generated code. "
                        "Try -O0 to see the source-level effect.")
    sc = metrics[-1]
    if sc["change_abs"]:
        insights.append("The Green Score includes a static-efficiency dimension that rewards removing detected "
                        "inefficient patterns, independent of timing noise.")
    return {"metrics": metrics, "noise_percent": noise, "insights": insights,
            "note": "Energy and carbon are estimates derived from measured execution time."}


def optimize(source, compiler, opt, analysis_id=None, optimized_code=None, recommendation_id=None):
    orig = _recall(analysis_id, source, compiler, opt) or analyze_source(source, compiler, opt)
    if not orig["compilation"]["success"]:
        return {"status": "error", "message": "The original code does not compile, so it cannot be optimized.",
                "original_analysis_id": orig["analysis_id"]}
    recs, ai_info, chosen = orig.get("ai_recommendations") or [], None, None
    if not recs and optimized_code is None:
        out = ai_service.get_recommendations(source, orig)
        recs, ai_info = out["recommendations"], out["ai"]
    if optimized_code is None:
        cands = [r for r in recs if r.get("optimized_code")]
        if recommendation_id:
            cands = sorted(cands, key=lambda r: r["id"] != recommendation_id)
        for r in cands:
            ok, _ = _candidate_compiles(r["optimized_code"], compiler, opt)
            if ok:
                chosen, optimized_code = r, r["optimized_code"]
                break
        if optimized_code is None:
            return {"status": "no_optimization", "recommendations": recs, "ai": ai_info,
                    "message": "No compilable, safe code transformation is available for this program. "
                               "Recommendations are advisory only.", "original_analysis_id": orig["analysis_id"]}
    else:
        chosen = next((r for r in recs if r["id"] == recommendation_id), None)
    validate_source(optimized_code)
    new = analyze_source(optimized_code, compiler, opt)
    verification = verify(source, optimized_code, orig, new)
    result = {
        "status": "ok", "original_analysis_id": orig["analysis_id"], "optimized_analysis_id": new["analysis_id"],
        "optimized_code": optimized_code, "recommendation": chosen, "recommendations": recs, "ai": ai_info,
        "changes": (chosen or {}).get("changes", []), "diff": diff_lines(source, optimized_code),
        "original": orig, "optimized": new, "verification": verification, "comparison": compare(orig, new),
    }
    orig["optimization"], orig["verification"] = {k: result[k] for k in ("optimized_code", "changes", "comparison")}, verification
    return result
