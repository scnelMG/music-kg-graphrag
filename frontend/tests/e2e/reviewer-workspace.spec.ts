import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test("Given personal listening evidence, when the workspace opens, then relistens precede new graph-supported discoveries", async ({ page }) => {
  await routeConnectedWorkspace(page);

  await page.goto("/");

  const rows = page.locator(".recommendation-note .relisten-entry, .recommendation-note .discovery-entry");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Album One");
  await expect(rows.nth(1)).toContainText("Album Two");
  await expect(page.locator(".technical-disclosure")).not.toContainText("notion-record-one");
});

test("Given insufficient personal history, when insight retrieval responds with its typed code, then no recommendation row is synthesized", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights", (route) => route.fulfill({
    body: JSON.stringify({ code: "INSUFFICIENT_PERSONAL_HISTORY", retryable: false }),
    contentType: "application/json",
    status: 409
  }));

  await page.goto("/");

  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator(".insight-state")).toHaveCount(1);
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});

test("Given an unavailable personal graph, when the workspace opens, then the recoverable state does not fabricate GraphRAG evidence", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights", (route) => route.fulfill({
    body: JSON.stringify({ code: "GRAPHDB_UNAVAILABLE", retryable: true }),
    contentType: "application/json",
    status: 503
  }));

  await page.goto("/");

  await expect(page.locator(".insight-state")).toHaveCount(1);
  await expect(page.locator(".recommendation-note .relisten-entry, .recommendation-note .discovery-entry")).toHaveCount(0);
  await expect(page.locator(".technical-disclosure")).toHaveCount(0);
});

test("Given a configuration or outage process, when the connected desk opens, then its typed recovery state remains usable", async ({ page, request }) => {
  const configurationFailure = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";
  const outage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
  test.skip(!configurationFailure && !outage, "requires a real configured failure-mode process");

  const health = await request.get("/api/music/health");
  await page.goto("/");

  expect(health.status()).toBe(503);
  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});
