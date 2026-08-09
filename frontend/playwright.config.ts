import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.TASK12_UI_E2E_PORT ?? "3100");
const backendConfigurationError = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${e2ePort}`, screenshot: "on", trace: "on" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
  webServer: {
    command: backendConfigurationError
      ? `node node_modules/next/dist/bin/next dev --port ${e2ePort}`
      : "node scripts/start-e2e-services.mjs",
    env: backendConfigurationError ? { BACKEND_BASE_URL: "", BACKEND_BFF_SHARED_SECRET: "" } : {},
    port: e2ePort,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000
  }
});
