import { useEffect, useState } from "react";
import { apiFetch } from "../lib/auth";

interface Project {
  id: string;
  name: string;
  rowCount: number;
  createdAt: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);

  const load = () => apiFetch("/projects").then((r) => r.json()).then(setProjects);
  useEffect(() => { load(); }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    load();
  };

  const handleUpload = async (projectId: string, file: File) => {
    setUploading(projectId);
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch(`/projects/${projectId}/upload`, { method: "POST", body: form });
    const data = await res.json();
    if (data.rowCount > 50000) localStorage.setItem("bb_large_dataset", "1");
    setUploading(null);
    load();
  };

  const seedLarge = async (projectId: string) => {
    setUploading(projectId);
    await apiFetch(`/projects/${projectId}/seed-large`, { method: "POST" });
    localStorage.setItem("bb_large_dataset", "1");
    setUploading(null);
    load();
  };

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-slate-400">Create projects and upload CSV datasets.</p>
      </header>

      <form onSubmit={createProject} className="mb-8 flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          required
        />
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500">
          Create Project
        </button>
      </form>

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <h3 className="font-medium">{p.name}</h3>
              <p className="text-sm text-slate-500">
                {p.rowCount.toLocaleString()} rows · Created {new Date(p.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="seed-large-dataset"
                onClick={() => seedLarge(p.id)}
                disabled={uploading === p.id}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {uploading === p.id ? "Loading..." : "Load large demo dataset"}
              </button>
              <label className="cursor-pointer rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800">
                {uploading === p.id ? "Uploading..." : "Upload CSV"}
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(p.id, e.target.files[0])}
                  disabled={uploading === p.id}
                />
              </label>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-center text-slate-500 py-8">No projects yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
