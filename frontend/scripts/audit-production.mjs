import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import desktopConfig from "lighthouse/core/config/lr-desktop-config.js";
import { playAudit } from "playwright-lighthouse";

const baseUrl = new URL(process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000");
const reportDirectory = resolve(process.env.AUDIT_REPORT_DIR ?? ".audit/lighthouse");
const remoteDebuggingPort = Number(process.env.AUDIT_CHROME_PORT ?? "9222");
const minimumBenchmarkIndex = Number(process.env.AUDIT_MIN_BENCHMARK_INDEX ?? "2000");
const routes = ["/", "/method", "/privacy", "/terms"];
const modes = [
  { name: "mobile", viewport: { height: 812, width: 375 } },
  { name: "tablet", viewport: { height: 1024, width: 768 } },
  { name: "desktop", viewport: { height: 900, width: 1280 } }
];
const thresholds = { accessibility: 100, "best-practices": 100, performance: 100, seo: 100 };

if (!Number.isInteger(remoteDebuggingPort) || remoteDebuggingPort < 1 || remoteDebuggingPort > 65_535) {
  throw new RangeError("AUDIT_CHROME_PORT must be an integer between 1 and 65535.");
}

async function runAudit(url, mode, reportName) {
  let scores = {};
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await playAudit({
      config: mode.name === "desktop" ? desktopConfig : undefined,
      ignoreError: true,
      port: remoteDebuggingPort,
      reports: {
        directory: reportDirectory,
        formats: { html: true, json: true },
        name: reportName
      },
      thresholds,
      url
    });
    const benchmarkIndex = result.lhr.environment.benchmarkIndex;
    if (benchmarkIndex < minimumBenchmarkIndex) {
      if (attempt === 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
        continue;
      }
      throw new Error(`${reportName} audit environment benchmark ${benchmarkIndex} is below ${minimumBenchmarkIndex}; performance evidence is invalid.`);
    }
    scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([name, category]) => [name, Math.round(category.score * 100)]));
    if (Object.entries(thresholds).every(([name, minimum]) => scores[name] >= minimum)) return;
    if (attempt === 1) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`${reportName} did not meet Lighthouse thresholds after one controlled retry: ${JSON.stringify(scores)}`);
}

await mkdir(reportDirectory, { recursive: true });
const browser = await chromium.launch({ args: [`--remote-debugging-port=${remoteDebuggingPort}`], channel: "chrome" });

try {
  for (const route of routes) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: mode.viewport });
      const browserErrors = [];
      page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") browserErrors.push(`${message.type()}: ${message.text()}`); });
      page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
      const url = new URL(route, baseUrl).href;
      await page.goto(url, { waitUntil: "networkidle" });
      if (route === "/") {
        await page.waitForFunction(() => Array.from(document.fonts).some((font) => font.family === "Noto Serif KR Variable" && font.status === "loaded"), { timeout: 8_000 });
      }
      const reportName = `${route === "/" ? "home" : route.slice(1)}-${mode.name}`;
      await page.screenshot({ fullPage: true, path: resolve(reportDirectory, `${reportName}.png`) });
      if (browserErrors.length > 0) throw new Error(`${url} emitted browser diagnostics:\n${browserErrors.join("\n")}`);
      await page.close();
      await runAudit(url, mode, reportName);
    }
  }
} finally {
  await browser.close();
}
