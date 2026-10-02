import { Link } from "react-router-dom";
import { useAnalysis } from "../context/useAnalysis";
import { Badge, Card, EmptyState, ErrorBanner, EstimatedTag, PageHeader, Spinner, StaleNotice } from "../components/ui";
import { fmtChange, fmtEnergy, fmtMetric, fmtMs, fmtScore } from "../lib/format";

function ImpactCard({ icon, m, estimated }) {
  const bad = m.improved === false;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-lg">{icon}</span><p className="text-sm font-medium text-slate-300">{m.label}</p></div>
        {estimated && <EstimatedTag />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">{fmtMetric(m.key, m.original)}</span>
        <span className="text-slate-600">→</span>
        <span className={`font-semibold ${bad ? "text-red-300" : "text-emerald-400"}`}>{fmtMetric(m.key, m.optimized)}</span>
      </div>
      <p className={`mt-2 text-xs font-medium ${bad ? "text-red-300" : "text-emerald-400"}`}>
        {m.key === "green_score" && m.change_abs != null ? `${m.change_abs > 0 ? "↑" : "↓"} ${Math.abs(m.change_abs).toFixed(1)} points` : fmtChange(m.change_percent)}
        {m.within_noise && <span className="ml-2 font-normal text-slate-500">within measurement noise</span>}
      </p>
    </div>
  );
}

