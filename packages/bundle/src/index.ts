import { mkdir, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";
import type { FixHandoff, ReproRun, ReproductionResult } from "@repro/core";

export interface BundleInput {
  run: ReproRun;
  result: ReproductionResult;
  screenshots: { name: string; path: string }[];
  consoleLog: string[];
  networkLog: string[];
  replayUrl?: string;
}

export class BundleGenerator {
  constructor(private dataDir: string) {}

  async generate(input: BundleInput): Promise<string> {
    const bundleDir = join(this.dataDir, "bundles", input.run.id);
    const screenshotsDir = join(bundleDir, "screenshots");
    const logsDir = join(bundleDir, "logs");
    const stateDir = join(bundleDir, "state");

    await mkdir(screenshotsDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(stateDir, { recursive: true });

    for (const shot of input.screenshots) {
      await cp(shot.path, join(screenshotsDir, shot.name));
    }

    await writeFile(join(logsDir, "console.log"), input.consoleLog.join("\n"));
    await writeFile(join(logsDir, "network.log"), input.networkLog.join("\n"));

    const reproduction = {
      bug_id: input.run.id,
      status: input.result.status,
      confidence: input.result.confidence,
      attempts: input.result.attempts,
      environment: input.result.environment,
      steps: input.result.steps,
      failure: input.result.failure,
    };

    await writeFile(join(bundleDir, "reproduction.json"), JSON.stringify(reproduction, null, 2));
    await writeFile(join(bundleDir, "environment.json"), JSON.stringify(input.result.environment, null, 2));
    await writeFile(join(bundleDir, "steps.json"), JSON.stringify(input.result.steps, null, 2));
    await writeFile(
      join(bundleDir, "evidence.json"),
      JSON.stringify(
        input.run.attempts.flatMap((a) => a.evidence),
        null,
        2
      )
    );

    const readme = this.generateReadme(input);
    await writeFile(join(bundleDir, "README.md"), readme);

    if (input.replayUrl) {
      await writeFile(join(bundleDir, "recording", "replay-url.txt"), input.replayUrl).catch(async () => {
        await mkdir(join(bundleDir, "recording"), { recursive: true });
        await writeFile(join(bundleDir, "recording", "replay-url.txt"), input.replayUrl!);
      });
    }

    return bundleDir;
  }

  generateFixHandoff(run: ReproRun, bundlePath: string): FixHandoff {
    const result = run.result!;
    const steps = result.steps.map((s, i) => `${i + 1}. ${s.action}${s.details ? ` — ${JSON.stringify(s.details)}` : ""}`);

    return {
      bugDescription: run.bugReport.description,
      reproductionSteps: steps,
      evidence: run.attempts.flatMap((a) => a.evidence),
      logs: {
        console: run.events.filter((e) => e.eventType === "console_error").map((e) => e.message ?? ""),
        network: run.events.filter((e) => e.eventType === "network_error").map((e) => e.message ?? ""),
      },
      screenshots: [],
      expectedBehavior: "Analytics dashboard should load and filter data without crashing",
      observedBehavior: result.failure?.message ?? "Application crash during filter changes",
      confidence: result.confidence,
      bundlePath,
    };
  }

  private generateReadme(input: BundleInput): string {
    const { run, result } = input;
    const steps = result.steps
      .map((s, i) => `${i + 1}. ${s.action}${s.details ? ` (${JSON.stringify(s.details)})` : ""}`)
      .join("\n");

    return `# Reproduction Bundle — ${run.id}

## Status
${result.status === "reproduced" ? "✓ REPRODUCED" : "✗ NOT REPRODUCED"}

**Confidence:** ${Math.round(result.confidence * 100)}%
**Attempts:** ${result.attempts}
**Successful reproductions:** ${result.successfulReproductions}
**Duration:** ${Math.round(result.durationMs / 1000)}s

## Bug Report
${run.bugReport.description}

## Environment
- Browser: ${result.environment.browser}
- Viewport: ${result.environment.viewport}
- Target: ${result.environment.targetUrl}

## Reproduction Steps
${steps}

## Failure
${result.failure ? `Type: ${result.failure.type}\nMessage: ${result.failure.message}` : "N/A"}

## Evidence
${run.attempts.flatMap((a) => a.evidence).map((e) => `- [${e.strength}] ${e.type}: ${e.message}`).join("\n")}

## Files
- \`reproduction.json\` — machine-readable reproduction
- \`steps.json\` — action sequence
- \`evidence.json\` — collected signals
- \`screenshots/\` — visual evidence
- \`logs/\` — console and network logs
`;
  }
}
