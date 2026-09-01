import type { ReproRun } from "../types";

export default function ResultPanel({
  run,
  onVerify,
  onFixHandoff,
}: {
  run: ReproRun | null;
  onVerify: () => void;
  onFixHandoff: () => void;
}) {
  if (!run?.result && !run?.verification) {
    return (
      <div className="flex w-72 flex-col border-l border-zinc-800 bg-zinc-900/30">
        <div className="border-b border-zinc-800 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Result</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-zinc-600">
          Results will appear after reproduction completes
        </div>
      </div>
    );
  }

  const result = run.result;
  const verification = run.verification;

  return (
    <div className="flex w-72 flex-col border-l border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Result</h2>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {result && (
          <>
            <div className={`mb-4 rounded-lg border p-4 text-center ${
              result.status === "reproduced"
                ? "border-emerald-800 bg-emerald-950/30"
                : "border-red-800 bg-red-950/30"
            }`}>
              <p className="text-2xl">{result.status === "reproduced" ? "✓" : "✗"}</p>
              <p className="mt-1 text-sm font-semibold">
                {result.status === "reproduced" ? "REPRODUCED" : "NOT REPRODUCED"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Confidence: {Math.round(result.confidence * 100)}%
              </p>
              <p className="text-xs text-zinc-500">
                {result.successfulReproductions} success / {result.attempts} attempts · {Math.round(result.durationMs / 1000)}s
              </p>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-zinc-500">Environment</h3>
              <div className="space-y-1 text-xs text-zinc-400">
                <p>{result.environment.browser} · {result.environment.viewport}</p>
                <p className="truncate">{result.environment.targetUrl}</p>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-zinc-500">Reproduction Steps</h3>
              <ol className="space-y-1 text-xs text-zinc-400">
                {result.steps.map((s, i) => (
                  <li key={i}>{i + 1}. {s.action}</li>
                ))}
              </ol>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-zinc-500">Evidence</h3>
              <div className="space-y-1 text-xs">
                <p className="text-emerald-400">✓ Session recording</p>
                <p className="text-emerald-400">✓ Screenshots</p>
                <p className="text-emerald-400">✓ Console errors</p>
                <p className="text-emerald-400">✓ Network events</p>
                <p className="text-emerald-400">✓ Environment metadata</p>
              </div>
            </div>

            {result.status === "reproduced" && (
              <div className="space-y-2">
                {run.replayUrl && (
                  <a
                    href={run.replayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full rounded-lg border border-zinc-700 py-2 text-center text-xs hover:bg-zinc-800"
                  >
                    WATCH REPLAY
                  </a>
                )}
                <button
                  onClick={onFixHandoff}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-medium hover:bg-indigo-500"
                >
                  FIX THIS BUG
                </button>
                <button
                  onClick={onVerify}
                  className="w-full rounded-lg border border-emerald-700 py-2 text-xs text-emerald-400 hover:bg-emerald-950/30"
                >
                  VERIFY FIX
                </button>
              </div>
            )}
          </>
        )}

        {verification && (
          <div className={`mt-4 rounded-lg border p-4 ${
            verification.passed ? "border-emerald-800 bg-emerald-950/30" : "border-red-800 bg-red-950/30"
          }`}>
            <p className="text-sm font-semibold">
              {verification.passed ? "✓ VERIFIED" : "✗ VERIFICATION FAILED"}
            </p>
            <div className="mt-3 space-y-1 text-xs">
              <p className="text-zinc-500">BEFORE FIX: {verification.beforeFix.reproduced ? "💥 CRASH" : "—"}</p>
              <p className="text-zinc-500">AFTER FIX: {verification.afterFix.reproduced ? "💥 CRASH" : "✓ PASSED"}</p>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs text-zinc-500">Regression checks</p>
              {verification.regressionChecks.map((c) => (
                <p key={c.name} className="text-xs">
                  {c.passed ? "✓" : "✗"} {c.name}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
