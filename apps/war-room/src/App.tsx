import { useCallback, useEffect, useState } from "react";
import type { ReproEvent, ReproRun } from "./types";
import BugPanel from "./components/BugPanel";
import AgentPanel from "./components/AgentPanel";
import Timeline from "./components/Timeline";
import ResultPanel from "./components/ResultPanel";

const DEFAULT_BUG =
  "Analytics sometimes crashes after importing a large CSV and changing filters.";

export default function App() {
  const [runs, setRuns] = useState<ReproRun[]>([]);
  const [activeRun, setActiveRun] = useState<ReproRun | null>(null);
  const [bugReport, setBugReport] = useState(DEFAULT_BUG);
  const [starting, setStarting] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
    fetch("/api/runs").then((r) => r.json()).then((r: ReproRun[]) => {
      setRuns(r);
      if (r.length > 0) setActiveRun(r[0]);
    });
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "run_update") {
        const run = msg.run as ReproRun;
        setRuns((prev) => {
          const idx = prev.findIndex((r) => r.id === run.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = run;
            return next;
          }
          return [run, ...prev];
        });
        setActiveRun((prev) => (prev?.id === run.id ? run : prev));
      }
      if (msg.type === "connected") {
        setRuns(msg.runs ?? []);
      }
    };
    return () => ws.close();
  }, []);

  const startReproduction = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: bugReport, title: "Analytics Crash" }),
      });
      const run = await res.json();
      setActiveRun(run);
      setRuns((prev) => [run, ...prev]);
    } finally {
      setStarting(false);
    }
  }, [bugReport]);

  const verifyFix = async () => {
    if (!activeRun) return;
    const res = await fetch(`/api/runs/${activeRun.id}/verify`, { method: "POST" });
    const run = await res.json();
    setActiveRun(run);
  };

  const getFixHandoff = async () => {
    if (!activeRun) return;
    const res = await fetch(`/api/runs/${activeRun.id}/fix-handoff`, { method: "POST" });
    const handoff = await res.json();
    const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fix-handoff-${activeRun.id}.json`;
    a.click();
  };

  const latestEvents = activeRun?.events ?? [];
  const currentAttempt = activeRun?.attempts.at(-1);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold">R</div>
          <div>
            <h1 className="text-sm font-semibold">Repro-in-a-Box</h1>
            <p className="text-xs text-zinc-500">Autonomous Bug → Reproduce → Fix → Verify</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="rounded bg-zinc-800 px-2 py-1">
            Target: {(config?.targetUrl as string) ?? "—"}
          </span>
          <span className="rounded bg-emerald-900/30 px-2 py-1 text-emerald-400">AUTHORIZED TARGET</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <BugPanel
          bugReport={bugReport}
          onBugReportChange={setBugReport}
          onStart={startReproduction}
          starting={starting}
          activeRun={activeRun}
          runs={runs}
          onSelectRun={setActiveRun}
        />

        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col border-r border-zinc-800">
              <div className="border-b border-zinc-800 px-4 py-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Live Browser</h2>
              </div>
              <div className="flex flex-1 items-center justify-center bg-zinc-900/30 p-4">
                {activeRun?.status === "running" || activeRun?.status === "provisioning" ? (
                  <div className="text-center">
                    <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    <p className="text-sm text-zinc-400">
                      {activeRun.status === "provisioning" ? "Provisioning Solari environment..." : "Agent operating browser..."}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">Attempt #{currentAttempt?.attemptNumber ?? "—"}</p>
                  </div>
                ) : activeRun?.replayUrl ? (
                  <div className="text-center">
                    <a href={activeRun.replayUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium hover:bg-emerald-500">
                      WATCH REPLAY
                    </a>
                  </div>
                ) : (
                  <div className="text-center text-zinc-600">
                    <p className="text-4xl mb-2">🖥</p>
                    <p className="text-sm">Browser session will appear here during reproduction</p>
                  </div>
                )}
              </div>
            </div>

            <AgentPanel run={activeRun} attempt={currentAttempt} />
          </div>

          <Timeline events={latestEvents} attempts={activeRun?.attempts ?? []} />
        </div>

        <ResultPanel
          run={activeRun}
          onVerify={verifyFix}
          onFixHandoff={getFixHandoff}
        />
      </div>
    </div>
  );
}
