"""Rule-based detection of inefficient patterns + a small SAFE loop-invariant hoisting transform."""
import re

from services.analysis_service import find_declarations
from services.c_lexer import (KEYWORDS, blank_comments_and_strings, blank_preprocessor, find_functions,
                              find_loops, line_of, split_statements)

IO_FUNCS = {"printf", "puts", "putchar", "fputs", "fprintf", "scanf", "fgets", "getchar", "fflush"}
ALLOC_FUNCS = {"malloc", "calloc", "realloc"}
PURE_MATH = {"sqrt", "pow", "sin", "cos", "tan", "exp", "log", "log10", "fabs", "floor", "ceil", "sqrtf", "powf"}

_ASSIGN_RE = re.compile(r"^(\s*)([A-Za-z_]\w*)\s*=(?!=)\s*(.+?)\s*;\s*$", re.S)
_PURE_EXPR_RE = re.compile(r"^[A-Za-z0-9_+\-*/%().\s]+$")


def _prep(source):
    pp = blank_preprocessor(blank_comments_and_strings(source))
    return pp, find_loops(pp), find_declarations(pp), find_functions(pp)


def _modified(ident, region):
    e = re.escape(ident)
    return bool(
        re.search(rf"\b{e}\b\s*(\+\+|--|[-+*/%&|^]=|<<=|>>=|=(?!=))", region)
        or re.search(rf"(\+\+|--)\s*{e}\b", region)
        or re.search(rf"(?<!&)&\s*{e}\b", region)
        or re.search(rf"\b(scanf|fscanf|sscanf|fgets|memset|memcpy|strcpy|strcat)\s*\([^;]*\b{e}\b", region))


def _idents(expr):
    return {t for t in re.findall(r"[A-Za-z_]\w*", expr) if t not in KEYWORDS}


def _numeric_only_divisors_ok(rhs):
    for m in re.finditer(r"[/%]\s*([^\s+\-*/%()]*)", rhs):
        tok = m.group(1)
        if not re.fullmatch(r"\d+(\.\d+)?", tok) or float(tok) == 0:
            return False
    return True


def find_hoistable(source: str):
    """Loop-invariant scalar assignments that can be hoisted safely (conservative)."""
    pp, loops, decls, funcs = _prep(source)
    found = []
    for lp in loops:
        if not lp["braced"]:
            continue
        line_start = pp.rfind("\n", 0, lp["start"]) + 1
        if pp[line_start:lp["start"]].strip():
            continue
        before = pp[:lp["start"]].rstrip()
        if before and before[-1] not in ";{}":
            continue  # loop is the un-braced body of if/else/for/while
        region = pp[lp["start"]:lp["body_end"]]
        inner_decl_names = {n for n, _, off, _ in decls if lp["start"] <= off < lp["body_end"]}
        for off, text in split_statements(lp["body"], lp["body_start"]):
            m = _ASSIGN_RE.match(text)
            if not m:
                continue
            lhs, rhs = m.group(2), m.group(3)
            if (not _PURE_EXPR_RE.match(rhs) or re.search(r"[\w)]\s*\(", rhs) or "++" in rhs or "--" in rhs
                    or not re.search(r"[\w)]\s*[+\-*/%]\s*[\w(]", rhs)):
                continue
            ids = _idents(rhs)
            if lhs in ids or lhs in inner_decl_names or not _numeric_only_divisors_ok(rhs):
                continue
            # lhs must be a plain scalar declared before the loop
            ldecl = [d for d in decls if d[0] == lhs and d[2] < lp["start"] and d[2] not in
                     range(lp["start"], lp["body_end"])]
            if not ldecl or ldecl[-1][3] or re.search(rf"volatile[^;]*\b{re.escape(lhs)}\b", pp):
                continue
            ok = True
            for ident in ids:
                dd = [d for d in decls if d[0] == ident and d[2] < lp["start"]]
                is_param = any(f["body_start"] <= lp["start"] <= (f["body_end"] or 0) and
                               re.search(rf"\b{re.escape(ident)}\b", f["params"]) for f in funcs)
                if ((not dd and not is_param) or ident in inner_decl_names or _modified(ident, region)
                        or re.search(rf"volatile[^;]*\b{re.escape(ident)}\b", pp)):
                    ok = False
                    break
            if not ok:
                continue
            rhs_start = off + text.index(rhs, m.start(3))
            found.append({"loop_line": lp["line"], "loop_depth": lp["depth"], "line": line_of(pp, rhs_start),
                          "lhs": lhs, "rhs": rhs, "type": ldecl[-1][1], "rhs_span": (rhs_start, rhs_start + len(rhs)),
                          "insert_at": line_start, "indent": re.match(r"[ \t]*", pp[line_start:]).group(0)})
    return found


