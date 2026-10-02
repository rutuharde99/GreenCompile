import { useAnalysis } from "../context/useAnalysis";
import { Badge, Card, EmptyState, EstimatedTag, PageHeader, StaleNotice } from "../components/ui";
import { severityTone } from "../lib/severity";
import { fmtCarbon, fmtEnergy, fmtMem, fmtMs, fmtPctVal } from "../lib/format";

const Row = ({ k, v, extra }) => (
  <div className="flex items-center justify-between gap-4 border-b border-slate-800/60 py-2.5 text-sm last:border-none">
    <span className="text-slate-400">{k} {extra}</span>
    <span className="text-right font-medium text-slate-100">{v}</span>
  </div>
);

function Analysis() {
  const c = useAnalysis();
  const a = c.analysis;
  if (!a) {
    return (
      <div className="min-h-screen bg-[#050b10] text-white"><div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile Analysis" title="Detailed Analysis" subtitle="Compiler result, static analysis, execution metrics and detected patterns." />
        <EmptyState title="Nothing to show yet" text="Analyze a C program first." action={{ to: "/analyzer", label: "Open Code Analyzer" }} />
      </div></div>
    );
  }
  const s = a.static_analysis, p = a.performance, comp = a.compilation;
  const st = p.metrics_status;
  const tag = (x) => <Badge tone={x === "measured" ? "cyan" : x === "sampled" ? "amber" : "slate"}>{x}</Badge>;

  return (
    <div className="min-h-screen bg-[#050b10] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-7 lg:px-8">
        <PageHeader eyebrow="GreenCompile Analysis" title="Detailed Analysis"
          subtitle="Compiler result, static analysis, execution metrics and detected patterns." />
        {c.stale && <StaleNotice />}

        <div className="mt-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Compilation</h2>
            <div className="mt-4">
              <Row k="Compiler used" v={`${comp.compiler}`} />
              <Row k="Version" v={comp.compiler_version || "—"} />
              <Row k="Optimization" v={`-${a.optimization_level}`} />
              <Row k="Result" v={<Badge tone={comp.success ? "emerald" : "red"}>{comp.success ? "Success" : "Failed"}</Badge>} />
              <Row k="Compile time" v={fmtMs(comp.duration_ms)} />
              <Row k="Warnings / Errors" v={`${comp.warnings.length} / ${comp.errors.length}`} />
              <Row k="Binary size" v={comp.executable_size_bytes ? `${(comp.executable_size_bytes / 1024).toFixed(1)} KB` : "—"} />
            </div>
            {comp.note && <p className="mt-3 text-xs leading-5 text-amber-300">{comp.note}</p>}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Static Analysis</h2>
            <p className="mt-1 text-xs text-slate-500">{s.method}</p>
            <div className="mt-4">
              <Row k="Lines of code" v={s.lines_of_code} />
              <Row k="Tokens" v={s.tokens} />
              <Row k="Functions" v={s.function_count} />
              <Row k="Loops (max depth)" v={`${s.loop_count} (${s.max_loop_depth})`} />
              <Row k="Variables" v={s.variable_count} />
              <Row k="Branches (if/switch/?:)" v={s.branch_count} />
              <Row k="Cyclomatic complexity" v={s.cyclomatic_complexity} extra={<span className="text-[10px] text-slate-600">heuristic</span>} />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Execution</h2>
            <div className="mt-4">
              <Row k="Exit status" v={p.exit_code ?? "—"} />
              <Row k="Execution time" v={fmtMs(p.execution_time_ms)} extra={tag(st.execution_time)} />
              <Row k="CPU time" v={fmtMs(p.cpu_time_ms)} extra={tag(st.cpu)} />
              <Row k="CPU usage" v={fmtPctVal(p.cpu_usage_percent)} extra={tag(st.cpu)} />
              <Row k="Peak memory" v={fmtMem(p.peak_memory_mb)} extra={tag(st.memory)} />
              <Row k="Runs" v={p.runs} />
              {p.wall_ms && <Row k="Time min / max" v={`${fmtMs(p.wall_ms.min)} / ${fmtMs(p.wall_ms.max)}`} />}
            </div>
            <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-500">{p.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
            {p.stdout && <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">stdout: {p.stdout}</pre>}
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Estimation Basis</h2><EstimatedTag /></div>
            <div className="mt-4">
              <Row k="Estimated energy" v={fmtEnergy(a.energy.energy_joules)} />
              <Row k="Method" v={a.energy.method} />
              <Row k="Assumed power" v={`${a.environment.power_watts} W`} />
              <Row k="Estimated carbon" v={`${fmtCarbon(a.carbon.carbon_gco2e)} CO₂e`} />
              <Row k="Assumed carbon intensity" v={`${a.environment.carbon_intensity_gco2e_per_kwh} gCO₂e/kWh`} />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{a.energy.disclaimer} {a.carbon.disclaimer}</p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Detected Inefficient Patterns</h2>
            {a.patterns.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No inefficient patterns were detected by the current rule set. (This does not prove the code is optimal.)</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {a.patterns.map((x) => (
                  <li key={x.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{x.pattern} <span className="font-normal text-slate-500">· line {x.line}</span></p>
                      <Badge tone={severityTone[x.severity]}>{x.severity}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{x.explanation}</p>
                    {x.snippet && <pre className="mt-2 overflow-auto rounded bg-slate-900 px-3 py-2 text-xs text-orange-300">{x.snippet}</pre>}
                    <p className="mt-2 text-xs text-slate-500"><b className="text-slate-400">Performance:</b> {x.performance_impact}</p>
                    <p className="mt-1 text-xs text-slate-500"><b className="text-slate-400">Energy:</b> {x.energy_impact}</p>
                    <p className="mt-1 text-xs text-emerald-400">Suggestion: {x.suggestion}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Analysis;
