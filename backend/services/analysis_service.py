"""Lightweight static analysis of C source (lexical + rule based; NOT a full Clang AST)."""
import re

from services.c_lexer import (KEYWORDS, TYPE_RE, _split_top, blank_comments_and_strings,
                              blank_preprocessor, find_functions, find_loops, line_of, tokenize)

_DECL_RE = re.compile(r"(?<![\w])(" + TYPE_RE + r")\s+([^;{}]*);")


def find_declarations(pp: str):
    """[(name, type, offset)] scalar/array/pointer declarators (heuristic)."""
    decls = []
    for m in _DECL_RE.finditer(pp):
        rest, base = m.group(2), m.start(2)
        if re.match(r"\s*\**\s*\w+\s*\(", rest) and "=" not in rest.split("(")[0]:
            continue  # function prototype
        pos = 0
        for part in _split_top(rest, ","):
            nm = re.match(r"\s*(\**)\s*([A-Za-z_]\w*)", part)
            if nm and nm.group(2) not in KEYWORDS:
                decls.append((nm.group(2), m.group(1).strip() + (" " + nm.group(1) if nm.group(1) else ""),
                              base + pos + nm.start(2), bool(nm.group(1)) or "[" in part))
            pos += len(part) + 1
    return decls


def analyze_static(source: str) -> dict:
    clean = blank_comments_and_strings(source)
    pp = blank_preprocessor(clean)
    tokens = tokenize(pp)
    funcs = find_functions(pp)
    loops = find_loops(pp)
    decls = find_declarations(pp)

    count = lambda pat: len(re.findall(pat, pp))
    ifs, elses, switches, cases = count(r"\bif\b"), count(r"\belse\b"), count(r"\bswitch\b"), count(r"\bcase\b")
    ternaries = pp.count("?")
    logical = pp.count("&&") + pp.count("||")
    decision_points = ifs + len(loops) + cases + ternaries + logical
    identifiers = {t for t in tokens if re.match(r"[A-Za-z_]\w*$", t) and t not in KEYWORDS}
    calls = {}
    for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", pp):
        n = m.group(1)
        if n not in KEYWORDS and n not in {f["name"] for f in funcs}:
            calls[n] = calls.get(n, 0) + 1

    return {
        "method": "Lightweight lexical + rule-based analysis (not a full Clang AST / semantic analysis).",
        "lines_of_code": sum(1 for l in pp.split("\n") if l.strip()),
        "tokens": len(tokens),
        "unique_identifiers": len(identifiers),
        "functions": [{"name": f["name"], "line": f["line"], "return_type": f["return_type"],
                       "params": f["params"]} for f in funcs],
        "function_count": len(funcs),
        "loops": [{"kind": l["kind"], "line": l["line"], "depth": l["depth"], "condition": l["cond"]} for l in loops],
        "loop_count": len(loops),
        "max_loop_depth": max((l["depth"] for l in loops), default=0),
        "variables": [{"name": n, "type": t, "line": line_of(pp, off)} for n, t, off, _ in decls],
        "variable_count": len(decls),
        "branches": {"if": ifs, "else": elses, "switch": switches, "case": cases, "ternary": ternaries},
        "branch_count": ifs + switches + ternaries,
        "cyclomatic_complexity": 1 + decision_points,
        "external_calls": sorted(calls.items(), key=lambda kv: -kv[1])[:10],
    }
