"""AI Green Advisor.

* The API key is read from the environment on the server only.
* The model receives our measured/estimated data as context and may NOT invent numbers:
  it returns qualitative impact text; all numbers shown in the UI come from our own analysis.
* If the AI is unavailable/misconfigured/malformed, deterministic rule-based suggestions are
  returned instead and the response says so explicitly.
* AI-proposed code is never trusted: it is compiled and verified downstream.
"""
import json
import re
import urllib.error
import urllib.request

import config
from services.pattern_detection_service import apply_hoisting

_SYSTEM = """You are the GreenCompile Green Advisor, an expert in C performance and sustainable software.
You receive JSON with a C program plus its compiler result, measured performance, ESTIMATED energy/carbon and detected patterns.
Rules:
- Never invent or restate numeric measurements; qualitative impact only (e.g. "reduces repeated arithmetic per iteration").
- Only propose SAFE transformations that preserve observable behaviour (same stdout and exit code). No aggressive rewrites.
- optimized_code, when given, must be a COMPLETE compilable C program using only standard headers
  (stdio, stdlib, string, math, stdint, stdbool, ctype, time, limits, float, stddef, errno, assert, inttypes, stdarg).
  Use null if no safe code change exists.
- Respond with ONLY a JSON object, no markdown fences, exactly of the form:
{"recommendations":[{"related_pattern":"<pattern name or general>","issue":"...","why_it_matters":"...",
"recommendation":"...","optimized_code":"<full program or null>","expected_impact":"<qualitative>",
"confidence":"low|medium|high","assumptions":["..."]}]}
Return at most 3 recommendations, most impactful first."""


class AIError(Exception):
    pass


def ai_status():
    return {"configured": bool(config.anthropic_key()), "model": config.AI_MODEL}


