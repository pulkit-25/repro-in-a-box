import { Solari, type BrowserSession } from "@solarisdk/browser";
import type { Config } from "@repro/core";

/** Minimal page interface shared by Solari (patchright) and local Playwright */
export interface AgentPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  screenshot(options?: { fullPage?: boolean }): Promise<Uint8Array>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): {
    click(options?: { timeout?: number }): Promise<void>;
    fill(text: string): Promise<void>;
    selectOption(value: string): Promise<void>;
    setInputFiles(files: string | string[]): Promise<void>;
    isVisible(options?: { timeout?: number }): Promise<boolean>;
    first(): { click(options?: { timeout?: number }): Promise<void> };
  };
  evaluate<T>(fn: () => T): Promise<T>;
  keyboard: { press(key: string): Promise<void> };
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export interface BrowserEnvironment {
  id: string;
  browser: BrowserSession | LocalBrowser;
  page: AgentPage;
  sessionId: string;
  recording: boolean;
}

interface LocalBrowser {
  id: string;
  close(): Promise<void>;
}

export interface EnvironmentManager {
  createBrowser(recording?: boolean): Promise<BrowserEnvironment>;
  getScreenshot(env: BrowserEnvironment): Promise<Buffer>;
  getReplayUrl(sessionId: string): Promise<string | null>;
  destroyEnvironment(env: BrowserEnvironment): Promise<void>;
}

export class SolariEnvironmentManager implements EnvironmentManager {
  private client: Solari;

  constructor(private config: Config) {
    this.client = new Solari({
      apiKey: config.solariApiKey,
      baseUrl: "https://api.getsolari.com",
    });
  }

  async createBrowser(recording = true): Promise<BrowserEnvironment> {
    const browser = await this.client.launch({ recording });

    const page = await browser.newPage();
    await page.setViewportSize({
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    });

    return {
      id: browser.id,
      browser,
      page: page as unknown as AgentPage,
      sessionId: browser.id,
      recording,
    };
  }

  async getScreenshot(env: BrowserEnvironment): Promise<Buffer> {
    const screenshot = await env.page.screenshot({ fullPage: false });
    return Buffer.from(screenshot);
  }

  async getReplayUrl(sessionId: string): Promise<string | null> {
    try {
      const { url } = await this.client.sessions.getReplayUrl(sessionId);
      return url;
    } catch {
      return null;
    }
  }

  async destroyEnvironment(env: BrowserEnvironment): Promise<void> {
    await env.browser.close();
  }
}

/** Local Playwright fallback when SOLARI_API_KEY is not set (dev without cloud) */
export class LocalEnvironmentManager implements EnvironmentManager {
  private playwright: typeof import("playwright") | null = null;

  constructor(private config: Config) {}

  private async getPlaywright() {
    if (!this.playwright) {
      this.playwright = await import("playwright");
    }
    return this.playwright;
  }

  async createBrowser(): Promise<BrowserEnvironment> {
    const pw = await this.getPlaywright();
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    });

    const id = `local_${Date.now()}`;
    const wrapper: LocalBrowser = {
      id,
      close: () => browser.close(),
    };

    return {
      id,
      browser: wrapper,
      page: page as unknown as AgentPage,
      sessionId: id,
      recording: false,
    };
  }

  async getScreenshot(env: BrowserEnvironment): Promise<Buffer> {
    const screenshot = await env.page.screenshot({ fullPage: false });
    return Buffer.from(screenshot);
  }

  async getReplayUrl(): Promise<string | null> {
    return null;
  }

  async destroyEnvironment(env: BrowserEnvironment): Promise<void> {
    await env.browser.close();
  }
}

export function createEnvironmentManager(config: Config): EnvironmentManager {
  if (config.solariApiKey && config.solariApiKey !== "slr_live_your_key_here") {
    return new SolariEnvironmentManager(config);
  }
  return new LocalEnvironmentManager(config);
}
