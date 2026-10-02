import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { useAnalysis } from "../context/useAnalysis";
import { Badge, ErrorBanner, EstimatedTag, PageHeader, Spinner, StaleNotice } from "../components/ui";
import { fmtCarbon, fmtEnergy, fmtMem, fmtMs, fmtPctVal, fmtScore } from "../lib/format";

const STEPS = [
  { key: "compiling", label: "Compiling..." },
  { key: "analyzing", label: "Running & analyzing..." },
  { key: "optimizing", label: "Optimizing & verifying..." },
];
const STAGE_LABEL = {
  idle: "Ready", compiling: "Compiling...", analyzing: "Running & analyzing...",
  optimizing: "Optimizing & verifying...", done: "Analysis Complete", error: "Analysis Failed",
};

function StepIndicator({ stage }) {
  const order = ["compiling", "analyzing", "optimizing", "done"];
  const at = order.indexOf(stage);
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {STEPS.map((s, i) => {
        const done = at > i || stage === "done";
        const active = stage === s.key;
        return (
          <span key={s.key} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
            active ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
              : done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-slate-800 text-slate-500"}`}>
            {active ? <Spinner className="h-3 w-3" /> : done ? "✓" : "○"} {s.label}
          </span>
        );
      })}
    </div>
  );
}

