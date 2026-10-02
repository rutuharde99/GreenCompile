# GreenCompile — Compile Smarter. Optimize Greener.

An AI-assisted, carbon-footprint-aware analysis tool for C programs (college Compiler Design project).
It compiles and runs your C code with a real compiler, **measures** performance, **estimates** energy and
carbon, computes a project-defined Green Score, detects inefficient patterns, asks an AI advisor for a safe
optimization, **verifies** the optimized program still behaves the same, and compares original vs optimized.

## Architecture

```
React + Vite UI  ──/api──▶  FastAPI backend
 (Monaco, Recharts)          ├─ compiler_service      real clang/gcc, diagnostics
 shared AnalysisContext      ├─ analysis_service      lexical/rule-based static analysis
                             ├─ performance_service   safe run, timeout, time/CPU/memory
                             ├─ energy / carbon       Energy = P × t ; Carbon = kWh × intensity
                             ├─ green_score_service   transparent weighted score
                             ├─ pattern_detection     rules + safe loop-invariant hoisting
                             ├─ ai_service            Anthropic API (server side) + rule-based fallback
                             └─ verification_service  compile + run both, compare stdout/exit code
```

Pipeline: C code → compile → static analysis → run → performance → energy → carbon → Green Score →
pattern detection → AI/rule-based recommendation → optimized code → compile+run optimized →
correctness verification → original-vs-optimized comparison.

All pages (Code Analyzer, Dashboard, Analysis, AI Advisor, Optimization) read the **same** analysis result
from one React context (`src/context/AnalysisProvider.jsx`). Routes: `/dashboard` (overview + charts),
`/analysis` (detailed compiler/static/performance report), `/analyzer`, `/ai`, `/optimization`.

## Setup

### Compiler (required)
Install **Clang** (preferred) or **GCC** and make sure it is on `PATH`.
- Windows: `winget install LLVM.LLVM` (reopen the terminal) — or MSYS2/MinGW-w64 for GCC
- Ubuntu/Debian: `sudo apt install clang`   ·   macOS: `xcode-select --install`

If the selected compiler is missing but the other exists, the backend uses the other one and **tells you**
(shown in the UI). If neither exists you get setup instructions — never a fake success.

### Backend
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env                               # optional, see below (Linux/macOS: cp)
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Check: open http://127.0.0.1:8000/api/health → `{"status":"ok","service":"GreenCompile"}`
(`/api/environment` shows detected compilers and whether the AI is configured.)

### AI advisor (optional)
Put your key in `backend/.env` (never in the frontend):
```
ANTHROPIC_API_KEY=sk-ant-...
GC_AI_MODEL=claude-sonnet-5
```
Without a key, or if the AI is down/returns malformed output, everything else still works and the advisor
falls back to deterministic rule-based suggestions (clearly labelled "Rule-based").

### Frontend
```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api to the backend on port 8000)
```

## Example workflow
1. Start backend and frontend. 2. Open **Code Analyzer** (the default sample is the loop-invariant test program).
3. Click **Analyze Code**: Compiling → Running & analyzing → Optimizing & verifying → Analysis Complete.
4. **Dashboard**: measured time/CPU/memory, *estimated* energy/carbon, Green Score, charts, history, export.
5. **AI Advisor**: Refresh / Apply Suggestion / Explain Why / Ignore. 6. **Optimization**: side-by-side diff,
correctness result, impact, **Accept** (becomes the editor code) or **Revert**.

## What is measured vs estimated
| Value | Status |
|---|---|
| Compilation result, warnings, errors, program output, exit status | Real (compiler / process) |
| Execution time | **Measured** (median wall-clock of N runs, includes process start-up) |
| CPU time, peak memory | **Measured** on Linux/macOS via OS resource usage; on Windows **sampled** through `psutil` and may be unavailable for very short programs (then shown as unavailable) |
| Energy | **Estimated**: `execution_time × configured power` (default 15 W, `GC_POWER_WATTS`) |
| Carbon | **Estimated**: `energy_kWh × carbon intensity` (default 475 gCO₂e/kWh, `GC_CARBON_INTENSITY`) |
| Green Score | **Project-defined** composite (weights/ranges in `backend/config.py`), not an industry standard |

> **Disclaimer:** energy and carbon values are software-level estimates from measured runtime and
> configurable assumptions. They are not hardware energy measurements. Real grid intensity varies by country,
> grid mix and time.

## Important limitations
- Static analysis is lexical/rule-based, **not** a full Clang AST or complete semantic analysis.
  "Cyclomatic complexity" is a heuristic count.
- Pattern detection is a small rule set; "no patterns found" does not mean the code is optimal.
- Automatic transformations are deliberately conservative (loop-invariant hoisting of simple scalar
  arithmetic). AI-proposed code is never trusted: it is compiled and behaviourally verified first.
- Verification compares stdout and exit status for **one** run with empty stdin. It reports *Inconclusive*
  for programs that read input, use time/random functions, or behave non-deterministically. It is not a
  formal equivalence proof.
- Tiny programs run in about a millisecond, so timing noise can exceed the real difference. The UI flags
  changes that are "within measurement noise". Also, at `-O1` and above the compiler often performs
  loop-invariant code motion itself, so source-level hoisting may not change generated code; try `-O0`.
- **Security:** requests are size-limited, only standard headers are allowed, process/file/network calls
  (`system`, `fork`, `exec*`, `fopen`, sockets, …) and inline assembly are rejected, compilation and execution
  use timeouts, POSIX runs apply CPU/memory/file-size limits, and temp files are deleted. This is a
  best-effort filter for a **local** academic tool, **not a hardened sandbox** — do not expose the backend to
  untrusted users. It binds to `127.0.0.1`.

## Tests
```bash
cd backend
python -m unittest tests.test_pipeline -v     # needs gcc or clang; exercises the real pipeline
```

## Project structure
```
backend/  main.py, config.py, routes/, services/, models/schemas.py, tests/
src/      components/, context/ (shared state), lib/ (api, format, history, export), pages/
```
