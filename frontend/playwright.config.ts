import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3100", screenshot: "on", trace: "on" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
  webServer: { command: "node node_modules\\next\\dist\\bin\\next dev --port 3100", port: 3100, reuseExistingServer: true }
});
