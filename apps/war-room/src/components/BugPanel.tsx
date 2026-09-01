import type { ReproRun } from "../types";

interface Props {
  bugReport: string;
  onBugReportChange: (v: string) => void;
  onStart: () => void;
  starting: boolean;
  activeRun: ReproRun | null;
  runs: ReproRun[];
  onSelectRun: (run: ReproRun) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-400",
  provisioning: "text-amber-400",
  running: "text-blue-400",
  reproduced: "text-emerald-400",
  not_reproduced: "text-red-400",
  verifying: "text-amber-400",
  verified: "text-emerald-400",
  failed: "text-red-400",
};

export default function BugPanel({
  bugReport,
  onBugReportChange,
  onStart,
  starting,
  activeRun,
  runs,
  onSelectRun,
}: Props) {
  const isRunning = activeRun?.status === "running" || activeRun?.status === "provisioning";

  return (
    <div className="flex w-72 flex-col border-r border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Bug Report</h2>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <textarea
          value={bugReport}
          onChange={(e) => onBugReportChange(e.target.value)}
          disabled={isRunning}
          rows={6}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-sm focus:border-emerald-600 focus:outline-none disabled:opacity-50"
          placeholder="Describe the bug..."
        />

        <button
          onClick={onStart}
          disabled={starting || isRunning || !bugReport.trim()}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40"
        >
          {starting ? "Starting..." : isRunning ? "Running..." : "REPRODUCE BUG"}
        </button>

        {activeRun && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">{activeRun.id.slice(0, 16)}</span>
              <span className={`text-xs font-medium ${STATUS_COLORS[activeRun.status] ?? "text-zinc-400"}`}>
                {activeRun.status.toUpperCase()}
              </span>
            </div>
            {activeRun.result && (
              <div className="mt-2 text-xs text-zinc-400">
                Confidence: {Math.round(activeRun.result.confidence * 100)}% · Attempts: {activeRun.result.attempts}
              </div>
            )}
          </div>
        )}

        {activeRun?.hypothesis && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium text-zinc-500">Hypothesis</h3>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs">
              <p className="text-zinc-300">{activeRun.hypothesis.goal}</p>
              <p className="mt-1 text-zinc-500">Area: {activeRun.hypothesis.suspectedArea}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {activeRun.hypothesis.possibleTriggers.map((t) => (
                  <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {runs.length > 1 && (
        <div className="border-t border-zinc-800 p-3">
          <h3 className="mb-2 text-xs text-zinc-500">Previous Runs</h3>
          <div className="max-h-32 space-y-1 overflow-auto">
            {runs.slice(1, 6).map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectRun(r)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-800"
              >
                {r.id.slice(0, 12)} — {r.status}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
