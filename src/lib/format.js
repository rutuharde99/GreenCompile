const dash = "—";

export const fmtMs = (v) =>
  v == null ? dash : v < 1 ? `${(v * 1000).toFixed(0)} µs` : `${v.toFixed(2)} ms`;

export const fmtEnergy = (j) => {
  if (j == null) return dash;
  if (j < 1e-3) return `${(j * 1e6).toFixed(1)} µJ`;
  if (j < 1) return `${(j * 1e3).toFixed(2)} mJ`;
  return `${j.toFixed(3)} J`;
};

export const fmtCarbon = (g) => {
  if (g == null) return dash;
  if (g < 1e-3) return `${(g * 1e6).toFixed(2)} µg`;
  if (g < 1) return `${(g * 1e3).toFixed(3)} mg`;
  return `${g.toFixed(3)} g`;
};

export const fmtMem = (mb) => (mb == null ? dash : `${mb.toFixed(2)} MB`);
export const fmtPctVal = (v) => (v == null ? dash : `${v.toFixed(1)}%`);
export const fmtScore = (v) => (v == null ? dash : v.toFixed(1));

/** "↓ 5.6%" style change label from a change_percent value. */
export const fmtChange = (pct, unit = "%") => {
  if (pct == null) return dash;
  if (pct === 0) return `0${unit}`;
  return `${pct < 0 ? "↓" : "↑"} ${Math.abs(pct).toFixed(1)}${unit}`;
};

const metricFormatters = {
  execution_time_ms: fmtMs,
  cpu_time_ms: fmtMs,
  peak_memory_mb: fmtMem,
  energy_joules: fmtEnergy,
  carbon_gco2e: fmtCarbon,
  green_score: fmtScore,
};
export const fmtMetric = (key, v) => (metricFormatters[key] || String)(v);

export const timeAgo = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};
