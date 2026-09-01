import type { ReproAttempt, ReproRun } from "../types";

export default function AgentPanel({ run, attempt }: { run: ReproRun | null; attempt?: ReproAttempt }) {
  const reasoningEvents = run?.events.filter((e) => e.eventType === "agent_reasoning") ?? [];
  const latestReasoning = reasoningEvents.at(-1);

  return (
    <div className="flex w-80 flex-col border-l border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Agent</h2>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {attempt && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Current Attempt</p>
            <p className="text-lg font-semibold">#{attempt.attemptNumber}</p>
            <p className={`text-sm ${
              attempt.status === "reproduced" ? "text-emerald-400" :
              attempt.status === "suspicious" ? "text-amber-400" :
              attempt.status === "running" ? "text-blue-400" : "text-zinc-500"
            }`}>
              {attempt.status === "reproduced" ? "✓ Reproduced" :
               attempt.status === "suspicious" ? "⚠ Suspicious" :
               attempt.status === "running" ? "● Running" : "✗ Not reproduced"}
            </p>
          </div>
        )}

        {latestReasoning && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-medium text-zinc-500">Reasoning</h3>
            <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300">
              {latestReasoning.message}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-500">Event Log</h3>
          <div className="space-y-1">
            {(run?.events ?? []).slice(-20).reverse().map((e, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="font-mono text-zinc-600 shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString("en", { hour12: false, minute: "2-digit", second: "2-digit" })}
                </span>
                <span className={`${
                  e.eventType === "bug_detected" ? "text-red-400" :
                  e.eventType === "recovery" ? "text-amber-400" :
                  e.eventType === "reproduction_confirmed" ? "text-emerald-400" :
                  "text-zinc-400"
                }`}>
                  {e.eventType === "agent_action" ? `${e.action} ${e.target ?? ""}` : e.eventType.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
