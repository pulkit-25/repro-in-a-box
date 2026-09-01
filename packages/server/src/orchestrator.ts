import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BugReport,
  Config,
  FixHandoff,
  ReproAttempt,
  ReproEvent,
  ReproRun,
  ReproductionResult,
  RegressionCheck,
  VerificationResult,
} from "@repro/core";
import { createEvent, generateId, loadConfig } from "@repro/core";
import { ReproAgent } from "@repro/agent";
import { BundleGenerator } from "@repro/bundle";
import { EvidenceEngine } from "@repro/evidence";
import { createEnvironmentManager } from "@repro/solari-manager";
import type { BrowserEnvironment } from "@repro/solari-manager";

export type RunUpdateCallback = (run: ReproRun) => void;

export class ReproOrchestrator {
  private runs = new Map<string, ReproRun>();
  private evidence = new EvidenceEngine();
  private bundleGen: BundleGenerator;
  private envManager;
  private activeEnvironments = new Map<string, BrowserEnvironment>();
  private screenshotPaths = new Map<string, { name: string; path: string }[]>();

  constructor(
    private config: Config,
    private onUpdate: RunUpdateCallback
  ) {
    this.bundleGen = new BundleGenerator(config.reproDataDir);
    this.envManager = createEnvironmentManager(config);
  }

  getRun(id: string): ReproRun | undefined {
    return this.runs.get(id);
  }

