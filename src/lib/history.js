const KEY = "greencompile.history.v1";
const MAX = 10;

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pushHistory(analysis, optimization) {
  const entry = {
    id: analysis.analysis_id,
    timestamp: analysis.timestamp,
    summary: {
      compiler: analysis.compiler,
      optimization_level: analysis.optimization_level,
      execution_time_ms: analysis.performance.execution_time_ms,
      energy_joules: analysis.energy.energy_joules,
      carbon_gco2e: analysis.carbon.carbon_gco2e,
      green_score: analysis.green_score.score,
    },
    analysis,
    optimization: optimization?.status === "ok" ? optimization : null,
  };
  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full/unavailable: keep in-memory list only
  }
  return list;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return [];
}
