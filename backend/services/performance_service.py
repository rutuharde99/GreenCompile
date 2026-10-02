"""Safe execution + measurement of compiled programs.

Measured: wall-clock time (includes process start-up), exit status, stdout/stderr.
CPU time + peak memory: exact on Linux/macOS (wait4 rusage); on Windows sampled
through psutil (best effort, may be unavailable for very short programs).
Anything that cannot be collected is returned as null with an explanation - never invented.
"""
import os
import signal
import statistics
import subprocess
import sys
import tempfile
import threading
import time

from config import MAX_OUTPUT_BYTES, MEMORY_LIMIT_MB, RUN_TIMEOUT_S, RUNS

IS_WINDOWS = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"
_LOCK = threading.Lock()  # one measurement at a time -> fairer timings

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None

if not IS_WINDOWS:
    import resource


def _safe_env():
    keep = ("PATH", "SYSTEMROOT", "TEMP", "TMP", "LANG")
    return {k: v for k, v in os.environ.items() if k in keep}


def _limits():  # POSIX preexec
    resource.setrlimit(resource.RLIMIT_CPU, (int(RUN_TIMEOUT_S) + 2, int(RUN_TIMEOUT_S) + 2))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_MB * 1024 * 1024,) * 2)
    except (ValueError, OSError):
        pass


def _read(path):
    try:
        with open(path, "rb") as f:
            return f.read(MAX_OUTPUT_BYTES).decode("utf-8", errors="replace")
    except OSError:
        return ""


def _describe_exit(code, timed_out):
    if timed_out:
        return "timeout"
    if code is None:
        return None
    if code < 0:
        try:
            return f"killed by signal {signal.Signals(-code).name}"
        except ValueError:
            return f"killed by signal {-code}"
    if IS_WINDOWS and code >= 0xC0000000:
        return f"crashed (Windows exception 0x{code:08X})"
    return None


def run_once(exe: str, timeout: float = RUN_TIMEOUT_S):
    with tempfile.TemporaryDirectory(prefix="gc_run_") as cwd:
        out_p, err_p = os.path.join(cwd, "out"), os.path.join(cwd, "err")
        with open(out_p, "wb") as fo, open(err_p, "wb") as fe:
            return (_run_windows if IS_WINDOWS else _run_posix)(exe, cwd, fo, fe, timeout, out_p, err_p)


def _run_posix(exe, cwd, fo, fe, timeout, out_p, err_p):
    t0 = time.perf_counter()
    proc = subprocess.Popen([exe], cwd=cwd, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe,
                            env=_safe_env(), preexec_fn=_limits, start_new_session=True)
    box = {}

    def waiter():
        _, status, ru = os.wait4(proc.pid, 0)
        box["end"], box["status"], box["ru"] = time.perf_counter(), status, ru

    th = threading.Thread(target=waiter, daemon=True)
    th.start()
    th.join(timeout)
    timed_out = th.is_alive()
    if timed_out:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        th.join(3)
    proc.returncode = 0  # already reaped by wait4; stop Popen from waiting again
    if "status" not in box:
        return {"timed_out": True, "exit_code": None, "wall_ms": timeout * 1000, "cpu_ms": None,
                "peak_mb": None, "stdout": _read(out_p), "stderr": _read(err_p), "note": _describe_exit(None, True)}
    code = os.waitstatus_to_exitcode(box["status"])
    ru = box["ru"]
    rss = ru.ru_maxrss / (1024 * 1024) if IS_MAC else ru.ru_maxrss / 1024
    return {"timed_out": timed_out, "exit_code": code, "wall_ms": (box["end"] - t0) * 1000,
            "cpu_ms": (ru.ru_utime + ru.ru_stime) * 1000, "peak_mb": rss,
            "stdout": _read(out_p), "stderr": _read(err_p), "note": _describe_exit(code, timed_out)}


