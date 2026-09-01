import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/auth";

interface Stats {
  projects: number;
  totalRows: number;
  lastUpload: string | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch("/dashboard/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400">Welcome back. Here's your overview.</p>
      </header>

      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          { label: "Projects", value: stats?.projects ?? "—", color: "indigo" },
          { label: "Data Rows", value: stats?.totalRows?.toLocaleString() ?? "—", color: "emerald" },
          { label: "Last Upload", value: stats?.lastUpload ? new Date(stats.lastUpload).toLocaleDateString() : "—", color: "amber" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="flex gap-3">
          <Link to="/projects" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500">
            Manage Projects
          </Link>
          <Link to="/analytics" className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
            View Analytics
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-amber-900/30 bg-amber-950/20 p-4">
        <p className="text-sm text-amber-300">💡 Tip: Upload a large CSV dataset to unlock full analytics features.</p>
      </div>
    </div>
  );
}