def _post(system, user_text, max_tokens=4000):
    key = config.anthropic_key()
    if not key:
        raise AIError("AI is not configured (set ANTHROPIC_API_KEY in backend/.env). Using rule-based suggestions.")
    body = json.dumps({"model": config.AI_MODEL, "max_tokens": max_tokens, "system": system,
                       "messages": [{"role": "user", "content": user_text}]}).encode()
    req = urllib.request.Request(config.AI_API_URL, data=body, method="POST", headers={
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    try:
        with urllib.request.urlopen(req, timeout=config.AI_TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise AIError(f"AI service returned HTTP {e.code}.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise AIError("AI service is unreachable or timed out.") from e
    except ValueError as e:
        raise AIError("AI service returned an unreadable response.") from e
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    if not text.strip():
        raise AIError("AI service returned an empty response.")
    return text


def _norm_conf(v):
    if isinstance(v, (int, float)):
        return "high" if v >= 0.8 else "medium" if v >= 0.5 else "low"
    v = str(v).strip().lower()
    return v if v in ("low", "medium", "high") else "medium"


def _parse_ai(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        data = json.loads(text)
        items = data["recommendations"]
        assert isinstance(items, list)
    except (ValueError, KeyError, AssertionError, TypeError) as e:
        raise AIError("AI response was malformed (not the expected JSON structure).") from e
    recs = []
    for i, r in enumerate(items[:3]):
        if not isinstance(r, dict) or not r.get("issue") or not r.get("recommendation"):
            continue
        code = r.get("optimized_code")
        if not isinstance(code, str) or not code.strip() or len(code) > config.MAX_SOURCE_CHARS:
            code = None
        recs.append({
            "id": f"ai{i + 1}", "source": "ai", "related_pattern": str(r.get("related_pattern") or "general"),
            "issue": str(r["issue"]), "why_it_matters": str(r.get("why_it_matters", "")),
            "recommendation": str(r["recommendation"]), "optimized_code": code,
            "expected_impact": str(r.get("expected_impact", "")), "confidence": _norm_conf(r.get("confidence", "medium")),
            "assumptions": [str(a) for a in r.get("assumptions", []) if isinstance(a, (str, int, float))][:6]})
    if not recs:
        raise AIError("AI response contained no usable recommendations.")
    return recs


def rule_based_recommendations(source, analysis):
    recs, hoisted, changes = [], None, []
    patterns = analysis.get("patterns", [])
    if any(p["auto_fixable"] for p in patterns):
        hoisted, changes = apply_hoisting(source)
    for p in patterns:
        code = hoisted if (p["auto_fixable"] and hoisted and hoisted != source) else None
        recs.append({
            "id": f"rb-{p['id']}", "source": "rule-based", "related_pattern": p["pattern"], "line": p["line"],
            "issue": f"{p['pattern']} (line {p['line']})", "why_it_matters": f"{p['explanation']} {p['performance_impact']}",
            "recommendation": p["suggestion"], "optimized_code": code,
            "expected_impact": ("Fewer redundant operations at run time; " if code else "Potentially less work per run; ")
            + "effect on time, energy and carbon must be confirmed by re-measurement.",
            "confidence": "high" if code else "medium",
            "assumptions": (["The transformation is applied only when the hoisted expression provably does not change "
                             "inside the loop (conservative rule)."] if code else ["Advisory only: no automatic code change is generated."]),
            "changes": changes if code else []})
    if analysis.get("optimization_level") == "O0":
        recs.append({"id": "rb-o2", "source": "rule-based", "related_pattern": "Compiler optimization level",
                     "issue": "Compiled without optimization (-O0)",
                     "why_it_matters": "-O0 disables most compiler optimizations such as loop-invariant code motion.",
                     "recommendation": "Re-run the analysis with -O2 and compare.", "optimized_code": None,
                     "expected_impact": "Typically faster generated code; confirm by re-analysis.", "confidence": "medium",
                     "assumptions": ["This is a compiler-flag change, not a source change."], "changes": []})
    return recs


def get_recommendations(source, analysis):
    """Returns {"ai": status, "recommendations": [...]}. Never raises."""
    status = {**ai_status(), "used": False, "error": None}
    rule = rule_based_recommendations(source, analysis)
    ctx = {"source_code": source, "compiler": analysis["compilation"]["compiler"],
           "optimization_level": analysis["optimization_level"],
           "compilation": {"success": analysis["compilation"]["success"],
                           "warnings": analysis["compilation"]["warnings"][:10]},
           "performance": {k: analysis["performance"].get(k) for k in
                           ("execution_time_ms", "cpu_time_ms", "peak_memory_mb", "exit_code")},
           "estimated_energy_joules": analysis["energy"].get("energy_joules"),
           "estimated_carbon_gco2e": analysis["carbon"].get("carbon_gco2e"),
           "detected_patterns": [{k: p[k] for k in ("pattern", "line", "severity", "explanation")}
                                 for p in analysis["patterns"]]}
    try:
        recs = _parse_ai(_post(_SYSTEM, json.dumps(ctx)))
        status["used"] = True
        if not any(r["optimized_code"] for r in recs):  # keep a verifiable candidate if we have one
            recs += [r for r in rule if r["optimized_code"]][:1]
        return {"ai": status, "recommendations": recs}
    except AIError as e:
        status["error"] = str(e)
        return {"ai": status, "recommendations": rule}


def explain(recommendation, source):
    """Longer explanation for one recommendation. Falls back to the stored reasoning."""
    prompt = ("Explain in 3-5 short sentences, for a computer science student, why this optimization matters "
              "for performance and energy in C. Do not state any numeric measurements.\n\n"
              f"Recommendation: {json.dumps(recommendation)[:3000]}\n\nProgram:\n{source[:4000]}")
    try:
        return {"explanation": _post("You are a concise compiler-optimization tutor.", prompt, 600).strip(), "source": "ai"}
    except AIError as e:
        parts = [recommendation.get("why_it_matters"), recommendation.get("recommendation"),
                 recommendation.get("expected_impact")]
        return {"explanation": " ".join(p for p in parts if p) or "No further explanation is available.",
                "source": "rule-based", "note": str(e)}