def _run_windows(exe, cwd, fo, fe, timeout, out_p, err_p):  # not exercised in the Linux dev sandbox
    t0 = time.perf_counter()
    import ctypes

    kernel32 = ctypes.windll.kernel32
    error_mode = kernel32.GetErrorMode()
    kernel32.SetErrorMode(error_mode | 0x0003)
    try:
        proc = subprocess.Popen([exe], cwd=cwd, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe, env=_safe_env(),
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    finally:
        kernel32.SetErrorMode(error_mode)
    peak, cpu, stop = [0.0], [None], threading.Event()

    def sampler():
        if psutil is None:
            return
        try:
            p = psutil.Process(proc.pid)
        except psutil.Error:
            return
        while not stop.is_set():
            try:
                mi = p.memory_info()
                peak[0] = max(peak[0], getattr(mi, "peak_wset", mi.rss))
                ct = p.cpu_times()
                cpu[0] = ct.user + ct.system
            except psutil.Error:
                return
            time.sleep(0.001)

    th = threading.Thread(target=sampler, daemon=True)
    th.start()
    timed_out = False
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        proc.kill()
        proc.wait()
    wall = (time.perf_counter() - t0) * 1000
    stop.set()
    th.join(1)
    code = None if timed_out else proc.returncode
    return {"timed_out": timed_out, "exit_code": code, "wall_ms": wall,
            "cpu_ms": cpu[0] * 1000 if cpu[0] is not None else None,
            "peak_mb": peak[0] / (1024 * 1024) if peak[0] else None,
            "stdout": _read(out_p), "stderr": _read(err_p), "note": _describe_exit(code, timed_out)}


def measure(exe: str, runs: int = RUNS):
    """Run the binary several times; report medians. Returns the `performance` object."""
    notes = []
    with _LOCK:
        results = []
        for _ in range(runs):
            r = run_once(exe)
            results.append(r)
            if r["timed_out"]:
                break
    first = results[0]
    if first["timed_out"]:
        return {"executed": True, "timed_out": True, "crashed": False, "exit_code": None,
                "stdout": first["stdout"], "stderr": first["stderr"], "runs": 1,
                "execution_time_ms": None, "cpu_time_ms": None, "cpu_usage_percent": None,
                "peak_memory_mb": None, "wall_ms": None, "deterministic_output": True,
                "metrics_status": {"execution_time": "unavailable", "cpu": "unavailable", "memory": "unavailable"},
                "notes": [f"Program exceeded the {RUN_TIMEOUT_S:.0f}s time limit and was killed; "
                          "no performance metrics are reported."], "error": "Program timed out."}

    walls = [r["wall_ms"] for r in results]
    cpus = [r["cpu_ms"] for r in results if r["cpu_ms"] is not None]
    mems = [r["peak_mb"] for r in results if r["peak_mb"] is not None]
    wall = statistics.median(walls)
    cpu = statistics.median(cpus) if cpus else None
    mem = max(mems) if mems else None
    crash = _describe_exit(first["exit_code"], False)
    deterministic = len({r["stdout"] for r in results}) == 1

    status = {"execution_time": "measured",
              "cpu": "measured" if cpu is not None else "unavailable",
              "memory": ("measured" if not IS_WINDOWS else "sampled") if mem is not None else "unavailable"}
    notes.append(f"Execution time = median wall-clock of {len(results)} run(s), including process start-up.")
    if not IS_WINDOWS:
        notes.append("CPU time and peak memory come from the OS (wait4 resource usage).")
    else:
        notes.append("Windows: CPU time and peak memory are sampled via psutil and may be unavailable "
                     "for very short programs." + ("" if psutil else " psutil is not installed."))
    if cpu is None:
        notes.append("CPU usage could not be collected on this system.")
    if mem is None:
        notes.append("Peak memory could not be collected on this system.")
    if not deterministic:
        notes.append("Program output differed between repeated runs (non-deterministic program).")
    if wall < 5:
        notes.append("Very short run: timing noise is large relative to the value; compare with care.")

    return {
        "executed": True, "timed_out": False, "crashed": bool(crash), "exit_code": first["exit_code"],
        "exit_description": crash, "stdout": first["stdout"], "stderr": first["stderr"], "runs": len(results),
        "execution_time_ms": round(wall, 3),
        "wall_ms": {"median": round(wall, 3), "min": round(min(walls), 3), "max": round(max(walls), 3)},
        "cpu_time_ms": round(cpu, 3) if cpu is not None else None,
        "cpu_usage_percent": round(min(100.0, cpu / wall * 100), 1) if cpu is not None and wall > 0 else None,
        "peak_memory_mb": round(mem, 3) if mem is not None else None,
        "deterministic_output": deterministic, "metrics_status": status, "notes": notes,
        "error": (crash or (f"Program exited with status {first['exit_code']}." if first["exit_code"] else None)),
    }
