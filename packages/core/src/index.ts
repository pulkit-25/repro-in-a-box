export type RunStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "reproduced"
  | "not_reproduced"
  | "verifying"
  | "verified"
  | "failed"
  | "cancelled";

export type AttemptStatus = "running" | "failed" | "suspicious" | "reproduced";

export interface Hypothesis {
  goal: string;
  suspectedArea: string;
  possibleTriggers: string[];
  successConditions: string[];
  updatedAt?: string;
  notes?: string[];
}

export interface ReproStep {
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface FailureEvidence {
  type: string;
  message: string;
  stack?: string;
  url?: string;
  screenshot?: string;
}

export interface EnvironmentInfo {
  browser: string;
  viewport: string;
  targetUrl: string;
  sessionId?: string;
  recordingUrl?: string;
}

export interface ReproductionResult {
  bugId: string;
  status: "reproduced" | "not_reproduced" | "verified" | "verification_failed";
  confidence: number;
  attempts: number;
  successfulReproductions: number;
  durationMs: number;
  environment: EnvironmentInfo;
  steps: ReproStep[];
  failure?: FailureEvidence;
  hypothesis: Hypothesis;
  bundlePath?: string;
}

export interface RegressionCheck {
  name: string;
  passed: boolean;
  message?: string;
}

export interface VerificationResult {
  bugId: string;
  passed: boolean;
  beforeFix: { reproduced: boolean; confidence: number };
  afterFix: { reproduced: boolean; confidence: number };
  regressionChecks: RegressionCheck[];
}

export interface BugReport {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface ReproRun {
  id: string;
  bugReport: BugReport;
  status: RunStatus;
  hypothesis?: Hypothesis;
  attempts: ReproAttempt[];
  result?: ReproductionResult;
  verification?: VerificationResult;
  events: ReproEvent[];
  createdAt: string;
  updatedAt: string;
  bundlePath?: string;
  replayUrl?: string;
  fixHandoff?: FixHandoff;
}

export interface ReproAttempt {
  id: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  endedAt?: string;
  steps: ReproStep[];
  evidence: EvidenceSignal[];
  hypothesisNotes?: string[];
  failureReason?: string;
}

export interface EvidenceSignal {
  type: EvidenceType;
  strength: "strong" | "weak";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type EvidenceType =
  | "console_error"
  | "javascript_exception"
  | "http_500"
  | "blank_page"
  | "error_screen"
  | "crash_message"
  | "network_failure"
  | "dom_anomaly"
  | "ui_unresponsive"
  | "screenshot_match";

export type EventType =
  | "environment_created"
  | "environment_destroyed"
  | "login"
  | "navigation"
  | "click"
  | "type"
  | "upload"
  | "screenshot"
  | "console_error"
  | "network_error"
  | "hypothesis_created"
  | "hypothesis_updated"
  | "recovery"
  | "bug_detected"
  | "reproduction_confirmed"
  | "attempt_started"
  | "attempt_ended"
  | "agent_reasoning"
  | "agent_action"
  | "verification_started"
  | "verification_completed";

export interface ReproEvent {
  timestamp: string;
  runId: string;
  attemptId?: string;
  eventType: EventType;
  action?: string;
  target?: string;
  result?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface FixHandoff {
  bugDescription: string;
  reproductionSteps: string[];
  evidence: EvidenceSignal[];
  logs: { console: string[]; network: string[] };
  screenshots: string[];
  expectedBehavior: string;
  observedBehavior: string;
  confidence: number;
  bundlePath: string;
}

export interface AgentAction {
  type: "click" | "type" | "navigate" | "upload" | "wait" | "scroll" | "select" | "press" | "done" | "recover";
  selector?: string;
  text?: string;
  url?: string;
  filePath?: string;
  ms?: number;
  value?: string;
  key?: string;
  reason: string;
}

export interface AgentObservation {
  url: string;
  title: string;
  screenshotBase64?: string;
  visibleText: string;
  consoleErrors: string[];
  networkErrors: string[];
  isErrorPage: boolean;
  isBlank: boolean;
}

export interface AgentPlan {
  reasoning: string;
  actions: AgentAction[];
  hypothesisUpdate?: Partial<Hypothesis>;
  shouldContinue: boolean;
  recoveryNeeded?: boolean;
  recoveryAction?: string;
}

export interface Config {
  solariApiKey: string;
  openrouterApiKey: string;
  modelProvider: string;
  modelName: string;
  openrouterBaseUrl: string;
  targetUrl: string;
  testUsername: string;
  testPassword: string;
  buggyboardApiUrl: string;
  reproServerPort: number;
  reproDataDir: string;
  maxReproAttempts: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function loadConfig(): Config {
  return {
    solariApiKey: process.env.SOLARI_API_KEY ?? "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    modelProvider: process.env.MODEL_PROVIDER ?? "openrouter",
    modelName: process.env.MODEL_NAME ?? "openai/gpt-4o-mini",
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    targetUrl: process.env.TARGET_URL ?? "http://localhost:5173",
    testUsername: process.env.TEST_USERNAME ?? "demo@buggyboard.io",
    testPassword: process.env.TEST_PASSWORD ?? "demo1234",
    buggyboardApiUrl: process.env.BUGGYBOARD_API_URL ?? "http://localhost:3001",
    reproServerPort: parseInt(process.env.REPRO_SERVER_PORT ?? "4000", 10),
    reproDataDir: process.env.REPRO_DATA_DIR ?? "./.repro",
    maxReproAttempts: parseInt(process.env.MAX_REPRO_ATTEMPTS ?? "10", 10),
    viewportWidth: parseInt(process.env.AGENT_VIEWPORT_WIDTH ?? "1280", 10),
    viewportHeight: parseInt(process.env.AGENT_VIEWPORT_HEIGHT ?? "800", 10),
  };
}

export function createEvent(
  runId: string,
  eventType: EventType,
  partial: Partial<ReproEvent> = {}
): ReproEvent {
  return {
    timestamp: new Date().toISOString(),
    runId,
    eventType,
    ...partial,
  };
}

export function generateId(prefix = "run"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
