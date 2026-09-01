export interface Hypothesis {
  goal: string;
  suspectedArea: string;
  possibleTriggers: string[];
  successConditions: string[];
  notes?: string[];
}

export interface ReproStep {
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface EvidenceSignal {
  type: string;
  strength: "strong" | "weak";
  message: string;
  timestamp: string;
}

export interface ReproAttempt {
  id: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  endedAt?: string;
  steps: ReproStep[];
  evidence: EvidenceSignal[];
  failureReason?: string;
}

export interface ReproEvent {
  timestamp: string;
  runId: string;
  attemptId?: string;
  eventType: string;
  action?: string;
  target?: string;
  result?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ReproductionResult {
  bugId: string;
  status: string;
  confidence: number;
  attempts: number;
  successfulReproductions: number;
  durationMs: number;
  environment: {
    browser: string;
    viewport: string;
    targetUrl: string;
    recordingUrl?: string;
  };
  steps: ReproStep[];
  failure?: { type: string; message: string };
}

export interface VerificationResult {
  passed: boolean;
  beforeFix: { reproduced: boolean; confidence: number };
  afterFix: { reproduced: boolean; confidence: number };
  regressionChecks: { name: string; passed: boolean; message?: string }[];
}

export interface ReproRun {
  id: string;
  bugReport: { id: string; title: string; description: string; createdAt: string };
  status: string;
  hypothesis?: Hypothesis;
  attempts: ReproAttempt[];
  result?: ReproductionResult;
  verification?: VerificationResult;
  events: ReproEvent[];
  createdAt: string;
  updatedAt: string;
  bundlePath?: string;
  replayUrl?: string;
}
