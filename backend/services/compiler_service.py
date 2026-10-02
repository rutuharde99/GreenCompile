"""Real C compilation through an installed Clang (or GCC) with controlled subprocess use."""
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from functools import lru_cache

from config import COMPILE_TIMEOUT_S, MAX_OUTPUT_BYTES

IS_WINDOWS = sys.platform.startswith("win")
DIAG_RE = re.compile(
    r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+): (?P<sev>warning|error|fatal error|note): (?P<msg>.*)$")

_WIN_CANDIDATES = {
    "clang": [r"C:\Program Files\LLVM\bin\clang.exe", r"C:\Program Files (x86)\LLVM\bin\clang.exe"],
    "gcc": [r"C:\msys64\ucrt64\bin\gcc.exe", r"C:\msys64\mingw64\bin\gcc.exe", r"C:\MinGW\bin\gcc.exe"],
}

SETUP_HELP = {
    "clang": ("Clang was not found on PATH. Install LLVM/Clang: "
              "Windows - `winget install LLVM.LLVM` (then reopen the terminal); "
              "Ubuntu/Debian - `sudo apt install clang`; macOS - `xcode-select --install`."),
    "gcc": ("GCC was not found on PATH. Install it: Windows - MSYS2/MinGW-w64 (`pacman -S mingw-w64-ucrt-x86_64-gcc`); "
            "Ubuntu/Debian - `sudo apt install gcc`; macOS - `xcode-select --install`."),
}


def _find(name: str):
    path = shutil.which(name)
    if path:
        return path
    if IS_WINDOWS:
        for cand in _WIN_CANDIDATES.get(name, []):
            if os.path.exists(cand):
                return cand
    return None


@lru_cache(maxsize=4)
def compiler_version(path: str) -> str:
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=10)
        return (out.stdout or out.stderr).strip().splitlines()[0]
    except Exception:
        return "unknown"


def resolve_compiler(requested: str):
    """Returns (name, path, note). If the requested compiler is missing but the other
    exists we use it and SAY SO; if neither exists path is None."""
    requested = requested.lower()
    other = "gcc" if requested == "clang" else "clang"
    path = _find(requested)
    if path:
        return requested, path, None
    alt = _find(other)
    if alt:
        return other, alt, (f"{requested} was not found, so {other} was used instead. "
                            f"{SETUP_HELP[requested]}")
    return requested, None, SETUP_HELP[requested] + " GCC was not found either."


def environment_info():
    info = {"os": platform.system(), "os_release": platform.release(), "python": platform.python_version(),
            "compilers": {}}
    for name in ("clang", "gcc"):
        p = _find(name)
        info["compilers"][name] = {"available": bool(p), "version": compiler_version(p) if p else None,
                                   "setup_hint": None if p else SETUP_HELP[name]}
    try:
        import psutil  # noqa: F401
        info["psutil"] = True
    except ImportError:
        info["psutil"] = False
    return info


def _parse_diagnostics(stderr: str):
    warnings, errors = [], []
    for raw in stderr.splitlines():
        m = DIAG_RE.match(raw.strip())
        if not m or m["sev"] == "note":
            continue
        item = {"line": int(m["line"]), "column": int(m["col"]), "message": m["msg"].strip()}
        (warnings if m["sev"] == "warning" else errors).append(item)
    return warnings, errors


def compile_source(source: str, requested: str, opt: str, workdir: str, stem: str = "prog"):
    """Compile `source` inside `workdir`. Returns a result dict; 'binary_path' is internal."""
    name, path, note = resolve_compiler(requested)
    base = {"success": False, "compiler": name, "requested_compiler": requested, "optimization": opt,
            "warnings": [], "errors": [], "stdout": "", "stderr": "", "exit_code": None,
            "duration_ms": None, "note": note, "setup_required": path is None,
            "compiler_version": None, "binary_path": None}
    if path is None:
        base["errors"] = [{"line": None, "column": None, "message": note}]
        return base
    base["compiler_version"] = compiler_version(path)

    src = os.path.join(workdir, f"{stem}.c")
    exe = os.path.join(workdir, f"{stem}.exe" if IS_WINDOWS else stem)
    with open(src, "w", encoding="utf-8", newline="\n") as f:
        f.write(source)

    cmd = [path, f"-{opt}", "-Wall", "-Wextra", "-fdiagnostics-color=never", src, "-o", exe]
    if not IS_WINDOWS:
        cmd.append("-lm")
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=COMPILE_TIMEOUT_S,
                              stdin=subprocess.DEVNULL,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired:
        base["errors"] = [{"line": None, "column": None,
                           "message": f"Compilation timed out after {COMPILE_TIMEOUT_S:.0f}s."}]
        return base
    base["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    base["exit_code"] = proc.returncode
    base["stdout"] = proc.stdout[:MAX_OUTPUT_BYTES]
    base["stderr"] = proc.stderr[:MAX_OUTPUT_BYTES]
    warnings, errors = _parse_diagnostics(proc.stderr)
    base["warnings"], base["errors"] = warnings, errors
    base["success"] = proc.returncode == 0 and os.path.exists(exe)
    if proc.returncode != 0 and not errors:
        base["errors"] = [{"line": None, "column": None,
                           "message": (proc.stderr.strip().splitlines() or ["Compilation failed."])[-1]}]
    if base["success"]:
        base["binary_path"] = exe
        base["executable_size_bytes"] = os.path.getsize(exe)
    return base


def public(compilation: dict) -> dict:
    """Strip internal fields before sending to the client."""
    return {k: v for k, v in compilation.items() if k != "binary_path"}
