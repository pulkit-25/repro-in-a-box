import type { EvidenceSignal, EvidenceType, ReproAttempt } from "@repro/core";

export interface DetectionInput {
  consoleErrors: string[];
  networkErrors: string[];
  pageUrl: string;
  pageTitle: string;
  visibleText: string;
  isBlank: boolean;
  isErrorPage: boolean;
}

const CRASH_PATTERNS = [
  /cannot read propert/i,
  /uncaught/i,
  /something went wrong/i,
  /application error/i,
  /dashboard crashed/i,
  /analytics error/i,
  /typeerror/i,
  /referenceerror/i,
];

const ERROR_SCREEN_PATTERNS = [
  /something went wrong/i,
  /unexpected error/i,
  /dashboard crashed/i,
  /try refreshing/i,
];

export class EvidenceEngine {
  detect(input: DetectionInput): EvidenceSignal[] {
    const signals: EvidenceSignal[] = [];
    const now = new Date().toISOString();

    for (const err of input.consoleErrors) {
      const isCrash = CRASH_PATTERNS.some((p) => p.test(err));
      signals.push({
        type: isCrash ? "javascript_exception" : "console_error",
        strength: isCrash ? "strong" : "weak",
        message: err,
        timestamp: now,
      });
    }

    for (const err of input.networkErrors) {
      const is500 = /500|502|503/.test(err);
      signals.push({
        type: is500 ? "http_500" : "network_failure",
        strength: is500 ? "strong" : "weak",
        message: err,
        timestamp: now,
      });
    }

    if (input.isBlank) {
      signals.push({
        type: "blank_page",
        strength: "strong",
        message: "Page appears blank",
        timestamp: now,
      });
    }

    if (input.isErrorPage || ERROR_SCREEN_PATTERNS.some((p) => p.test(input.visibleText))) {
      signals.push({
        type: "error_screen",
        strength: "strong",
        message: "Error screen detected in UI",
        timestamp: now,
      });
    }

    if (CRASH_PATTERNS.some((p) => p.test(input.visibleText))) {
      signals.push({
        type: "crash_message",
        strength: "strong",
        message: "Crash message visible in UI",
        timestamp: now,
      });
    }

    return signals;
  }

  scoreConfidence(attempts: ReproAttempt[]): number {
    const reproduced = attempts.filter((a) => a.status === "reproduced");
    const suspicious = attempts.filter((a) => a.status === "suspicious");

    if (reproduced.length === 0) {
      if (suspicious.length > 0) return 0.3;
      return 0;
    }

    const allEvidence = reproduced.flatMap((a) => a.evidence);
    const strongCount = allEvidence.filter((e) => e.strength === "strong").length;
    const weakCount = allEvidence.filter((e) => e.strength === "weak").length;

    let score = 0.5;
    score += Math.min(strongCount * 0.15, 0.35);
    score += Math.min(weakCount * 0.05, 0.1);
    score += Math.min(reproduced.length * 0.1, 0.2);

    return Math.min(Math.round(score * 100) / 100, 0.99);
  }

  isReproduced(signals: EvidenceSignal[]): boolean {
    const strong = signals.filter((s) => s.strength === "strong");
    const crashTypes: EvidenceType[] = [
      "javascript_exception",
      "error_screen",
      "crash_message",
      "blank_page",
      "http_500",
    ];
    return strong.some((s) => crashTypes.includes(s.type));
  }

  isSuspicious(signals: EvidenceSignal[]): boolean {
    return signals.length > 0 && !this.isReproduced(signals);
  }
}
