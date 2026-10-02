import { fmtCarbon, fmtEnergy, fmtMem, fmtMetric, fmtMs, fmtScore } from "./format";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const row = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;

export function exportJson(analysis, optimization) {
  download(`greencompile-${analysis.analysis_id.slice(0, 8)}.json`, "application/json",
    JSON.stringify({ analysis, optimization: optimization?.status === "ok" ? optimization : null }, null, 2));
}

export function exportHtml(analysis, optimization, recommendations = []) {
  const a = analysis, c = a.compilation, p = a.performance, s = a.static_analysis;
  const opt = optimization?.status === "ok" ? optimization : null;
  const rec = opt?.recommendation || recommendations[0];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GreenCompile Analysis Report</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:32px auto;color:#0f172a;padding:0 16px}
h1{color:#047857}h2{border-bottom:2px solid #d1fae5;padding-bottom:4px;margin-top:28px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;font-size:14px}
th{background:#f1f5f9;width:34%}pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:13px}
.note{color:#475569;font-size:13px}</style></head><body>
<h1>GreenCompile Analysis Report</h1>
<p class="note">Compile Smarter. Optimize Greener. Generated ${esc(new Date().toLocaleString())}.
Energy and carbon are <b>estimates</b> derived from measured execution time and configurable assumptions; the Green Score is a project-defined metric.</p>
<h2>Source summary</h2><table>${row("Lines of code", s.lines_of_code)}${row("Tokens", s.tokens)}${row("Functions", s.function_count)}${row("Loops", s.loop_count)}${row("Variables", s.variable_count)}${row("Cyclomatic complexity (heuristic)", s.cyclomatic_complexity)}</table>
<h2>Compilation</h2><table>${row("Compiler", `${c.compiler} ${c.compiler_version || ""}`)}${row("Optimization level", "-" + a.optimization_level)}${row("Result", c.success ? "Success" : "Failed")}${row("Warnings", c.warnings.length)}${row("Errors", c.errors.length)}</table>
<h2>Performance (measured)</h2><table>${row("Execution time", fmtMs(p.execution_time_ms))}${row("CPU time", fmtMs(p.cpu_time_ms))}${row("Peak memory", fmtMem(p.peak_memory_mb))}${row("Exit status", p.exit_code)}${row("Runs (median)", p.runs)}</table>
<h2>Estimated sustainability</h2><table>${row("Estimated Energy", fmtEnergy(a.energy.energy_joules))}${row("Estimated Carbon", fmtCarbon(a.carbon.carbon_gco2e))}${row("Power assumption", a.environment.power_watts + " W")}${row("Carbon intensity assumption", a.environment.carbon_intensity_gco2e_per_kwh + " gCO2e/kWh")}${row("GreenCompile Green Score (project-defined)", fmtScore(a.green_score.score))}</table>
<h2>Detected issues</h2>${a.patterns.length ? `<table>${a.patterns.map((x) => row(`${x.pattern} (line ${x.line}, ${x.severity})`, x.explanation)).join("")}</table>` : "<p>No inefficient patterns detected by the rule set.</p>"}
<h2>AI / rule-based recommendation</h2>${rec ? `<table>${row("Source", rec.source)}${row("Issue", rec.issue)}${row("Why it matters", rec.why_it_matters)}${row("Recommendation", rec.recommendation)}${row("Confidence", rec.confidence)}</table>` : "<p>None generated.</p>"}
${opt ? `<h2>Original vs optimized</h2><table><tr><th>Metric</th><th>Original</th><th>Optimized</th><th>Change</th></tr>${opt.comparison.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td>${esc(fmtMetric(m.key, m.original))}</td><td>${esc(fmtMetric(m.key, m.optimized))}</td><td>${m.change_percent == null ? "—" : m.change_percent.toFixed(1) + "%"}${m.within_noise ? " (within noise)" : ""}</td></tr>`).join("")}</table>
<h2>Correctness</h2><table>${row("Result", opt.verification.label)}${row("Reason", opt.verification.reason)}${row("Scope", opt.verification.scope)}</table>
<h2>Optimized code</h2><pre>${esc(opt.optimized_code)}</pre>` : ""}
<h2>Original code</h2><pre>${esc(a.source_code)}</pre></body></html>`;
  download(`greencompile-report-${a.analysis_id.slice(0, 8)}.html`, "text/html", html);
}
