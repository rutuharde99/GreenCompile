"""Small C lexical helpers shared by the analysis, pattern and safety code.

This is NOT a full C parser. It blanks comments/strings (preserving offsets and
line numbers), tokenises, and finds brace/paren-balanced constructs.
"""
import re

KEYWORDS = {
    "auto", "break", "case", "char", "const", "continue", "default", "do",
    "double", "else", "enum", "extern", "float", "for", "goto", "if", "inline",
    "int", "long", "register", "restrict", "return", "short", "signed",
    "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned",
    "void", "volatile", "while", "_Bool",
}

TYPE_RE = (
    r"(?:(?:const|static|volatile|register|unsigned|signed)\s+)*"
    r"(?:int|char|short|long|float|double|size_t|bool|_Bool|u?int\d+_t)"
    r"(?:\s+(?:long|int|double))*"
)


def blank_comments_and_strings(src: str) -> str:
    """Replace comments and string/char literal contents with spaces.
    Output has identical length and newlines, so offsets/lines still match."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif c == "/" and nxt == "*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append(re.sub(r"[^\n]", " ", src[i:j]))
            i = j
        elif c in "\"'":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                if src[j] == "\\":
                    j += 1
                j += 1
            closed = j < n and src[j] == c
            end = j + 1 if closed else min(j, n)
            inner = end - i - (2 if closed else 1)
            out.append(c + " " * max(inner, 0) + (c if closed else ""))
            i = end
        else:
            out.append(c)
            i += 1
    return "".join(out)


def blank_preprocessor(clean: str) -> str:
    """Blank preprocessor directive lines (keeps offsets)."""
    lines, out, cont = clean.split("\n"), [], False
    for line in lines:
        if cont or line.lstrip().startswith("#"):
            cont = line.rstrip().endswith("\\")
            out.append(" " * len(line))
        else:
            out.append(line)
    return "\n".join(out)


def preprocessor_lines(clean: str):
    """[(line_no, text)] for directives, from the comment-blanked source."""
    return [(i + 1, l.strip()) for i, l in enumerate(clean.split("\n")) if l.lstrip().startswith("#")]


_TOKEN_RE = re.compile(
    r'"[^"\n]*"|\'[^\'\n]*\'|[A-Za-z_]\w*|\d[\w.]*|<<=|>>=|->|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%&|^]=|\S'
)


def tokenize(pp_clean: str):
    return _TOKEN_RE.findall(pp_clean)


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def match_close(text: str, open_idx: int) -> int:
    """Index of the bracket matching text[open_idx], or -1."""
    pairs = {"(": ")", "{": "}", "[": "]"}
    o = text[open_idx]
    c = pairs[o]
    depth = 0
    for i in range(open_idx, len(text)):
        if text[i] == o:
            depth += 1
        elif text[i] == c:
            depth -= 1
            if depth == 0:
                return i
    return -1


def find_functions(pp: str):
    """Function definitions at brace depth 0 (heuristic)."""
    depth_at, d = [], 0
    for ch in pp:
        depth_at.append(d)
        if ch == "{":
            d += 1
        elif ch == "}":
            d = max(0, d - 1)
    funcs = []
    pat = re.compile(r"(?m)^[ \t]*([A-Za-z_][\w \t\*]*?)\b([A-Za-z_]\w*)\s*\(([^;{}]*?)\)\s*\{")
    for m in pat.finditer(pp):
        name = m.group(2)
        if name in KEYWORDS or depth_at[m.start()] != 0:
            continue
        funcs.append({"name": name, "line": line_of(pp, m.start(2)),
                      "return_type": m.group(1).strip(), "params": m.group(3).strip(),
                      "body_start": m.end(), "body_end": match_close(pp, m.end() - 1)})
    return funcs


def find_loops(pp: str):
    """for / while / do-while loops with body spans (offsets into pp)."""
    loops, skip_tail = [], set()
    for m in re.finditer(r"\bdo\s*\{", pp):
        ob = m.end() - 1
        cb = match_close(pp, ob)
        if cb == -1:
            continue
        tail = re.match(r"\s*while\s*\(", pp[cb + 1:])
        if tail:
            skip_tail.add(cb + 1 + tail.group(0).rfind("while"))
        loops.append({"kind": "do", "start": m.start(), "cond": "", "header": "",
                      "body_start": ob + 1, "body_end": cb, "braced": True})
    for m in re.finditer(r"\b(for|while)\s*\(", pp):
        if m.start() in skip_tail:
            continue
        op = m.end() - 1
        cp = match_close(pp, op)
        if cp == -1:
            continue
        header = pp[op + 1:cp]
        cond = header
        if m.group(1) == "for":
            parts = _split_top(header, ";")
            cond = parts[1] if len(parts) > 1 else ""
        k = cp + 1
        while k < len(pp) and pp[k].isspace():
            k += 1
        if k < len(pp) and pp[k] == "{":
            cb = match_close(pp, k)
            if cb == -1:
                continue
            bs, be, braced = k + 1, cb, True
        else:
            end = pp.find(";", k)
            if end == -1:
                continue
            bs, be, braced = k, end + 1, False
        loops.append({"kind": m.group(1), "start": m.start(), "cond": cond.strip(),
                      "header": header, "header_start": op + 1, "header_end": cp,
                      "body_start": bs, "body_end": be, "braced": braced})
    for lp in loops:
        lp["line"] = line_of(pp, lp["start"])
        lp["depth"] = 1 + sum(1 for o in loops if o is not lp and o["body_start"] <= lp["start"] < o["body_end"])
        lp["body"] = pp[lp["body_start"]:lp["body_end"]]
    loops.sort(key=lambda l: l["start"])
    return loops


def _split_top(text: str, sep: str):
    parts, depth, cur = [], 0, []
    for ch in text:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return parts


def split_statements(body: str, base: int = 0):
    """Top-level statements of a block: [(start_offset, text)] (offsets relative to base)."""
    stmts, depth_b, depth_p, start = [], 0, 0, 0
    for i, ch in enumerate(body):
        if ch == "(":
            depth_p += 1
        elif ch == ")":
            depth_p -= 1
        elif ch == "{":
            depth_b += 1
        elif ch == "}":
            depth_b -= 1
            if depth_b == 0 and depth_p == 0:
                stmts.append((base + start, body[start:i + 1]))
                start = i + 1
        elif ch == ";" and depth_b == 0 and depth_p == 0:
            stmts.append((base + start, body[start:i + 1]))
            start = i + 1
    return stmts
