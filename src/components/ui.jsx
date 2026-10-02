import { Link } from "react-router-dom";

export function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          {eyebrow}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-400 sm:text-base">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export const Card = ({ className = "", children }) => (
  <div className={`rounded-2xl border border-slate-800/80 bg-slate-900/80 shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${className}`}>
    {children}
  </div>
);

const tones = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  red: "bg-red-500/10 text-red-300 border-red-500/20",
  slate: "bg-slate-800/60 text-slate-300 border-slate-700",
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};
export const Badge = ({ tone = "slate", title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
    {children}
  </span>
);

/** Marks a value as an estimate, with the basis in a tooltip. */
export const EstimatedTag = ({ title = "Estimated from measured execution time and configurable assumptions; not a hardware measurement." }) => (
  <Badge tone="amber" title={title}>Estimated</Badge>
);

export function ErrorBanner({ title = "Something went wrong", children }) {
  return (
    <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
      <p className="text-sm font-semibold text-red-300">{title}</p>
      {children && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-200/80">{children}</p>}
    </div>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-xl text-emerald-400">◉</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{text}</p>
      {action && (
        <Link to={action.to} className="mt-6 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function StaleNotice() {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      The code in the editor has changed since this analysis. Results below describe the previously analyzed code — run the analysis again to update them.
    </div>
  );
}
