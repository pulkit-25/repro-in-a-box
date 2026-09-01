import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Dashboard", icon: "◫" },
  { to: "/projects", label: "Projects", icon: "▦" },
  { to: "/analytics", label: "Analytics", icon: "◧" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900" data-testid="sidebar">
        <div className="border-b border-slate-800 p-4">
          <h1 className="text-lg font-bold text-indigo-400">BuggyBoard</h1>
          <p className="text-xs text-slate-500">Analytics Platform</p>
        </div>
        <nav className="flex-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-indigo-600/20 text-indigo-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold">
              {user?.name?.[0] ?? "U"}
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
