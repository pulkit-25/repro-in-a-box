import type { ReproAttempt, ReproEvent } from "../types";

function formatTime(ts: string): string {
  const d = new Date(ts);
  const start = d.getTime();
  return d.toLocaleTimeString("en", { hour12: false, minute: "2-digit", second: "2-digit" });
}

function eventIcon(type: string): string {
  switch (type) {
    case "bug_detected": return "💥";
    case "reproduction_confirmed": return "✓";
    case "console_error": return "⚠";
    case "recovery": return "↻";
    case "upload": return "📁";
    case "login": return "🔑";
    case "navigation": return "→";
    case "agent_action": return "•";
    default: return "·";
  }
}

export default function Timeline({ events, attempts }: { events: ReproEvent[]; attempts: ReproAttempt[] }) {
  const startTime = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : Date.now();

  const timelineItems = events
    .filter((e) =>
      ["agent_action", "bug_detected", "reproduction_confirmed", "console_error", "recovery", "login", "navigation", "upload", "attempt_started", "attempt_ended"].includes(e.eventType)
    )
    .map((e) => ({
      time: formatTime(e.timestamp),
      offset: Math.round((new Date(e.timestamp).getTime() - startTime) / 1000),
      icon: eventIcon(e.eventType),
      label:
        e.eventType === "agent_action" ? `${e.action}${e.target ? ` ${e.target}` : ""}` :
        e.eventType === "attempt_started" ? `Attempt #${(e.data?.attemptNumber as number) ?? "?"}` :
        e.eventType === "attempt_ended" ? `Attempt ended: ${e.result}` :
        e.eventType === "bug_detected" ? "Crash detected" :
        e.eventType.replace(/_/g, " "),
      type: e.eventType,
    }));

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-zinc-600">Timeline</span>
        {timelineItems.length === 0 ? (
          <span className="text-xs text-zinc-600">Events will appear here during reproduction</span>
        ) : (
          timelineItems.map((item, i) => (
            <div key={i} className="flex shrink-0 items-center gap-1.5 text-xs">
              <span className="font-mono text-zinc-600">{String(item.offset).padStart(2, "0")}:{item.time.split(":").slice(1).join(":")}</span>
              <span>{item.icon}</span>
              <span className={item.type === "bug_detected" ? "text-red-400" : "text-zinc-400"}>{item.label}</span>
              {i < timelineItems.length - 1 && <span className="mx-1 text-zinc-700">|</span>}
            </div>
          ))
        )}
        {attempts.length > 0 && (
          <span className="ml-auto shrink-0 text-xs text-zinc-600">
            {attempts.filter((a) => a.status === "reproduced").length}/{attempts.length} reproduced
          </span>
        )}
      </div>
    </div>
  );
}
