import { useAuth } from "../lib/auth";

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-400">Manage your account preferences.</p>
      </header>

      <div className="max-w-lg space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 font-medium">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Name</label>
              <p className="text-sm">{user?.name}</p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Email</label>
              <p className="text-sm">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 font-medium">Notifications</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked className="rounded" />
            Email me when data imports complete
          </label>
        </div>
      </div>
    </div>
  );
}
