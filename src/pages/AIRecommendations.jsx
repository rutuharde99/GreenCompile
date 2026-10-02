import { Link } from "react-router-dom";
import { useAnalysis } from "../context/useAnalysis";
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner, StaleNotice } from "../components/ui";
import { fmtChange } from "../lib/format";

const confTone = { low: "amber", medium: "cyan", high: "emerald" };
const confLevel = { low: 1, medium: 2, high: 3 };

function ImpactCard({ icon, title, metric }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-2xl">{icon}</div>
      <p className="mt-3 text-xs text-slate-500">{title}</p>
      {metric && metric.change_percent != null ? (
        <p className={`mt-1 text-sm font-medium ${metric.improved === false ? "text-red-300" : "text-emerald-400"}`}>
          Measured {fmtChange(metric.change_percent)}{metric.within_noise ? " (within noise)" : ""}
        </p>
      ) : (
        <p className="mt-1 text-sm font-medium text-slate-500">Not measured yet</p>
      )}
    </div>
  );
}

function SuggestionCard({ rec, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition hover:bg-slate-900 ${active ? "border-emerald-500/40 bg-slate-900" : "border-slate-800 bg-slate-950/70 hover:border-emerald-500/30"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{rec.issue}</h3>
        <span className="text-slate-500">›</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{rec.recommendation}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Badge tone={rec.source === "ai" ? "cyan" : "slate"}>{rec.source === "ai" ? "AI" : "Rule-based"}</Badge>
        <span className="text-[11px] text-slate-500">Confidence: <span className="text-slate-300">{rec.confidence}</span></span>
      </div>
    </button>
  );
}

function AIRecommendations() {
  const c = useAnalysis();
  const a = c.analysis;
  const visible = c.recs.items.filter((r) => !c.ignored.includes(r.id));
  const rec = visible.find((r) => r.id === c.selectedRecId) || visible[0];
  const ai = c.recs.ai;
  const opt = c.optResult?.status === "ok" && rec && c.optResult.recommendation?.id === rec.id ? c.optResult : null;
  const metric = (k) => opt?.comparison.metrics.find((m) => m.key === k);
  const ex = rec && c.explanations[rec.id];

  const statusText = c.recLoading ? "Analyzing..."
    : !ai ? "Analysis Ready"
      : ai.used ? `AI active · ${ai.model}`
        : ai.configured ? "AI unavailable · rule-based fallback" : "AI not configured · rule-based";

  if (!a) {
    return (
      <div className="min-h-screen bg-[#050b10] text-white"><div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile AI" title="Green AI Advisor" subtitle="AI-powered recommendations to make your code greener and more efficient." />
        <EmptyState title="Analyze a program first" text="The advisor works on the analysis result: detected patterns, compiler output and estimated energy." action={{ to: "/analyzer", label: "Open Code Analyzer" }} />
      </div></div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b10] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile AI" title="Green AI Advisor"
          subtitle="AI-powered recommendations to make your code greener and more efficient.">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-slate-500">Advisor Status</p>
            <p className="mt-1 text-sm font-medium text-emerald-400">● {statusText}</p>
          </div>
          <button onClick={c.refreshRecommendations} disabled={c.recLoading || c.stale}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">
            {c.recLoading && <Spinner />} {c.recLoading ? "Refreshing..." : "Refresh Analysis"}
          </button>
        </PageHeader>

        {c.stale && <StaleNotice />}
        {ai?.error && !ai.used && (
          <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{ai.error}</p>
        )}
        {c.recError && <div className="mt-6"><ErrorBanner title="Could not refresh recommendations">{c.recError}</ErrorBanner></div>}

        {!rec ? (
          <EmptyState title={c.recs.items.length ? "All recommendations dismissed" : "No recommendations"}
            text={c.recs.items.length ? "Use Refresh Analysis to bring them back."
              : "No inefficient patterns were detected by the rule set, and no AI suggestion is available. This does not prove the code is optimal."} />
        ) : (
          <div className="mt-8 grid gap-6 xl:grid-cols-12">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/80 xl:col-span-8">
              <div className="border-b border-slate-800 bg-gradient-to-r from-emerald-500/5 to-transparent p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-2xl">⚠</div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-400">
                      {rec.source === "ai" ? "AI Recommendation" : "Rule-based Recommendation"}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">{rec.issue}</h2>
                    <p className="mt-2 text-sm text-slate-400">Related pattern: {rec.related_pattern}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {opt && (
                  <div className={`mb-6 rounded-xl border p-4 ${opt.verification.status === "verified" ? "border-emerald-500/20 bg-emerald-500/10" : opt.verification.status === "failed" ? "border-red-500/25 bg-red-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
                    <p className="font-semibold text-slate-100">Suggestion applied — {opt.verification.label}</p>
                    <p className="mt-1 text-sm text-slate-400">{opt.verification.reason}</p>
                    <Link to="/optimization" className="mt-2 inline-block text-sm text-emerald-400 hover:underline">Review in Optimization →</Link>
                  </div>
                )}
                {c.optError && <div className="mb-6"><ErrorBanner title="Could not apply the suggestion">{c.optError}</ErrorBanner></div>}

                <p className="text-sm font-semibold text-white">Problem</p>
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-sm leading-6 text-slate-300">{rec.why_it_matters || "No further detail provided."}</p>
                </div>

                <p className="mt-6 text-sm font-semibold text-white">Recommendation</p>
                <div className="mt-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-5">
                  <div className="flex gap-3">
                    <div className="text-xl text-emerald-400">✦</div>
                    <div>
                      <p className="text-base font-medium text-emerald-300">{rec.recommendation}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{rec.expected_impact}</p>
                    </div>
                  </div>
                </div>

                {rec.optimized_code && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Proposed optimized code</p>
                      {rec.compiles === true && <Badge tone="emerald">Compiles</Badge>}
                      {rec.compiles === false && <Badge tone="red" title={rec.compile_errors.join("\n")}>Does not compile</Badge>}
                    </div>
                    <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-emerald-200">{rec.optimized_code}</pre>
                    {rec.compiles === false && <p className="mt-2 text-xs text-red-300">{rec.compile_errors.join(" ")}</p>}
                  </div>
                )}

                <p className="mt-6 text-sm font-semibold text-white">Impact</p>
                <p className="mt-1 text-xs text-slate-500">Numbers appear only after the optimization has been applied and re-measured; the advisor never supplies measurements.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ImpactCard icon="⏱" title="Execution Time" metric={metric("execution_time_ms")} />
                  <ImpactCard icon="▣" title="CPU Time" metric={metric("cpu_time_ms")} />
                  <ImpactCard icon="⚡" title="Estimated Energy" metric={metric("energy_joules")} />
                  <ImpactCard icon="☁" title="Estimated Carbon" metric={metric("carbon_gco2e")} />
                </div>

                <div className="mt-7 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Confidence</p>
                      <p className="mt-1 text-xs text-slate-500">Qualitative rating given by the {rec.source === "ai" ? "AI model" : "rule engine"}</p>
                    </div>
                    <Badge tone={confTone[rec.confidence]}>{rec.confidence}</Badge>
                  </div>
                  <div className="mt-4 flex gap-1.5">
                    {[1, 2, 3].map((n) => <div key={n} className={`h-2 flex-1 rounded-full ${n <= confLevel[rec.confidence] ? "bg-emerald-400" : "bg-slate-800"}`} />)}
                  </div>
                  {rec.assumptions?.length > 0 && (
                    <ul className="mt-4 space-y-1 text-xs leading-5 text-slate-500">
                      {rec.assumptions.map((s) => <li key={s}>• Assumption: {s}</li>)}
                    </ul>
                  )}
                </div>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => c.verifyCandidate(rec)} disabled={!rec.optimized_code || rec.compiles === false || c.optLoading || c.stale}
                    title={rec.optimized_code ? "" : "This suggestion is advisory: no automatic code change is available"}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
                    {c.optLoading ? <><Spinner /> Verifying...</> : "✦ Apply Suggestion"}
                  </button>
                  <button onClick={() => c.explain(rec)} disabled={c.explainLoading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/5 px-5 py-3.5 font-medium text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-60">
                    {c.explainLoading && <Spinner />} Explain Why
                  </button>
                  <button onClick={() => c.ignoreRec(rec.id)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3.5 font-medium text-slate-300 transition hover:bg-slate-800">
                    Ignore
                  </button>
                </div>

                {ex && (
                  <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                    <h3 className="font-semibold text-cyan-300">Why is this recommended?</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{ex.explanation}</p>
                    <p className="mt-3 text-[11px] text-slate-600">Source: {ex.source === "ai" ? "AI explanation" : ex.source === "error" ? "error" : "stored rule-based reasoning"}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 xl:col-span-4">
              <h2 className="text-lg font-semibold">All Suggestions</h2>
              <p className="mt-1 text-xs text-slate-500">{visible.length} active · {c.ignored.length} ignored</p>
              <div className="mt-6 space-y-3">
                {visible.map((r) => <SuggestionCard key={r.id} rec={r} active={r.id === rec.id} onClick={() => c.setSelectedRecId(r.id)} />)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-emerald-400">Green Tip · Example</p>
              <h3 className="mt-2 text-lg font-semibold">Optimize repeated work.</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Reducing unnecessary computation can improve efficiency and may reduce estimated energy consumption.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
              <p className="text-xs text-slate-500">Before</p>
              <pre className="mt-3 text-xs leading-6 text-orange-300">{`for(i = 0; i < n; i++) {\n    result = a * b;\n}`}</pre>
            </div>
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-5">
              <p className="text-xs text-emerald-400">After</p>
              <pre className="mt-3 text-xs leading-6 text-emerald-300">{`temp = a * b;\n\nfor(i = 0; i < n; i++) {\n    result = temp;\n}`}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIRecommendations;
