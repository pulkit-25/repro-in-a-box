import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
// join used for fixture paths
import type {
  AgentAction,
  AgentObservation,
  Config,
  Hypothesis,
  ReproAttempt,
  ReproEvent,
  ReproStep,
} from "@repro/core";
import { createEvent, generateId } from "@repro/core";
import { EvidenceEngine } from "@repro/evidence";
import { createLLMProvider } from "@repro/llm";
import type { BrowserEnvironment, EnvironmentManager } from "@repro/solari-manager";

export interface AgentCallbacks {
  onEvent: (event: ReproEvent) => void;
  onScreenshot: (name: string, buffer: Buffer) => void;
  onAttemptUpdate: (attempt: ReproAttempt) => void;
}

export class ReproAgent {
  private llm;
  private evidence = new EvidenceEngine();
  private consoleLog: string[] = [];
  private networkLog: string[] = [];
  private screenshotCount = 0;
  private steps: ReproStep[] = [];

  constructor(
    private config: Config,
    private envManager: EnvironmentManager,
    private callbacks: AgentCallbacks
  ) {
    this.llm = createLLMProvider(config);
  }

  async generateHypothesis(bugReport: string): Promise<Hypothesis> {
    return this.llm.generateHypothesis(bugReport);
  }

  async runAttempt(
    runId: string,
    bugReport: string,
    hypothesis: Hypothesis,
    attemptNumber: number,
    previousAttempts: ReproAttempt[],
    env: BrowserEnvironment,
    isVerification = false
  ): Promise<ReproAttempt> {
    const attemptId = generateId("attempt");
    const attempt: ReproAttempt = {
      id: attemptId,
      attemptNumber,
      status: "running",
      startedAt: new Date().toISOString(),
      steps: [],
      evidence: [],
    };

    this.callbacks.onAttemptUpdate(attempt);
    this.callbacks.onEvent(
      createEvent(runId, "attempt_started", { attemptId, data: { attemptNumber } })
    );

    this.setupPageListeners(env, runId, attemptId);
    this.steps = [];
    this.consoleLog = [];
    this.networkLog = [];

    const page = env.page;
    let actionCount = 0;
    const maxActions = 40;

    try {
      if (attemptNumber === 1) {
        await page.goto(this.config.targetUrl, { waitUntil: "networkidle", timeout: 30000 });
        this.recordStep("navigate", { url: this.config.targetUrl });
      }

      while (actionCount < maxActions) {
        const observation = await this.observe(env);
        const history = this.formatAttemptHistory(previousAttempts, attempt);

        const plan = await this.llm.planActions(
          bugReport,
          hypothesis,
          observation,
          history,
          isVerification
        );

        this.callbacks.onEvent(
          createEvent(runId, "agent_reasoning", {
            attemptId,
            message: plan.reasoning,
            data: { hypothesisUpdate: plan.hypothesisUpdate },
          })
        );

        if (plan.recoveryNeeded) {
          await this.recover(env, runId, attemptId);
          actionCount++;
          continue;
        }

        const hasDone = plan.actions.some((a) => a.type === "done");
        for (const action of plan.actions) {
          if (action.type === "done") continue;
          await this.executeAction(env, action, runId, attemptId);
          actionCount++;
        }

        const postObservation = await this.observe(env);
        const signals = this.evidence.detect({
          consoleErrors: postObservation.consoleErrors,
          networkErrors: postObservation.networkErrors,
          pageUrl: postObservation.url,
          pageTitle: postObservation.title,
          visibleText: postObservation.visibleText,
          isBlank: postObservation.isBlank,
          isErrorPage: postObservation.isErrorPage,
        });

        attempt.evidence = signals;
        attempt.steps = [...this.steps];

        if (isVerification) {
          if (!this.evidence.isReproduced(signals) && hasDone) {
            attempt.status = "reproduced";
            break;
          }
          if (this.evidence.isReproduced(signals)) {
            attempt.status = "failed";
            break;
          }
        } else {
          if (this.evidence.isReproduced(signals)) {
            attempt.status = "reproduced";
            this.callbacks.onEvent(
              createEvent(runId, "bug_detected", { attemptId, message: "Bug reproduced" })
            );
            break;
          }
          if (this.evidence.isSuspicious(signals)) {
            attempt.status = "suspicious";
          }
        }

        if (hasDone) break;

        await page.waitForTimeout(500);
      }

      if (attempt.status === "running") {
        attempt.status = "failed";
      }
    } catch (err) {
      attempt.status = "failed";
      attempt.failureReason = err instanceof Error ? err.message : String(err);
    }

    attempt.endedAt = new Date().toISOString();
    attempt.steps = [...this.steps];
    this.callbacks.onAttemptUpdate(attempt);
    this.callbacks.onEvent(
      createEvent(runId, "attempt_ended", {
        attemptId,
        result: attempt.status,
        data: { attemptNumber },
      })
    );

    return attempt;
  }