function CodeAnalyzer() {
  const c = useAnalysis();
  const { analysis, compileResult, stage, busy } = c;
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // Show real compiler diagnostics as editor markers
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    if (!editor || !monaco || !editor.getModel()) return;
    const mk = (items, severity) => (items || []).filter((d) => d.line).map((d) => ({
      startLineNumber: d.line, endLineNumber: d.line, startColumn: d.column || 1, endColumn: (d.column || 1) + 1,
      message: d.message, severity }));
    const markers = compileResult
      ? [...mk(compileResult.errors, monaco.MarkerSeverity.Error), ...mk(compileResult.warnings, monaco.MarkerSeverity.Warning)]
      : [];
    monaco.editor.setModelMarkers(editor.getModel(), "greencompile", c.stale ? [] : markers);
  }, [compileResult, c.stale]);

  const st = analysis?.static_analysis;
  const perf = analysis?.performance;
  const comp = compileResult;
  const rows = analysis
    ? [
        ["Tokens", st.tokens], ["Functions", st.function_count], ["Loops", st.loop_count],
        ["Variables", st.variable_count], ["Cyclomatic complexity", st.cyclomatic_complexity],
        ["Warnings", comp.warnings.length], ["Errors", comp.errors.length],
      ]
    : comp
      ? [["Warnings", comp.warnings.length], ["Errors", comp.errors.length]]
      : [];
  const sustain = analysis
    ? [
        ["Execution time", fmtMs(perf.execution_time_ms)],
        ["CPU usage", fmtPctVal(perf.cpu_usage_percent)],
        ["Peak memory", fmtMem(perf.peak_memory_mb)],
        ["Estimated energy", fmtEnergy(analysis.energy.energy_joules), true],
        ["Estimated carbon", fmtCarbon(analysis.carbon.carbon_gco2e), true],
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#050b10] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile Analyzer" title="Code Analyzer"
          subtitle="Analyze your C program for performance and sustainability.">
          <button onClick={() => c.setSource("")} disabled={busy}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">
            Clear
          </button>
          <button onClick={c.runAnalysis} disabled={busy || !c.source.trim() || c.backend.status === "offline"}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.18)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <Spinner />} {busy ? STAGE_LABEL[stage] : "Analyze Code"}
          </button>
        </PageHeader>

        {c.backend.status === "offline" && (
          <div className="mt-6"><ErrorBanner title="Backend not reachable">
            {"Start the API in a second terminal:\ncd backend\npip install -r requirements.txt\nuvicorn main:app --reload --port 8000"}
          </ErrorBanner></div>
        )}
        {c.stale && <StaleNotice />}

        <div className="mt-8 grid gap-6 xl:grid-cols-12">
          {/* Editor */}
          <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-[0_10px_40px_rgba(0,0,0,0.2)] xl:col-span-8">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">&lt;/&gt;</div>
                <div>
                  <p className="text-sm font-semibold text-white">main.c</p>
                  <p className="text-xs text-slate-500">C Source Code{c.accepted ? " · accepted optimization" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">C</span>
                <span className={`rounded-lg border px-3 py-1.5 text-xs ${
                  stage === "error" ? "border-red-500/25 bg-red-500/10 text-red-300"
                    : busy ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
                  {STAGE_LABEL[stage]}
                </span>
              </div>
            </div>
            <div className="h-[520px]">
              <Editor height="100%" language="c" theme="vs-dark" value={c.source}
                onChange={(v) => c.setSource(v || "")}
                onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
                options={{ minimap: { enabled: false }, fontSize: 15, lineNumbers: "on", automaticLayout: true,
                  tabSize: 4, padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false, smoothScrolling: true,
                  readOnly: busy }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/80 px-5 py-3 text-xs text-slate-500">
              <div className="flex gap-5"><span>Language: C</span><span>UTF-8</span><span>LF</span>
                <span>{c.source.length.toLocaleString()} chars</span></div>
              <span className={busy ? "text-cyan-300" : "text-emerald-400"}>● {busy ? "Working" : "Ready"}</span>
            </div>
          </div>

          {/* Quick analysis */}
          <div className="xl:col-span-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Quick Analysis</h2>
                <Badge tone={analysis ? "emerald" : "slate"}>{analysis ? "Live result" : "Waiting"}</Badge>
              </div>

              <div className={`mt-6 rounded-xl border p-4 ${comp ? (comp.success ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5") : "border-slate-800 bg-slate-950/50"}`}>
                <p className="text-xs uppercase tracking-wide text-slate-500">Compilation Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-lg ${comp?.success ? "text-emerald-400" : comp ? "text-red-400" : "text-slate-600"}`}>
                    {comp ? (comp.success ? "✓" : "✕") : "–"}
                  </span>
                  <span className={`text-sm font-semibold ${comp?.success ? "text-emerald-400" : comp ? "text-red-300" : "text-slate-500"}`}>
                    {busy && stage === "compiling" ? "Compiling..." : comp ? (comp.success ? "Compilation Successful" : "Compilation Failed") : "Not analyzed yet"}
                  </span>
                </div>
                {comp?.compiler && (
                  <p className="mt-2 text-xs text-slate-500">
                    {comp.compiler}{comp.compiler_version ? ` · ${comp.compiler_version}` : ""} · -{comp.optimization}
                  </p>
                )}
                {comp?.note && <p className="mt-2 text-xs leading-5 text-amber-300">{comp.note}</p>}
              </div>

              {!comp && !busy && (
                <p className="mt-5 text-sm text-slate-500">Press <b className="text-slate-300">Analyze Code</b> to compile, run and measure the program.</p>
              )}

              <div className="mt-5 space-y-1">
                {[...rows, ...sustain].map(([label, value, est]) => (
                  <div key={label} className="flex items-center justify-between border-b border-slate-800/60 py-2.5 last:border-none">
                    <span className="text-sm text-slate-400">{label} {est && <EstimatedTag />}</span>
                    <span className="font-semibold text-slate-100">{value}</span>
                  </div>
                ))}
                {analysis && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-slate-400" title="Project-defined composite metric; not an industry standard.">GreenCompile Green Score</span>
                    <span className="text-lg font-bold text-emerald-400">{fmtScore(analysis.green_score.score)} <span className="text-xs font-normal text-slate-500">/ 100</span></span>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-400">Compiler</label>
                  <select value={c.compiler} disabled={busy} onChange={(e) => c.setCompiler(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60">
                    <option value="clang">Clang</option>
                    <option value="gcc">GCC</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-400">Optimization Level</label>
                  <select value={c.optimization} disabled={busy} onChange={(e) => c.setOptimization(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-60">
                    {["O0", "O1", "O2", "O3"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={c.runAnalysis} disabled={busy || !c.source.trim() || c.backend.status === "offline"}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                {busy && <Spinner />} {busy ? STAGE_LABEL[stage] : "Run Full Analysis"}
              </button>

              {(busy || stage === "done") && <StepIndicator stage={stage} />}

              {stage === "done" && (
                <div className="mt-5 flex flex-wrap gap-2 text-sm">
                  <Link to="/dashboard" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-400 hover:bg-emerald-500/20">Open Dashboard →</Link>
                  <Link to="/ai" className="rounded-lg bg-cyan-500/10 px-3 py-2 text-cyan-300 hover:bg-cyan-500/20">AI Advisor →</Link>
                </div>
              )}
              {c.optError && <div className="mt-4"><ErrorBanner title="Optimization step failed">{c.optError}</ErrorBanner></div>}
            </div>
          </div>
        </div>

        {/* Diagnostics */}
        {(c.error || (comp && (comp.errors.length > 0 || comp.warnings.length > 0))) && (
          <div className="mt-6 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">Compiler Diagnostics</h2>
            {c.error && <div className="mt-4"><ErrorBanner title="Analysis stopped">{c.error}</ErrorBanner></div>}
            <ul className="mt-4 space-y-2 font-mono text-sm">
              {[...(comp?.errors || []).map((d) => ({ ...d, kind: "error" })), ...(comp?.warnings || []).map((d) => ({ ...d, kind: "warning" }))].map((d, i) => (
                <li key={i} className={`rounded-lg border px-3 py-2 ${d.kind === "error" ? "border-red-500/20 bg-red-500/5 text-red-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200"}`}>
                  <span className="mr-2 uppercase">{d.kind}</span>
                  {d.line ? <span className="mr-2 text-slate-500">line {d.line}:{d.column}</span> : null}
                  {d.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {perf && (perf.timed_out || perf.crashed || (perf.exit_code ?? 0) !== 0 || perf.stderr) && (
          <div className="mt-6"><ErrorBanner title={perf.timed_out ? "Program timed out" : perf.crashed ? "Program crashed at run time" : "Program ended with a non-zero exit status"}>
            {perf.error || perf.stderr}
          </ErrorBanner></div>
        )}
      </div>
    </div>
  );
}

export default CodeAnalyzer;
