import type { AgentObservation, AgentPlan, Config, Hypothesis } from "@repro/core";

export interface LLMProvider {
  generateHypothesis(bugReport: string): Promise<Hypothesis>;
  planActions(
    bugReport: string,
    hypothesis: Hypothesis,
    observation: AgentObservation,
    attemptHistory: string,
    isVerification: boolean
  ): Promise<AgentPlan>;
}

export class OpenRouterProvider implements LLMProvider {
  constructor(private config: Config) {}

  private async chat(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.config.openrouterBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://repro-in-a-box.local",
        "X-Title": "Repro-in-a-Box",
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "{}";
  }

  async generateHypothesis(bugReport: string): Promise<Hypothesis> {
    const system = `You are a bug reproduction analyst. Convert bug reports into structured hypotheses.
Return JSON with: goal, suspectedArea, possibleTriggers (array), successConditions (array).`;

    const raw = await this.chat(system, `Bug report:\n${bugReport}`);
    const parsed = JSON.parse(raw) as Hypothesis;
    return {
      goal: parsed.goal ?? "Reproduce reported bug",
      suspectedArea: parsed.suspectedArea ?? "unknown",
      possibleTriggers: parsed.possibleTriggers ?? [],
      successConditions: parsed.successConditions ?? ["application crash", "uncaught exception", "error screen"],
    };
  }

  async planActions(
    bugReport: string,
    hypothesis: Hypothesis,
    observation: AgentObservation,
    attemptHistory: string,
    isVerification: boolean
  ): Promise<AgentPlan> {
    const system = `You are an autonomous browser agent reproducing bugs in a web SaaS app called BuggyBoard.
You control a real browser via Playwright-like actions.

Return JSON:
{
  "reasoning": "brief explanation",
  "actions": [{ "type": "click|type|navigate|upload|wait|scroll|select|press|done|recover", "selector": "...", "text": "...", "url": "...", "filePath": "...", "ms": 1000, "value": "...", "key": "Enter", "reason": "why" }],
  "hypothesisUpdate": { "notes": ["..."] },
  "shouldContinue": true,
  "recoveryNeeded": false,
  "recoveryAction": "..."
}

Rules:
- Execute 1-4 actions per plan, not one at a time
- Use CSS selectors or text selectors like button:has-text("Login")
- For CSV upload use type "upload" with filePath
- Login: demo@buggyboard.io / demo1234
- To reproduce analytics crash: log in, create a project, click "Load large demo dataset" (preferred) or upload a large CSV, go to Analytics, set date filter to Last 30 Days, then immediately change country filter while Loading data... is visible
- If login page appears unexpectedly, use recover action
- Use "done" when bug is reproduced or verification complete
- ${isVerification ? "This is VERIFICATION mode - run the same steps and confirm bug no longer occurs" : "This is REPRODUCTION mode - find and trigger the bug"}`;

    const user = `Bug: ${bugReport}

Hypothesis: ${JSON.stringify(hypothesis)}

Current page:
URL: ${observation.url}
Title: ${observation.title}
Visible text (truncated): ${observation.visibleText.slice(0, 2000)}
Console errors: ${observation.consoleErrors.join("; ") || "none"}
Network errors: ${observation.networkErrors.join("; ") || "none"}
Error page: ${observation.isErrorPage}
Blank page: ${observation.isBlank}

Attempt history:
${attemptHistory || "No previous attempts"}`;

    const raw = await this.chat(system, user);
    return JSON.parse(raw) as AgentPlan;
  }
}

export function createLLMProvider(config: Config): LLMProvider {
  if (config.modelProvider === "openrouter") {
    return new OpenRouterProvider(config);
  }
  return new OpenRouterProvider(config);
}