def apply_hoisting(source: str):
    """Apply all safe hoists. Returns (new_source, [change descriptions])."""
    cands = find_hoistable(source)
    if not cands:
        return source, []
    used = set(re.findall(r"\bgc_tmp\d+\b", source))
    n, edits, changes = 0, [], []
    for c in cands:
        n += 1
        while f"gc_tmp{n}" in used:
            n += 1
        name = f"gc_tmp{n}"
        used.add(name)
        edits.append((c["rhs_span"][0], c["rhs_span"][1] - c["rhs_span"][0], name))
        edits.append((c["insert_at"], 0, f"{c['indent']}{c['type']} {name} = {c['rhs']};  /* hoisted: loop-invariant */\n"))
        changes.append({"line": c["line"], "description":
                        f"Moved loop-invariant expression '{c['rhs']}' (assigned to '{c['lhs']}') out of the loop "
                        f"into '{name}'."})
    out = source
    for start, length, text in sorted(edits, key=lambda e: (e[0], e[1] == 0), reverse=True):
        out = out[:start] + text + out[start + length:]
    return out, changes


def _finding(pid, pattern, line, severity, explanation, perf, energy, suggestion, snippet="", fixable=False):
    return {"id": pid, "pattern": pattern, "line": line, "severity": severity, "explanation": explanation,
            "performance_impact": perf, "energy_impact": energy, "suggestion": suggestion,
            "snippet": snippet.strip()[:160], "auto_fixable": fixable}