function CodePanel({ title, subtitle, tone, code, marked, footer }) {
  const border = tone === "orange" ? "border-orange-500/15" : "border-emerald-500/15";
  const text = tone === "orange" ? "text-orange-400" : "text-emerald-400";
  const mark = tone === "orange" ? "bg-orange-500/10 text-orange-300" : "bg-emerald-500/10 text-emerald-300";
  return (
    <div className={`overflow-hidden rounded-2xl border ${border} bg-slate-900/80`}>
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-5 py-4">
        <div><p className={`font-semibold ${text}`}>{title}</p><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs ${tone === "orange" ? "bg-orange-500/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"}`}>{marked.length} changed line{marked.length === 1 ? "" : "s"}</span>
      </div>
      <div className="max-h-[420px] overflow-auto p-6">
        <pre className="font-mono text-sm leading-7 text-slate-300">
          {code.split("\n").map((line, i) => (
            <div key={i} className={marked.includes(i + 1) ? `rounded px-2 ${mark}` : "px-2"}>
              <span className="mr-5 inline-block w-6 text-right text-slate-600">{i + 1}</span>{line}
            </div>
          ))}
        </pre>
      </div>
      <div className="grid grid-cols-3 border-t border-slate-800 bg-slate-950/70 text-xs">
        {footer.map(([k, v], i) => (
          <div key={k} className={`p-4 ${i < 2 ? "border-r border-slate-800" : ""}`}>
            <p className="text-slate-500">{k}</p><p className={`mt-1 font-semibold ${text}`}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const verTone = { verified: "emerald", failed: "red", inconclusive: "amber" };
const verBox = {
  verified: "border-emerald-500/15 bg-emerald-500/5", failed: "border-red-500/25 bg-red-500/5",
  inconclusive: "border-amber-500/25 bg-amber-500/5",
};
const verIcon = { verified: "✓", failed: "✕", inconclusive: "?" };

function Optimization() {
  const c = useAnalysis();
  const a = c.analysis;
  const r = c.optResult;

  const header = (
    <PageHeader eyebrow="GreenCompile Optimization" title="Optimization Comparison" subtitle="Compare original and optimized code side by side.">
      {a && (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"><p className="text-xs text-slate-500">Program</p><p className="mt-1 text-sm font-medium text-white">main.c</p></div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"><p className="text-xs text-slate-500">Optimization</p><p className="mt-1 text-sm font-medium text-emerald-400">-{a.optimization_level}</p></div>
        </>
      )}
    </PageHeader>
  );

  if (!a) {
    return (
      <div className="min-h-screen bg-[#050b10] text-white"><div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        {header}<EmptyState title="Analyze a program first" text="Optimization compares the analyzed program with a verified optimized version." action={{ to: "/analyzer", label: "Open Code Analyzer" }} />
      </div></div>
    );
  }

  if (r?.status !== "ok") {
    return (
      <div className="min-h-screen bg-[#050b10] text-white"><div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        {header}
        {c.stale && <StaleNotice />}
        {c.optError && <div className="mt-6"><ErrorBanner title="Optimization failed">{c.optError}</ErrorBanner></div>}
        <div className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{r?.status === "no_optimization" ? "No automatic optimization available" : "No optimization generated yet"}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
            {r?.message || "Generate an optimized version. It will be compiled, executed and compared against the original before you can accept it."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => c.verifyCandidate(null)} disabled={c.optLoading || c.stale}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {c.optLoading && <Spinner />} {c.optLoading ? "Generating & verifying..." : "Generate optimization"}
            </button>
            <Link to="/ai" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-200 hover:bg-slate-800">Open AI Advisor</Link>
          </div>
        </div>
      </div></div>
    );
  }

  const v = r.verification;
  const m = (k) => r.comparison.metrics.find((x) => x.key === k);
  const rec = r.recommendation;
  const po = r.original.performance, pn = r.optimized.performance;

  return (
    <div className="min-h-screen bg-[#050b10] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        {header}
        {c.stale && <StaleNotice />}
        {c.optError && <div className="mt-6"><ErrorBanner title="Optimization failed">{c.optError}</ErrorBanner></div>}

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <CodePanel title="Original Code" subtitle="Before optimization" tone="orange" code={r.original.source_code}
            marked={r.diff.original_changed_lines}
            footer={[["Execution", fmtMs(po.execution_time_ms)], ["Est. Energy", fmtEnergy(r.original.energy.energy_joules)], ["Green Score", fmtScore(r.original.green_score.score)]]} />
          <CodePanel title="Optimized Code" subtitle={rec ? `${rec.source === "ai" ? "AI-proposed" : "Rule-based"} · re-compiled and re-measured` : "Re-compiled and re-measured"} tone="emerald"
            code={r.optimized_code} marked={r.diff.optimized_changed_lines}
            footer={[["Execution", fmtMs(pn.execution_time_ms)], ["Est. Energy", fmtEnergy(r.optimized.energy.energy_joules)], ["Green Score", fmtScore(r.optimized.green_score.score)]]} />
        </div>

        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold">Optimization Impact</h2>
          <p className="mt-1 text-xs text-slate-500">Percentages are computed from the two measurements above (median of {po.runs} runs each). Energy and carbon are estimates.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <ImpactCard icon="⏱" m={m("execution_time_ms")} />
            <ImpactCard icon="▤" m={m("cpu_time_ms")} />
            <ImpactCard icon="▣" m={m("peak_memory_mb")} />
            <ImpactCard icon="⚡" m={m("energy_joules")} estimated />
            <ImpactCard icon="☁" m={m("carbon_gco2e")} estimated />
            <ImpactCard icon="🌿" m={m("green_score")} />
          </div>
          {r.comparison.insights.map((t) => (
            <p key={t} className="mt-4 rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-4 py-3 text-xs leading-5 text-slate-300">{t}</p>
          ))}
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">What Changed?</h2>
            <div className="mt-5 space-y-4">
              {(r.changes.length ? r.changes : [{ description: rec?.recommendation || "The optimized program differs from the original." }]).map((ch, i) => (
                <div key={i} className="flex gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                  <p className="text-sm text-slate-300">{ch.line ? <span className="text-slate-500">line {ch.line}: </span> : null}{ch.description}</p>
                </div>
              ))}
              {rec?.why_it_matters && (
                <div className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-400" />
                  <div><p className="text-sm font-medium text-slate-200">Why</p><p className="mt-1 text-xs leading-5 text-slate-500">{rec.why_it_matters}</p></div></div>
              )}
            </div>
          </Card>

          <div className={`rounded-2xl border p-6 ${verBox[v.status]}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${v.status === "verified" ? "bg-emerald-500/10 text-emerald-400" : v.status === "failed" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>{verIcon[v.status]}</div>
              <div><h2 className="text-lg font-semibold">{v.label}</h2><p className="mt-1 text-xs text-slate-400">{v.reason}</p></div>
            </div>
            <ul className="mt-5 space-y-2 rounded-xl bg-slate-950/60 p-4 text-sm">
              {v.checks.map((ch) => (
                <li key={ch.name} className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">{ch.name}</span>
                  <span className={ch.passed ? "text-emerald-400" : "text-red-300"} title={ch.detail}>{ch.passed ? "Pass" : "Fail"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Scope: {v.scope}. This is a behavioural check on this one execution, not a formal equivalence proof.</p>
          </div>
        </div>

        <Card className="mt-6 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Apply Optimization</h2>
              <p className="mt-1 text-sm text-slate-500">Accepting makes the optimized code the working code in the Code Analyzer. Revert restores your original.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={verTone[v.status]}>{v.label}</Badge>
              <button onClick={c.acceptOptimization} disabled={v.status === "failed" || c.accepted}
                title={v.status === "failed" ? "Blocked: verification failed" : ""}
                className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
                {c.accepted ? "Accepted" : "Accept Optimization"}
              </button>
              <button onClick={c.revertOptimization} disabled={!c.accepted}
                className="rounded-xl border border-slate-700 bg-slate-950 px-6 py-3 font-medium text-slate-300 transition hover:bg-slate-900 disabled:opacity-50">
                Revert
              </button>
            </div>
          </div>
          {c.accepted && (
            <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-semibold text-emerald-400">✓ Optimization accepted</p>
              <p className="mt-1 text-sm text-slate-400">The optimized code is now the working code. <Link to="/analyzer" className="text-emerald-400 hover:underline">Open Code Analyzer</Link> and re-run the analysis to measure it as the new baseline.</p>
            </div>
          )}
          {v.status === "inconclusive" && !c.accepted && (
            <p className="mt-4 text-xs text-amber-300">Verification was inconclusive — review the code yourself before accepting.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default Optimization;
