import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnalysis } from "../context/useAnalysis";
import { Badge, Card, EmptyState, EstimatedTag, PageHeader, StaleNotice } from "../components/ui";
import { exportHtml, exportJson } from "../lib/exportReport";
import { fmtCarbon, fmtChange, fmtEnergy, fmtMem, fmtMetric, fmtMs, fmtPctVal, fmtScore, timeAgo } from "../lib/format";

const tooltipStyle = { backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "12px" };
const axis = { fill: "#94a3b8", fontSize: 12 };

function MetricCard({ icon, title, value, subtitle, trend, improved, tone, estimated }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
          <span className="text-xl">{icon}</span>
        </div>
        {trend ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${improved === false ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-400"}`}>
            {trend}
          </span>
        ) : estimated ? <EstimatedTag /> : <Badge tone="cyan">Measured</Badge>}
      </div>
      <p className="mt-4 text-sm text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function ScoreRing({ score }) {
  const r = 58, circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e293b" strokeWidth="14" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="#34d399" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} className="transition-all duration-700" />
      </svg>
      <div className="text-center">
        <div className="text-3xl font-bold">{fmtScore(score)}</div>
        <div className="text-xs text-slate-500">/ 100</div>
      </div>
    </div>
  );
}

function Dashboard() {
  const c = useAnalysis();
  const a = c.analysis;
  const opt = c.optResult?.status === "ok" ? c.optResult : null;

  const history = (
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analysis History</h2>
          <p className="mt-1 text-xs text-slate-500">Most recent analyses, stored only in this browser (localStorage).</p>
        </div>
        {c.history.length > 0 && (
          <button onClick={c.clearHistory} className="text-xs text-slate-500 hover:text-slate-300">Clear history</button>
        )}
      </div>
      {c.history.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">No analyses yet.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-950 text-xs text-slate-500">
              <tr>{["When", "Exec time", "Energy (est.)", "Carbon (est.)", "Green Score", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {c.history.map((h) => (
                <tr key={h.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-4 py-3">{timeAgo(h.timestamp)}</td>
                  <td className="px-4 py-3">{fmtMs(h.summary.execution_time_ms)}</td>
                  <td className="px-4 py-3">{fmtEnergy(h.summary.energy_joules)}</td>
                  <td className="px-4 py-3">{fmtCarbon(h.summary.carbon_gco2e)}</td>
                  <td className="px-4 py-3 text-emerald-400">{fmtScore(h.summary.green_score)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => c.openHistory(h)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  if (!a) {
    return (
      <div className="min-h-screen bg-[#050b10] text-white">
        <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
          <PageHeader eyebrow="GreenCompile Dashboard" title="Analysis Dashboard"
            subtitle="Analyze performance, energy consumption and estimated carbon impact." />
          <EmptyState title="No analysis yet"
            text="Run an analysis in the Code Analyzer to see real measurements, estimated energy and carbon, and your Green Score here."
            action={{ to: "/analyzer", label: "Open Code Analyzer" }} />
          {history}
        </div>
      </div>
    );
  }

  const p = a.performance;
  const cmp = (key) => opt?.comparison.metrics.find((m) => m.key === key);
  const trendOf = (key) => { const m = cmp(key); return m && m.change_percent != null ? { t: fmtChange(m.change_percent) + (m.within_noise ? " (noise)" : ""), i: m.improved } : {}; };
  const sub = (key, fmt) => (opt ? `${fmt(cmp(key)?.optimized)} optimized` : "Run optimization for comparison");
  const gs = a.green_score;
  const scoreTrend = cmp("green_score");

  const chartFor = (key, scale) => [{ name: "", Original: (a2(key) ?? 0) * scale, ...(opt ? { Optimized: (o2(key) ?? 0) * scale } : {}) }];
  function a2(key) { return cmp(key)?.original ?? ({ execution_time_ms: p.execution_time_ms, cpu_time_ms: p.cpu_time_ms, energy_joules: a.energy.energy_joules, carbon_gco2e: a.carbon.carbon_gco2e }[key]); }
  function o2(key) { return cmp(key)?.optimized; }
  const perfData = [
    { metric: "Execution Time (ms)", Original: p.execution_time_ms ?? 0, ...(opt ? { Optimized: o2("execution_time_ms") ?? 0 } : {}) },
    { metric: "CPU Time (ms)", Original: p.cpu_time_ms ?? 0, ...(opt ? { Optimized: o2("cpu_time_ms") ?? 0 } : {}) },
  ];
  const energyData = chartFor("energy_joules", 1000);   // mJ
  const carbonData = chartFor("carbon_gco2e", 1e6);      // µg

  return (
    <div className="min-h-screen bg-[#050b10] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile Dashboard" title="Analysis Dashboard"
          subtitle="Measured performance, estimated energy and carbon impact of your program.">
          <button onClick={() => exportHtml(a, c.optResult, c.recs.items)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800">Export Report</button>
          <button onClick={() => exportJson(a, c.optResult)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800">Export JSON</button>
          <Link to="/analyzer" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">+ New Analysis</Link>
        </PageHeader>
        {c.stale && <StaleNotice />}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard icon="🌿" title="Green Score" value={`${fmtScore(gs.score)} / 100`} tone="bg-emerald-500/10"
            subtitle={gs.available ? `${gs.rating} · project-defined score` : gs.reason}
            trend={scoreTrend?.change_abs ? `${scoreTrend.change_abs > 0 ? "↑" : "↓"} ${Math.abs(scoreTrend.change_abs).toFixed(1)} pts` : null} improved={scoreTrend?.improved} />
          <MetricCard icon="⏱" title="Execution Time" value={fmtMs(p.execution_time_ms)} tone="bg-cyan-500/10"
            subtitle={sub("execution_time_ms", fmtMs)} trend={trendOf("execution_time_ms").t} improved={trendOf("execution_time_ms").i} />
          <MetricCard icon="▤" title="CPU Usage" value={fmtPctVal(p.cpu_usage_percent)} tone="bg-blue-500/10"
            subtitle={`CPU time ${fmtMs(p.cpu_time_ms)}`} />
          <MetricCard icon="⚡" title="Estimated Energy" value={fmtEnergy(a.energy.energy_joules)} tone="bg-yellow-500/10" estimated
            subtitle={sub("energy_joules", fmtEnergy)} trend={trendOf("energy_joules").t} improved={trendOf("energy_joules").i} />
          <MetricCard icon="☁" title="Estimated Carbon" value={`${fmtCarbon(a.carbon.carbon_gco2e)} CO₂e`} tone="bg-purple-500/10" estimated
            subtitle={sub("carbon_gco2e", fmtCarbon)} trend={trendOf("carbon_gco2e").t} improved={trendOf("carbon_gco2e").i} />
          <MetricCard icon="▣" title="Memory Usage" value={fmtMem(p.peak_memory_mb)} tone="bg-sky-500/10"
            subtitle={p.metrics_status.memory === "unavailable" ? "Unavailable on this OS" : "Peak resident memory"}
            trend={trendOf("peak_memory_mb").t} improved={trendOf("peak_memory_mb").i} />
        </div>

        {!opt && (
          <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
            No verified optimization is available yet, so charts show the original program only.{" "}
            <Link to="/optimization" className="text-emerald-400 hover:underline">Open Optimization →</Link>
          </p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-12">
          <Card className="p-6 xl:col-span-7">
            <h2 className="text-lg font-semibold">Performance Comparison</h2>
            <p className="mt-1 mb-6 text-xs text-slate-500">Original vs optimized (measured, median of {p.runs} runs)</p>
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perfData}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="metric" stroke="#64748b" tick={axis} />
                  <YAxis stroke="#64748b" tick={axis} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(3)} ms`} />
                  <Legend />
                  <Bar dataKey="Original" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  {opt && <Bar dataKey="Optimized" fill="#34d399" radius={[6, 6, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6 xl:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Energy &amp; Carbon Impact</h2>
              <EstimatedTag title={a.energy.disclaimer} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {a.energy.method}; {a.environment.power_watts} W assumed · {a.environment.carbon_intensity_gco2e_per_kwh} gCO₂e/kWh assumed
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[["Energy (mJ)", energyData, "#facc15", "mJ"], ["Carbon (µg CO₂e)", carbonData, "#c084fc", "µg"]].map(([title, data, color, unit]) => (
                <div key={title} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <p className="text-xs text-slate-500">{title}</p>
                  <div className="mt-2 h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data}>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, "auto"]} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toPrecision(3)} ${unit}`} />
                        <Bar dataKey="Original" fill={color} radius={[8, 8, 0, 0]} />
                        {opt && <Bar dataKey="Optimized" fill="#34d399" radius={[8, 8, 0, 0]} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 text-xs leading-5 text-slate-400">
              Energy and carbon are <b className="text-slate-300">estimates</b> derived from measured execution time; they are not hardware energy measurements.
            </p>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-12">
          <Card className="p-6 xl:col-span-5">
            <h2 className="text-lg font-semibold">GreenCompile Green Score Breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">Project-defined composite, not an industry standard.</p>
            {gs.available ? (
              <>
                <div className="mt-6 flex items-center gap-7">
                  <ScoreRing score={gs.score} />
                  <div className="flex-1 space-y-3.5">
                    {gs.dimensions.map((d) => (
                      <div key={d.key}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-slate-400">{d.label} <span className="text-slate-600">· {Math.round(d.weight * 100)}%</span></span>
                          <span className="text-slate-300">{d.score.toFixed(0)}/100</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${d.score}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-5 text-xs leading-5 text-slate-500">{gs.method}</p>
              </>
            ) : <p className="mt-6 text-sm text-slate-400">{gs.reason}</p>}
          </Card>

          <Card className="p-6 xl:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Optimization Summary</h2>
                <p className="mt-1 text-xs text-slate-500">Original vs optimized, calculated from re-measurement</p>
              </div>
              {opt && <Badge tone={opt.verification.status === "verified" ? "emerald" : opt.verification.status === "failed" ? "red" : "amber"}>{opt.verification.label}</Badge>}
            </div>
            {opt ? (
              <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
                <div className="grid min-w-[520px] grid-cols-4 bg-slate-950 px-4 py-3 text-xs text-slate-500"><span>Metric</span><span>Original</span><span>Optimized</span><span>Change</span></div>
                {opt.comparison.metrics.map((m) => (
                  <div key={m.key} className="grid min-w-[520px] grid-cols-4 border-t border-slate-800 px-4 py-3 text-sm">
                    <span className="text-slate-300">{m.label}</span>
                    <span className="text-slate-400">{fmtMetric(m.key, m.original)}</span>
                    <span className="text-emerald-400">{fmtMetric(m.key, m.optimized)}</span>
                    <span className={`font-medium ${m.improved === false ? "text-red-300" : "text-emerald-400"}`}>
                      {fmtChange(m.change_percent)}{m.within_noise ? " · noise" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-400">
                {c.optResult?.message || "No optimization has been generated yet."}
              </p>
            )}
            {opt?.comparison.insights.map((t) => <p key={t} className="mt-3 text-xs leading-5 text-slate-400">• {t}</p>)}
          </Card>
        </div>

        {history}
      </div>
    </div>
  );
}

export default Dashboard;