def detect_patterns(source: str):
    pp, loops, decls, _ = _prep(source)
    lines = source.split("\n")
    snip = lambda ln: lines[ln - 1] if 0 < ln <= len(lines) else ""
    out, seen = [], set()

    def add(*a, **k):
        f = _finding(f"p{len(out) + 1}", *a, **k)
        key = (f["pattern"], f["line"])
        if key not in seen:
            seen.add(key)
            out.append(f)

    for c in find_hoistable(source):
        add("Repeated computation inside loop", c["line"], "high" if c["loop_depth"] >= 2 else "medium",
            f"'{c['lhs']} = {c['rhs']}' uses only values that never change inside the loop starting at line "
            f"{c['loop_line']}, yet it is recomputed on every iteration.",
            "Wasted arithmetic each iteration. Note: optimizing compilers (-O1 and above) often hoist this "
            "automatically, so the measured gain is mainly at -O0 or when the compiler cannot prove it safe.",
            "Less redundant CPU work means proportionally less estimated energy for the loop.",
            "Move the loop-invariant calculation before the loop and reuse the result.", snip(c["line"]), True)

    for lp in loops:
        cond_calls = [m.group(1) for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", lp["cond"]) if m.group(1) not in KEYWORDS]
        for call in cond_calls:
            add("Inefficient loop condition", lp["line"], "medium" if call == "strlen" else "low",
                f"'{call}(...)' is called in the loop condition, so it is re-evaluated every iteration.",
                "Turns an O(n) loop into O(n^2) for strlen-style calls." if call == "strlen"
                else "Extra function call per iteration.",
                "Extra work per iteration increases estimated energy.",
                "Compute the value once before the loop and compare against the stored variable.", snip(lp["line"]))
        body = lp["body"]
        for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", body):
            name, off = m.group(1), lp["body_start"] + m.start()
            ln = line_of(pp, off)
            if name in IO_FUNCS:
                add("Excessive console I/O", ln, "high" if lp["depth"] >= 2 else "medium",
                    f"'{name}' is called inside a loop (loop at line {lp['line']}), performing I/O every iteration.",
                    "Console I/O is far slower than computation and often dominates run time.",
                    "I/O-heavy loops keep the process busy longer, raising estimated energy.",
                    "Accumulate output in a buffer and print once, or reduce how often you print.", snip(ln))
            elif name in ALLOC_FUNCS:
                add("Unnecessary memory allocation", ln, "medium",
                    f"'{name}' is called inside a loop (loop at line {lp['line']}), allocating on every iteration.",
                    "Repeated allocation/free adds allocator overhead and can fragment memory.",
                    "Allocator overhead increases CPU time and therefore estimated energy.",
                    "Allocate once before the loop and reuse the buffer.", snip(ln))
            elif name in PURE_MATH:
                end = pp.find(")", off)
                args = pp[off + len(name) + 1:end] if end != -1 else ""
                ids = _idents(args)
                region = pp[lp["start"]:lp["body_end"]]
                if args.strip() and all(any(d[0] == i and d[2] < lp["start"] for d in decls) and not
                                        _modified(i, region) for i in ids):
                    add("Unnecessary repeated work", ln, "medium",
                        f"'{name}({args.strip()})' has arguments that do not change inside the loop "
                        f"(line {lp['line']}) but is evaluated every iteration.",
                        "Math library calls are comparatively expensive to repeat.",
                        "Repeated expensive calls raise estimated energy.",
                        "Compute the result once before the loop.", snip(ln))
        # duplicate identical expressions within one loop body
        exprs = [m.group(1).strip() for m in re.finditer(r"=(?!=)\s*([^;=]+[+\-*/%][^;=]+);", body)]
        for e in {x for x in exprs if exprs.count(x) > 1}:
            off = lp["body_start"] + body.find(e)
            add("Repeated identical expression", line_of(pp, off), "low",
                f"The expression '{e}' appears more than once in the same loop body.",
                "Duplicate computation (common sub-expression) each iteration.",
                "Minor extra CPU work.", "Store the result in a temporary variable and reuse it.", snip(line_of(pp, off)))

    if any(re.search(rf"\b{f}\s*\(", pp) for f in ALLOC_FUNCS) and not re.search(r"\bfree\s*\(", pp):
        m = next(re.finditer(r"\b(malloc|calloc|realloc)\s*\(", pp))
        add("Allocation without free", line_of(pp, m.start()), "low",
            "Memory is allocated but 'free' is never called in this program.",
            "Leaked memory increases peak memory use.", "Higher memory footprint.",
            "Release allocated memory with free() once it is no longer needed.", snip(line_of(pp, m.start())))

    for m in re.finditer(r"\b([A-Za-z_]\w*)\s*=\s*\1\s*;", pp):
        add("Redundant operation", line_of(pp, m.start()), "low", f"'{m.group(0)}' assigns a variable to itself.",
            "No effect; wasted instruction.", "Negligible.", "Remove the statement.", snip(line_of(pp, m.start())))
    for m in re.finditer(r"[\w)]\s*\*\s*1(?![\w.])|(?<![\w.])1\s*\*\s*[\w(]|[\w)]\s*[+\-]\s*0(?![\w.xX])", pp):
        add("Redundant operation", line_of(pp, m.start()), "low",
            "An arithmetic identity (x*1, x+0 or x-0) was found; it does not change the value.",
            "Wasted instruction (usually folded away by the compiler).", "Negligible.",
            "Simplify the expression.", snip(line_of(pp, m.start())))
    return out
