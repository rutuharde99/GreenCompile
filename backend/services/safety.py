"""Best-effort request validation before any code is compiled or executed.

This is a defence-in-depth filter for a LOCAL academic tool, NOT a sandbox.
"""
import re

from config import MAX_SOURCE_CHARS
from services.c_lexer import blank_comments_and_strings, preprocessor_lines

ALLOWED_HEADERS = {
    "stdio.h", "stdlib.h", "string.h", "math.h", "stdint.h", "stdbool.h",
    "ctype.h", "time.h", "limits.h", "float.h", "stddef.h", "errno.h",
    "assert.h", "inttypes.h", "stdarg.h",
}
FORBIDDEN_IDENTS = {
    "system", "popen", "fork", "vfork", "execl", "execle", "execlp", "execv",
    "execve", "execvp", "spawn", "spawnl", "spawnv", "socket", "connect",
    "bind", "listen", "accept", "kill", "remove", "unlink", "rename", "rmdir",
    "mkdir", "chmod", "chown", "fopen", "freopen", "open", "creat", "dlopen",
    "ptrace", "asm", "__asm__", "__asm", "WinExec", "CreateProcess",
    "CreateProcessA", "ShellExecute", "ShellExecuteA", "LoadLibrary",
    "LoadLibraryA", "tmpfile", "setuid", "setgid",
}


class SourceRejected(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def validate_source(source: str) -> None:
    if not isinstance(source, str) or not source.strip():
        raise SourceRejected("empty_source", "The source code is empty.")
    if len(source) > MAX_SOURCE_CHARS:
        raise SourceRejected("source_too_large",
                             f"Source is too large ({len(source)} chars). Limit is {MAX_SOURCE_CHARS}.")
    if "\x00" in source:
        raise SourceRejected("invalid_source", "Source contains NUL bytes.")
    clean = blank_comments_and_strings(source)
    for line_no, text in preprocessor_lines(clean):
        m = re.match(r"#\s*include\s*(.*)", text)
        if m:
            arg = m.group(1).strip()
            hm = re.match(r"<([^>]+)>", arg)
            if not hm or hm.group(1) not in ALLOWED_HEADERS:
                raise SourceRejected(
                    "forbidden_include",
                    f"Line {line_no}: only standard headers are allowed "
                    f"({', '.join(sorted(ALLOWED_HEADERS))}).")
        elif re.match(r"#\s*(include_next|import|embed)\b", text):
            raise SourceRejected("forbidden_directive", f"Line {line_no}: directive not allowed.")
        if "##" in text:
            raise SourceRejected("forbidden_directive", f"Line {line_no}: token pasting (##) is not allowed.")
    for m in re.finditer(r"\b([A-Za-z_]\w*)\b", clean):
        if m.group(1) in FORBIDDEN_IDENTS:
            line = clean.count("\n", 0, m.start()) + 1
            raise SourceRejected(
                "forbidden_call",
                f"Line {line}: '{m.group(1)}' is blocked (process, file-system and network "
                "access are not allowed in analysed programs).")
