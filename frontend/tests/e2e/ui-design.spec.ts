import { expect, test, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { albumFixture, routeConnectedWorkspace, trackFixture } from "./connected-workspace-fixtures";

const responsiveViewports = [
  { height: 900, name: "home-375.png", width: 375 },
  { height: 900, name: "home-768.png", width: 768 },
  { height: 900, name: "home-1280.png", width: 1280 }
] as const;

async function evidencePath(testInfo: TestInfo, name: string): Promise<string> {
  const configuredDirectory = process.env.TASK12_UI_EVIDENCE_DIR;
  if (configuredDirectory === undefined) return testInfo.outputPath(name);
  const directory = resolve(process.cwd(), configuredDirectory);
  await mkdir(directory, { recursive: true });
  return resolve(directory, name);
}

test("Given a connected workspace, when the listener selects a searched album and required fields, then save becomes available", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.goto("/");

  await expect(page.locator(".save-button")).toHaveCount(0);
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.getByText(albumFixture.title, { exact: true }).first().click();
  await expect(page.locator("#favourite-track-select")).toContainText(trackFixture.title);
  await expect(page.locator(".save-button")).toBeDisabled();
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption(trackFixture.title);

  await expect(page.locator(".save-button")).toBeEnabled();
});

test("Given a connected workspace, when it renders the listening workflow, then it contains no fixture-only disclosure", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.goto("/");

  await expect(page.locator("main.music-journal")).toHaveCount(1);
  await expect(page.locator("nav.task-navigation a")).toHaveCount(3);
  await expect(page.locator("[data-testid='fixture-label']")).toHaveCount(0);
  await expect(page.locator(".recommendation-note")).toHaveCount(1);
});

test("Given a typed private-insights configuration failure, when the connected workspace opens, then it renders a Korean-first recoverable shell without recommendations", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights", (route) => route.fulfill({
    body: JSON.stringify({ code: "BACKEND_CONFIGURATION_ERROR", retryable: false }),
    contentType: "application/json",
    status: 503
  }));

  await page.goto("/");

  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});

test("Given the connected workspace, when it renders each supported viewport and keyboard focus, then it has no horizontal overflow", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  for (const viewport of responsiveViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, viewport.name) });
  }

  await page.setViewportSize({ height: 900, width: 375 });
  await page.goto("/");
  await page.locator("#album-search").focus();
  await expect(page.locator("#album-search")).toBeFocused();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "keyboard-focus.png") });
});
