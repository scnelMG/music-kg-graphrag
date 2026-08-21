import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.TASK12_UI_E2E_PORT ?? "3100");
const e2eDistDir = `.next-e2e-${e2ePort}`;
const backendConfigurationError = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";
const backendOutage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
const browserTestEnvironment = {
  MUSIC_KG_ENABLE_FIXTURE_ROUTES: "true",
  NEXT_DIST_DIR: e2eDistDir,
  NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: "1"
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${e2ePort}`, screenshot: "on", trace: "on" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
  webServer: {
    command: backendConfigurationError || backendOutage
      ? `node node_modules/next/dist/bin/next dev --port ${e2ePort}`
      : "node scripts/start-e2e-services.mjs",
    env: backendConfigurationError
      ? { ...browserTestEnvironment, BACKEND_BASE_URL: "", BACKEND_BFF_SHARED_SECRET: "" }
      : backendOutage
        ? { ...browserTestEnvironment, BACKEND_BASE_URL: "http://127.0.0.1:1", BACKEND_BFF_SHARED_SECRET: "test-only-outage-secret" }
      : browserTestEnvironment,
    port: e2ePort,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000
  }
});
