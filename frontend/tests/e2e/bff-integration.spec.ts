import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

const backendOutage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
const backendConfigurationError = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";
const backendPort = process.env.TASK12_UI_E2E_BACKEND_PORT ?? "18080";

test("Given the local fixture API, when the BFF health route is called, then only safe health data returns", async ({ request }) => {
  test.skip(backendOutage || backendConfigurationError, "requires the local Spring fixture API");

  const response = await request.get("/api/fixture/health");

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ mode: "fixture", status: "ok" });
});

test("Given a direct client without the shared secret, when it calls the local API, then Spring returns a typed 401", async ({ playwright }) => {
  test.skip(backendOutage || backendConfigurationError, "requires the local Spring fixture API");
  const directClient = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${backendPort}` });

  const response = await directClient.get("/api/v1/health");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ code: "BFF_AUTH_REQUIRED" });
  await directClient.dispose();
});

test("Given absent BFF settings, when the connected health route is requested, then its recovery UI keeps the form visible", async ({ page, request }) => {
  test.skip(!backendConfigurationError, "requires TASK12B_E2E_BACKEND_CONFIGURATION_ERROR=true");

  const response = await request.get("/api/music/health");
  await page.goto("/");

  expect(response.status()).toBe(503);
  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});

test("Given an unreachable BFF backend, when the connected health route is requested, then its recovery UI does not synthesize data", async ({ page, request }) => {
  test.skip(!backendOutage, "requires TASK12B_E2E_BACKEND_OUTAGE=true");

  const response = await request.get("/api/music/health");
  await page.goto("/");

  expect(response.status()).toBe(503);
  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".record-list .record-entry")).toHaveCount(0);
});

test("Given a message-less personal-insights 502 response, when the connected desk opens, then it stays interactive without a browser exception", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights*", (route) => route.fulfill({
    body: JSON.stringify({ code: "BACKEND_CONTRACT_ERROR", retryable: false }),
    contentType: "application/json",
    status: 502
  }));

  await page.goto("/");

  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contract-error-recoverable.png"), fullPage: true });
});
