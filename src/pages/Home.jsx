import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="min-h-screen bg-slate-950 px-10 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl pt-16">
          <div className="mb-5 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            AI-Assisted Sustainable Compiler
          </div>

          <h1 className="text-6xl font-bold leading-tight">
            Compile Smarter.
            <br />
            <span className="text-emerald-400">Optimize Greener.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            GreenCompile analyzes C programs for performance, energy
            consumption and estimated carbon footprint, then provides
            AI-assisted green optimization recommendations.
          </p>

          <div className="mt-8 flex gap-4">
            <Link
              to="/analyzer"
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Start Analyzing
            </Link>

            <Link
              to="/dashboard"
              className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-900"
            >
              Explore Dashboard
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-5 md:grid-cols-3">
          {[
            ["⌘", "Compiler Analysis"],
            ["✦", "AI Optimization"],
            ["⚡", "Energy Estimation"],
            ["🌱", "Carbon Estimation"],
            ["◉", "Green Score"],
            ["📊", "Sustainability Analysis"],
          ].map(([icon, title]) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
            >
              <div className="mb-4 text-2xl">{icon}</div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-500">
                Part of the GreenCompile analysis workflow.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Home;