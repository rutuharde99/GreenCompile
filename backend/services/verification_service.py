"""Correctness verification: only says 'verified' when the checks actually pass."""
import re

INPUT_FUNCS = r"\b(scanf|fscanf|gets|fgets|getchar|getc|fgetc|read)\s*\("
NONDET_FUNCS = r"\b(time|clock|rand|srand|clock_gettime|gettimeofday)\s*\("
LABELS = {"verified": "Functional Correctness Verified", "failed": "Verification Failed",
          "inconclusive": "Verification Inconclusive"}


def _check(name, passed, detail):
    return {"name": name, "passed": passed, "detail": detail}


def verify(orig_src, opt_src, orig, opt):
    """orig/opt are full analysis dicts (compilation + performance)."""
    checks, scope = [], "stdout and exit status compared for one execution with empty stdin"

    def result(status, reason):
        return {"status": status, "label": LABELS[status], "reason": reason, "checks": checks, "scope": scope}

    if orig_src.strip() == opt_src.strip():
        return result("inconclusive", "The optimized code is identical to the original; nothing to verify.")
    oc, pc = orig["compilation"], opt["compilation"]
    checks.append(_check("Original compiles", oc["success"], "ok" if oc["success"] else "original does not compile"))
    checks.append(_check("Optimized compiles", pc["success"],
                         "ok" if pc["success"] else (pc["errors"][0]["message"] if pc["errors"] else "failed")))
    if not pc["success"]:
        return result("failed", "The optimized code does not compile.")
    if not oc["success"]:
        return result("inconclusive", "The original code does not compile, so there is no baseline to compare with.")
    op, pp = orig["performance"], opt["performance"]
    if op.get("timed_out"):
        return result("inconclusive", "The original program timed out, so its behaviour could not be compared.")
    if pp.get("timed_out"):
        checks.append(_check("Optimized terminates", False, "optimized program timed out"))
        return result("failed", "The optimized program timed out while the original finished.")
    checks.append(_check("Exit status matches", op["exit_code"] == pp["exit_code"],
                         f"original={op['exit_code']}, optimized={pp['exit_code']}"))
    same_out = op["stdout"] == pp["stdout"]
    checks.append(_check("Program output matches", same_out,
                         "identical stdout" if same_out else "stdout differs between original and optimized"))
    det = op.get("deterministic_output", True) and pp.get("deterministic_output", True)
    checks.append(_check("Output is deterministic across runs", det, "repeated runs agree" if det else "output varies between runs"))
    if not (op["exit_code"] == pp["exit_code"] and same_out):
        if not det:
            return result("inconclusive", "Outputs differ, but the program is non-deterministic so this is not proof of a bug.")
        return result("failed", "The optimized program's observable behaviour differs from the original.")
    if not det:
        return result("inconclusive", "Program output varies between runs, so equality is not meaningful.")
    clean = re.sub(r"//.*|/\*.*?\*/", "", orig_src, flags=re.S)
    if re.search(INPUT_FUNCS, clean):
        return result("inconclusive", "The program reads input; only the empty-input path was compared.")
    if re.search(NONDET_FUNCS, clean):
        return result("inconclusive", "The program uses time/random functions, so identical output is not conclusive.")
    return result("verified", "Both programs compiled, exited with the same status and produced identical output.")
