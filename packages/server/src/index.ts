import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "@repro/core";
import { ReproOrchestrator } from "./orchestrator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env"), override: true });

const config = loadConfig();
const app = express();
app.use(cors());
app.use(express.json());

const orchestrator = new ReproOrchestrator(config, (run) => {
  broadcast({ type: "run_update", run });
});

const clients = new Set<WebSocket>();

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    solariConfigured: Boolean(config.solariApiKey && config.solariApiKey !== "slr_live_your_key_here"),
    openrouterConfigured: Boolean(config.openrouterApiKey && config.openrouterApiKey !== "sk-or-v1-your_key_here"),
    targetUrl: config.targetUrl,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    targetUrl: config.targetUrl,
    testUsername: config.testUsername,
    modelName: config.modelName,
    maxAttempts: config.maxReproAttempts,
    viewport: `${config.viewportWidth}x${config.viewportHeight}`,
  });
});

app.get("/api/runs", (_req, res) => {
  res.json(orchestrator.listRuns());
});

app.get("/api/runs/:id", (req, res) => {
  const run = orchestrator.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});

app.post("/api/runs", async (req, res) => {
  const { description, title } = req.body as { description?: string; title?: string };
  if (!description) return res.status(400).json({ error: "description required" });

  const run = await orchestrator.startReproduction(description, title);
  res.status(201).json(run);
});

app.post("/api/runs/:id/verify", async (req, res) => {
  try {
    const run = await orchestrator.verifyFix(req.params.id);
    res.json(run);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/runs/:id/fix-handoff", (req, res) => {
  try {
    const handoff = orchestrator.generateFixHandoff(req.params.id);
    res.json(handoff);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function main() {
  await mkdir(config.reproDataDir, { recursive: true });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.send(JSON.stringify({ type: "connected", runs: orchestrator.listRuns() }));
  });

  server.listen(config.reproServerPort, () => {
    console.log(`Repro server running on http://localhost:${config.reproServerPort}`);
    console.log(`Target: ${config.targetUrl}`);
    console.log(`Solari: ${config.solariApiKey ? "configured" : "using local Playwright fallback"}`);
    console.log(`OpenRouter: ${config.openrouterApiKey ? "configured" : "NOT configured"}`);
  });
}

main();
