# Repro-in-a-Box

> **A bug report should become a reproducible computer, not a paragraph describing steps.**

Autonomous bug reproduction system built on [Solari](https://getsolari.com) (browser infrastructure) and OpenRouter (LLM reasoning).

**BUG REPORT → REPRODUCE → PACKAGE → FIX → VERIFY**

## Quick Start

### 1. Paste your API keys

Copy the example env file and add your keys:

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Where to get it |
|----------|----------------|
| `SOLARI_API_KEY` | [console.getsolari.com](https://console.getsolari.com) → API Keys |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |

```env
SOLARI_API_KEY=slr_live_your_actual_key
OPENROUTER_API_KEY=sk-or-v1-your_actual_key
```

Without `SOLARI_API_KEY`, the system falls back to local Playwright (headless Chromium on your machine). Without `OPENROUTER_API_KEY`, reproduction runs will fail at the agent reasoning step.

Point `TARGET_URL` at the **live BuggyBoard** deployment so Solari's cloud browser can reach it (localhost is not visible from Solari):

```env
TARGET_URL=https://buggyboard.vercel.app
```

The War Room and repro orchestrator still run locally (`npm run dev`). Only the demo target needs to be public.

### 2. Install & run

```bash
npm install
npm run dev
```

This starts three services:

| Service | URL | Purpose |
|---------|-----|---------|
| **BuggyBoard** (demo target) | http://localhost:5173 | Intentionally buggy SaaS app |
| **Repro Server** | http://localhost:4000 | Orchestrator API + WebSocket |
| **War Room** (UI) | http://localhost:5174 | Reproduction control panel |

### 3. Reproduce a bug

1. Open **War Room** at http://localhost:5174
2. The default bug report is pre-filled: *"Analytics sometimes crashes after importing a large CSV and changing filters."*
3. Click **REPRODUCE BUG**
4. Watch the agent operate BuggyBoard via Solari
5. When reproduced, download the fix handoff or click **VERIFY FIX**

## Architecture

```
Bug Report → Repro Orchestrator → Solari Manager → Agent Loop → Evidence Engine → Repro Bundle
                                                                              ↓
                                                                    Fix Handoff / Verifier
```

| Package | Role |
|---------|------|
| `apps/buggyboard` | Demo SaaS with seeded intermittent analytics crash |
| `apps/war-room` | Developer UI (War Room) |
| `packages/server` | HTTP API + WebSocket + orchestration |
| `packages/agent` | Observe → Think → Act loop |
| `packages/solari-manager` | Thin Solari abstraction |
| `packages/llm` | OpenRouter provider (swappable) |
| `packages/evidence` | Multi-signal confidence scoring |
| `packages/bundle` | Reproduction artifact generation |
| `packages/core` | Shared types and config |

## BuggyBoard Demo Credentials

```
Email:    demo@buggyboard.io
Password: demo1234
```

### The seeded bug

Analytics crashes intermittently when:
- A large CSV (>50k rows) is uploaded
- Date filter is changed to "Last 30 Days"
- Country filter is changed **while data is still loading**

This is a race condition — the agent must discover the sequence through trial and error.

## Environment Variables

See `.env.example` for the full list. Key variables:

```env
# Solari — cloud browser infrastructure
SOLARI_API_KEY=slr_live_...

# OpenRouter — LLM for hypothesis + agent planning
OPENROUTER_API_KEY=sk-or-v1-...
MODEL_NAME=openai/gpt-4o-mini

# Target application
TARGET_URL=http://localhost:5173
TEST_USERNAME=demo@buggyboard.io
TEST_PASSWORD=demo1234

# Agent settings
MAX_REPRO_ATTEMPTS=10
AGENT_VIEWPORT_WIDTH=1280
AGENT_VIEWPORT_HEIGHT=800
```

## API Endpoints

```
GET  /api/health          — Server status + key configuration check
GET  /api/config          — Public config (target URL, model, etc.)
GET  /api/runs            — List all reproduction runs
POST /api/runs            — Start reproduction { description, title? }
GET  /api/runs/:id        — Get run details
POST /api/runs/:id/verify — Verify fix after patching BuggyBoard
POST /api/runs/:id/fix-handoff — Generate coding-agent handoff JSON
WS   /ws                  — Real-time run updates
```

## Reproduction Bundle

Successful reproductions generate a bundle at `.repro/bundles/<run-id>/`:

```
repro-bundle/
├── README.md
├── reproduction.json
├── environment.json
├── steps.json
├── evidence.json
├── screenshots/
├── logs/
│   ├── console.log
│   └── network.log
└── recording/
    └── replay-url.txt
```

## Fixing the bug

After reproduction, click **FIX THIS BUG** to download a handoff JSON for Cursor/Codex/Claude Code. The handoff includes reproduction steps, evidence, logs, and expected vs observed behavior.

To fix BuggyBoard manually, the race condition is in `apps/buggyboard/src/pages/Analytics.tsx` — add proper request cancellation (AbortController) and ignore stale responses.

Then click **VERIFY FIX** to re-run the exact reproduction in a fresh Solari environment.

## Security

This prototype only targets **BuggyBoard** (localhost). Do not point it at unauthorized third-party systems.

## Development

```bash
npm run dev:buggyboard   # Demo app only
npm run dev:server       # Repro server only
npm run dev:ui           # War Room only
npm run build            # Build all packages
npm run typecheck        # Type-check all packages
```