  private setupPageListeners(env: BrowserEnvironment, runId: string, attemptId: string) {
    const page = env.page;
    page.on("console", (msg: { type: () => string; text: () => string }) => {
      if (msg.type() === "error") {
        const text = msg.text();
        this.consoleLog.push(`[${new Date().toISOString()}] ${text}`);
        this.callbacks.onEvent(
          createEvent(runId, "console_error", { attemptId, message: text })
        );
      }
    });

    page.on("pageerror", (err: Error) => {
      const text = err.message;
      this.consoleLog.push(`[PAGE ERROR] ${text}`);
      this.callbacks.onEvent(
        createEvent(runId, "console_error", { attemptId, message: text })
      );
    });

    page.on("response", (response: { status: () => number; url: () => string }) => {
      if (response.status() >= 400) {
        const entry = `${response.status()} ${response.url()}`;
        this.networkLog.push(entry);
        this.callbacks.onEvent(
          createEvent(runId, "network_error", { attemptId, message: entry })
        );
      }
    });
  }

  private async observe(env: BrowserEnvironment): Promise<AgentObservation> {
    const page = env.page;
    const url = page.url();
    const title = await page.title().catch(() => "");
    const visibleText = await page
      .evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "")
      .catch(() => "");

    const screenshot = await this.envManager.getScreenshot(env);
    this.screenshotCount++;
    const name = `${String(this.screenshotCount).padStart(3, "0")}.png`;
    this.callbacks.onScreenshot(name, screenshot);

    const isBlank = visibleText.trim().length < 10;
    const isErrorPage =
      /something went wrong|dashboard crashed|unexpected error|application error/i.test(visibleText);

    return {
      url,
      title,
      screenshotBase64: screenshot.toString("base64"),
      visibleText,
      consoleErrors: [...this.consoleLog],
      networkErrors: [...this.networkLog],
      isErrorPage,
      isBlank,
    };
  }

  private async executeAction(
    env: BrowserEnvironment,
    action: AgentAction,
    runId: string,
    attemptId: string
  ) {
    const page = env.page;

    this.callbacks.onEvent(
      createEvent(runId, "agent_action", {
        attemptId,
        action: action.type,
        target: action.selector ?? action.url,
        message: action.reason,
      })
    );

    switch (action.type) {
      case "navigate":
        await page.goto(action.url!, { waitUntil: "networkidle", timeout: 30000 });
        this.recordStep("navigate", { url: action.url });
        break;

      case "click":
        await page.locator(action.selector!).click({ timeout: 10000 });
        this.recordStep("click", { selector: action.selector });
        break;

      case "type":
        await page.locator(action.selector!).fill(action.text ?? "");
        this.recordStep("type", { selector: action.selector, text: action.text });
        break;

      case "select":
        await page.locator(action.selector!).selectOption(action.value!);
        this.recordStep("select", { selector: action.selector, value: action.value });
        break;

      case "upload": {
        const filePath = action.filePath ?? (await this.ensureLargeCsv());
        const input = page.locator(action.selector ?? 'input[type="file"]');
        await input.setInputFiles(filePath);
        this.recordStep("upload_file", { file: filePath });
        break;
      }

      case "wait":
        await page.waitForTimeout(action.ms ?? 1000);
        this.recordStep("wait", { ms: action.ms });
        break;

      case "scroll":
        await page.evaluate(() => window.scrollBy(0, 500));
        this.recordStep("scroll");
        break;

      case "press":
        await page.keyboard.press(action.key ?? "Enter");
        this.recordStep("press", { key: action.key });
        break;

      case "recover":
        await this.recover(env, runId, attemptId);
        break;
    }
  }

  private async recover(env: BrowserEnvironment, runId: string, attemptId: string) {
    this.callbacks.onEvent(
      createEvent(runId, "recovery", { attemptId, message: "Attempting recovery" })
    );

    const page = env.page;
    await page.goto(this.config.targetUrl, { waitUntil: "networkidle" }).catch(() => {});

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(this.config.testUsername);
      await page.locator('input[type="password"]').fill(this.config.testPassword);
      await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').click();
      await page.waitForTimeout(2000);
      this.recordStep("recover_login");
    }
  }

  private async ensureLargeCsv(): Promise<string> {
    const dir = join(this.config.reproDataDir, "fixtures");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "large-dataset.csv");
    const header = "date,country,revenue,users,orders\n";
    const rows: string[] = [header];
    const countries = ["US", "IN", "UK", "DE", "FR", "JP", "AU", "CA"];
    for (let i = 0; i < 2500; i++) {
      const date = new Date(2024, i % 12, (i % 28) + 1).toISOString().split("T")[0];
      const country = countries[i % countries.length];
      rows.push(`${date},${country},${(Math.random() * 10000).toFixed(2)},${Math.floor(Math.random() * 500)},${Math.floor(Math.random() * 100)}\n`);
    }
    await writeFile(filePath, rows.join(""));
    return filePath;
  }

  private recordStep(action: string, details?: Record<string, unknown>) {
    this.steps.push({ action, timestamp: new Date().toISOString(), details });
  }

  private formatAttemptHistory(previous: ReproAttempt[], current: ReproAttempt): string {
    const all = [...previous, current.status !== "running" ? current : null].filter(Boolean) as ReproAttempt[];
    return all
      .map(
        (a) =>
          `Attempt #${a.attemptNumber}: ${a.status}${a.failureReason ? ` (${a.failureReason})` : ""} — steps: ${a.steps.map((s) => s.action).join(", ")}`
      )
      .join("\n");
  }

  getLogs() {
    return { console: this.consoleLog, network: this.networkLog };
  }
}

export { EvidenceEngine } from "@repro/evidence";