  listRuns(): ReproRun[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async startReproduction(description: string, title?: string): Promise<ReproRun> {
    const run: ReproRun = {
      id: generateId("bug"),
      bugReport: {
        id: generateId("report"),
        title: title ?? "Bug Report",
        description,
        createdAt: new Date().toISOString(),
      },
      status: "pending",
      attempts: [],
      events: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.runs.set(run.id, run);
    this.emit(run);

    this.executeReproduction(run.id).catch((err) => {
      const r = this.runs.get(run.id);
      if (r) {
        r.status = "failed";
        r.events.push(
          createEvent(run.id, "environment_destroyed", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
        this.emit(r);
      }
    });

    return run;
  }

  async verifyFix(runId: string): Promise<ReproRun> {
    const run = this.runs.get(runId);
    if (!run || !run.result) throw new Error("Run not found or not reproduced");

    run.status = "verifying";
    run.events.push(createEvent(runId, "verification_started"));
    this.emit(run);

    const beforeFix = {
      reproduced: true,
      confidence: run.result.confidence,
    };

    let env: BrowserEnvironment | null = null;
    try {
      env = await this.envManager.createBrowser(true);
      this.activeEnvironments.set(runId, env);

      const agent = this.createAgent(run);
      const hypothesis = run.hypothesis!;

      const attempt = await agent.runAttempt(
        runId,
        run.bugReport.description,
        hypothesis,
        1,
        [],
        env,
        true
      );

      run.attempts.push(attempt);

      const reproduced = this.evidence.isReproduced(attempt.evidence);
      const regressionChecks = await this.runRegressionChecks(env);

      const verification: VerificationResult = {
        bugId: runId,
        passed: !reproduced && regressionChecks.every((c) => c.passed),
        beforeFix,
        afterFix: {
          reproduced,
          confidence: this.evidence.scoreConfidence([attempt]),
        },
        regressionChecks,
      };

      run.verification = verification;
      run.status = verification.passed ? "verified" : "failed";
      run.events.push(
        createEvent(runId, "verification_completed", {
          result: verification.passed ? "passed" : "failed",
        })
      );
    } finally {
      if (env) await this.envManager.destroyEnvironment(env);
      this.activeEnvironments.delete(runId);
    }

    this.emit(run);
    return run;
  }

  generateFixHandoff(runId: string): FixHandoff {
    const run = this.runs.get(runId);
    if (!run?.result) throw new Error("Run not reproduced");
    const handoff = this.bundleGen.generateFixHandoff(run, run.bundlePath ?? "");
    run.fixHandoff = handoff;
    this.emit(run);
    return handoff;
  }

  private async executeReproduction(runId: string) {
    const run = this.runs.get(runId)!;
    const startTime = Date.now();

    run.status = "provisioning";
    this.emit(run);

    const agent = this.createAgent(run);
    run.hypothesis = await agent.generateHypothesis(run.bugReport.description);
    run.events.push(
      createEvent(runId, "hypothesis_created", {
        message: JSON.stringify(run.hypothesis),
      })
    );

    let env: BrowserEnvironment | null = null;
    try {
      env = await this.envManager.createBrowser(true);
      this.activeEnvironments.set(runId, env);
      run.events.push(
        createEvent(runId, "environment_created", {
          data: { sessionId: env.sessionId },
        })
      );
      this.emit(run);

      run.status = "running";
      this.emit(run);

      const maxAttempts = this.config.maxReproAttempts;
      let reproduced = false;

      for (let i = 1; i <= maxAttempts && !reproduced; i++) {
        const attempt = await agent.runAttempt(
          runId,
          run.bugReport.description,
          run.hypothesis,
          i,
          run.attempts,
          env
        );
        run.attempts.push(attempt);
        this.emit(run);

        if (attempt.status === "reproduced") {
          reproduced = true;
          run.events.push(
            createEvent(runId, "reproduction_confirmed", {
              message: `Reproduced on attempt ${i}`,
            })
          );
        }

        if (i < maxAttempts && !reproduced) {
          await env.page.goto(this.config.targetUrl, { waitUntil: "networkidle" }).catch(() => {});
          await env.page.waitForTimeout(1000);
        }
      }

      const successfulReproductions = run.attempts.filter((a) => a.status === "reproduced").length;
      const confidence = this.evidence.scoreConfidence(run.attempts);
      const logs = agent.getLogs();

      const result: ReproductionResult = {
        bugId: runId,
        status: reproduced ? "reproduced" : "not_reproduced",
        confidence,
        attempts: run.attempts.length,
        successfulReproductions,
        durationMs: Date.now() - startTime,
        environment: {
          browser: "chrome",
          viewport: `${this.config.viewportWidth}x${this.config.viewportHeight}`,
          targetUrl: this.config.targetUrl,
          sessionId: env.sessionId,
        },
        steps: run.attempts.find((a) => a.status === "reproduced")?.steps ?? run.attempts.at(-1)?.steps ?? [],
        failure: reproduced
          ? {
              type: "javascript_exception",
              message:
                run.attempts
                  .find((a) => a.status === "reproduced")
                  ?.evidence.find((e) => e.strength === "strong")?.message ?? "Application crash",
            }
          : undefined,
        hypothesis: run.hypothesis,
      };

      run.result = result;
      run.status = reproduced ? "reproduced" : "not_reproduced";

      if (reproduced) {
        const screenshots = this.screenshotPaths.get(runId) ?? [];
        const bundlePath = await this.bundleGen.generate({
          run,
          result,
          screenshots,
          consoleLog: logs.console,
          networkLog: logs.network,
        });
        run.bundlePath = bundlePath;
        result.bundlePath = bundlePath;

        await this.envManager.destroyEnvironment(env);
        const replayUrl = await this.envManager.getReplayUrl(env.sessionId);
        if (replayUrl) {
          run.replayUrl = replayUrl;
          result.environment.recordingUrl = replayUrl;
        }
        env = null;
      }
    } finally {
      if (env) {
        await this.envManager.destroyEnvironment(env);
        run.events.push(createEvent(runId, "environment_destroyed"));
      }
      this.activeEnvironments.delete(runId);
    }

    run.updatedAt = new Date().toISOString();
    this.emit(run);
  }

  private createAgent(run: ReproRun): ReproAgent {
    const screenshotDir = join(this.config.reproDataDir, "screenshots", run.id);
    this.screenshotPaths.set(run.id, []);

    return new ReproAgent(this.config, this.envManager, {
      onEvent: (event) => {
        run.events.push(event);
        run.updatedAt = new Date().toISOString();
        this.emit(run);
      },
      onScreenshot: async (name, buffer) => {
        await mkdir(screenshotDir, { recursive: true });
        const path = join(screenshotDir, name);
        await writeFile(path, buffer);
        this.screenshotPaths.get(run.id)!.push({ name, path });
      },
      onAttemptUpdate: () => {
        run.updatedAt = new Date().toISOString();
        this.emit(run);
      },
    });
  }

  private async runRegressionChecks(env: BrowserEnvironment): Promise<RegressionCheck[]> {
    const page = env.page;
    const checks: RegressionCheck[] = [];

    try {
      await page.goto(this.config.targetUrl, { waitUntil: "networkidle", timeout: 15000 });
      checks.push({ name: "App loads", passed: true });
    } catch {
      checks.push({ name: "App loads", passed: false, message: "Failed to load app" });
      return checks;
    }

    const loginVisible = await page
      .locator('input[type="email"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (loginVisible) {
      await page.locator('input[type="email"]').fill(this.config.testUsername);
      await page.locator('input[type="password"]').fill(this.config.testPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }
    checks.push({ name: "Login", passed: !loginVisible || (await page.url()).includes("dashboard") || !(await page.locator('input[type="email"]').isVisible().catch(() => false)) });

    const hasNav = await page.locator("nav, aside, [data-testid='sidebar']").isVisible({ timeout: 3000 }).catch(() => false);
    checks.push({ name: "Navigation visible", passed: hasNav });

  const analyticsLink = page.locator('a:has-text("Analytics"), [href*="analytics"]');
    if (await analyticsLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.first().click();
      await page.waitForTimeout(2000);
      checks.push({ name: "Analytics page loads", passed: true });
    } else {
      checks.push({ name: "Analytics page loads", passed: false });
    }

    const errorVisible = await page
      .locator("text=Something went wrong, text=crashed")
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    checks.push({ name: "No crash on analytics", passed: !errorVisible });

    return checks;
  }

  private emit(run: ReproRun) {
    this.onUpdate({ ...run });
  }
}

export { loadConfig };
