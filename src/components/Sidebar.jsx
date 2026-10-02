import { NavLink } from "react-router-dom";
import { useAnalysis } from "../context/useAnalysis";

function Sidebar() {
  const { backend } = useAnalysis();
  const online = backend.status === "online";
  const links = [
    { name: "Dashboard", path: "/dashboard", icon: "⌂" },
    { name: "Code Analyzer", path: "/analyzer", icon: "</>" },
    { name: "Analysis", path: "/analysis", icon: "◉" },
    { name: "AI Advisor", path: "/ai", icon: "✦" },
    { name: "Optimization", path: "/optimization", icon: "⚡" },
  ];

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-800 bg-[#071018] px-4 py-5">
      
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl shadow-[0_0_25px_rgba(16,185,129,0.08)]">
          🌿
        </div>

        <div>
          <h1 className="text-lg font-bold tracking-tight">
            Green<span className="text-emerald-400">Compile</span>
          </h1>

          <p className="text-[10px] text-slate-500">
            Compile Smarter. Optimize Greener.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-1.5">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 shadow-inner shadow-emerald-500/5"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`
            }
          >
            <span className="w-6 text-base">{link.icon}</span>
            <span>{link.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="mt-auto">
        <div className="mb-4 border-t border-slate-800 pt-4">
          <div className="rounded-xl bg-slate-900/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-400">
                DU
              </div>

              <div>
                <p className="text-sm font-medium">Developer</p>
                <p className="text-xs text-slate-500">
                  GreenCompile User
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mb-3 flex items-center gap-2 px-2 text-xs text-slate-500"
          title={online ? "FastAPI backend reachable" : "Start the backend: cd backend && uvicorn main:app --reload"}
        >
          <span className={`h-2 w-2 rounded-full ${backend.status === "checking" ? "bg-slate-500" : online ? "bg-emerald-400" : "bg-red-400"}`} />
          Backend {backend.status === "checking" ? "checking..." : online ? "online" : "offline"}
        </div>

        <div className="flex items-center justify-between px-2 text-xs text-slate-500">
          <span>Dark Mode</span>

          <div className="h-6 w-11 rounded-full bg-emerald-500/20 p-1">
            <div className="ml-auto h-4 w-4 rounded-full bg-emerald-400" />
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;