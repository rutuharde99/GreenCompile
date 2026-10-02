import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { clearHistory, loadHistory, pushHistory } from "../lib/history";
import { AnalysisContext } from "./analysisContext";

export const DEFAULT_CODE = `#include <stdio.h>

int main() {
    int a = 5;
    int b = 10;
    int result = 0;

    for(int i = 0; i < 1000000; i++) {
        result = a * b;
    }

    printf("%d", result);

    return 0;
}
`;

const errMsg = (e) => (e instanceof ApiError ? e.message : "Unexpected error: " + (e?.message || e));

/**
 * Single shared workflow state: CodeAnalyzer -> Dashboard -> AI Advisor -> Optimization
 * all read/write the same analysis result.
 */
export function AnalysisProvider({ children }) {
  const [source, setSource] = useState(DEFAULT_CODE);
  const [compiler, setCompiler] = useState("clang");
  const [optimization, setOptimization] = useState("O2");

  const [stage, setStage] = useState("idle"); // idle | compiling | analyzing | optimizing | done | error
  const [error, setError] = useState(null);
  const [compileResult, setCompileResult] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const [recs, setRecs] = useState({ items: [], ai: null });
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);
  const [ignored, setIgnored] = useState([]);
  const [selectedRecId, setSelectedRecId] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [explainLoading, setExplainLoading] = useState(false);

  const [optResult, setOptResult] = useState(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState(null);
  const [baselineCode, setBaselineCode] = useState(null); // set while an optimization is accepted

  const [history, setHistory] = useState(loadHistory);
  const [backend, setBackend] = useState({ status: "checking", environment: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await api.health();
        const environment = await api.environment().catch(() => null);
        if (alive) setBackend({ status: "online", environment });
      } catch {
        if (alive) setBackend({ status: "offline", environment: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const busy = ["compiling", "analyzing", "optimizing"].includes(stage);
  const req = () => ({ source, compiler, optimization });

  const resetDerived = () => {
    setRecs({ items: [], ai: null });
    setIgnored([]);
    setSelectedRecId(null);
    setExplanations({});
    setOptResult(null);
    setOptError(null);
    setRecError(null);
  };

  const applyOptResult = (res) => {
    setOptResult(res);
    if (res.recommendations) setRecs({ items: res.recommendations, ai: res.ai || null });
    if (res.recommendation?.id) setSelectedRecId(res.recommendation.id);
  };

  async function runAnalysis() {
    if (busy) return;
    setError(null);
    resetDerived();
    setBaselineCode(null);
    let finalAnalysis;
    try {
      setStage("compiling");
      const comp = await api.compile(req());
      setCompileResult(comp);
      if (!comp.success) {
        setAnalysis(null);
        setStage("error");
        setError(comp.setup_required ? comp.note : "Compilation failed. See diagnostics below.");
        return;
      }
      setStage("analyzing");
      finalAnalysis = await api.analyze(req());
      setAnalysis(finalAnalysis);
      setCompileResult(finalAnalysis.compilation);
    } catch (e) {
      setStage("error");
      setError(errMsg(e));
      return;
    }
    let opt = null;
    try {
      setStage("optimizing");
      opt = await api.optimize({ ...req(), analysis_id: finalAnalysis.analysis_id });
      applyOptResult(opt);
    } catch (e) {
      setOptError(errMsg(e));
    }
    setHistory(pushHistory(finalAnalysis, opt));
    setStage("done");
  }

  async function refreshRecommendations() {
    if (!analysis) return;
    setRecLoading(true);
    setRecError(null);
    try {
      const out = await api.recommend({ ...req(), source: analysis.source_code, analysis_id: analysis.analysis_id });
      setRecs({ items: out.recommendations, ai: out.ai });
      setIgnored([]);
      setSelectedRecId(null);
    } catch (e) {
      setRecError(errMsg(e));
    } finally {
      setRecLoading(false);
    }
  }

  async function verifyCandidate(rec) {
    if (!analysis) return;
    setOptLoading(true);
    setOptError(null);
    try {
      const res = await api.optimize({
        source: analysis.source_code, compiler, optimization: analysis.optimization_level,
        analysis_id: analysis.analysis_id,
        optimized_code: rec?.optimized_code || undefined, recommendation_id: rec?.id,
      });
      applyOptResult(res);
    } catch (e) {
      setOptError(errMsg(e));
    } finally {
      setOptLoading(false);
    }
  }

  async function explain(rec) {
    setExplainLoading(true);
    try {
      const out = await api.explain({ source: analysis.source_code, recommendation: rec });
      setExplanations((x) => ({ ...x, [rec.id]: out }));
    } catch (e) {
      setExplanations((x) => ({ ...x, [rec.id]: { explanation: errMsg(e), source: "error" } }));
    } finally {
      setExplainLoading(false);
    }
  }

  const ignoreRec = (id) => setIgnored((x) => (x.includes(id) ? x : [...x, id]));

  function acceptOptimization() {
    if (optResult?.status !== "ok" || optResult.verification.status === "failed") return;
    setBaselineCode((b) => b ?? source);
    setSource(optResult.optimized_code);
  }
  function revertOptimization() {
    if (baselineCode != null) setSource(baselineCode);
    setBaselineCode(null);
  }

  function openHistory(entry) {
    const a = entry.analysis;
    setSource(a.source_code);
    setCompiler(a.compilation.requested_compiler);
    setOptimization(a.optimization_level);
    setAnalysis(a);
    setCompileResult(a.compilation);
    resetDerived();
    setBaselineCode(null);
    if (entry.optimization) applyOptResult(entry.optimization);
    setError(null);
    setStage("done");
  }

  const value = {
    source, setSource, compiler, setCompiler, optimization, setOptimization,
    stage, busy, error, compileResult, analysis,
    stale: Boolean(analysis) && analysis.source_code !== source,
    recs, recLoading, recError, ignored, selectedRecId, setSelectedRecId, explanations, explainLoading,
    optResult, optLoading, optError, accepted: baselineCode != null,
    history, backend,
    runAnalysis, refreshRecommendations, verifyCandidate, explain, ignoreRec,
    acceptOptimization, revertOptimization, openHistory,
    clearHistory: () => setHistory(clearHistory()),
  };
  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}
