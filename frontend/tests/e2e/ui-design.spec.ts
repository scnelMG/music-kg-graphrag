import { expect, test, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { albumFixture, routeConnectedWorkspace, trackFixture } from "./connected-workspace-fixtures";

const responsiveViewports = [
  { height: 900, name: "white-archive-owner-375.png", width: 375 },
  { height: 900, name: "white-archive-owner-768.png", width: 768 },
  { height: 900, name: "white-archive-owner-1280.png", width: 1280 }
] as const;

const visitorViewports = [
  { height: 900, name: "white-archive-visitor-375.png", width: 375 },
  { height: 900, name: "white-archive-visitor-768.png", width: 768 },
  { height: 900, name: "white-archive-visitor-1280.png", width: 1280 }
] as const;

const archiveRecordFixture = {
  albumTitle: "Real Archive Album",
  artist: "Archive Artist",
  artistCredits: ["Archive Artist"],
  coverUrl: "https://covers.example.test/real-archive-album.jpg",
  favouriteTrack: "Archive Track",
  lastEditedAt: "2026-08-14T00:00:00Z",
  owned: true,
  recordHandle: "notion-record-real-archive",
  releaseGroupMbid: "release-group-real-archive",
  releaseMbid: "release-real-archive",
  sentiment: "Loved"
} as const;

async function routeArchiveCover(page: Parameters<typeof routeConnectedWorkspace>[0]): Promise<void> {
  await page.route("https://covers.example.test/**", (route) => route.fulfill({
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"144\" height=\"144\"><rect width=\"144\" height=\"144\" fill=\"#171717\"/></svg>",
    contentType: "image/svg+xml",
    status: 200
  }));
}

async function evidencePath(testInfo: TestInfo, name: string): Promise<string> {
  const configuredDirectory = process.env.TASK12_UI_EVIDENCE_DIR;
  if (configuredDirectory === undefined) return testInfo.outputPath(name);
  const directory = resolve(process.cwd(), configuredDirectory);
  await mkdir(directory, { recursive: true });
  return resolve(directory, name);
}

test("Given a connected workspace, when the listener selects a searched album and required fields, then save becomes available", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.goto("/owner/workspace");

  await expect(page.locator(".save-button")).toHaveCount(0);
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await page.locator(".edition-option").filter({ hasText: "2024-01-01" }).click();
  await expect(page.locator("#favourite-track-select")).toContainText(trackFixture.title);
  await expect(page.locator(".save-button")).toBeDisabled();
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption(trackFixture.recordingMbid);

  await expect(page.locator(".save-button")).toBeEnabled();
});

test("Given a connected workspace, when it renders the listening workflow, then it contains no fixture-only disclosure", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.goto("/owner/workspace");

  await expect(page.locator("main.music-journal")).toHaveCount(1);
  await expect(page.locator("nav.task-navigation a")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "취향과 추천 보기" })).toHaveCount(0);
  await expect(page.locator("[data-testid='fixture-label']")).toHaveCount(0);
  await expect(page.locator(".recommendation-note")).toHaveCount(1);
});

test("Given real Notion records, when the owner opens the home, then the archive cover rail exposes those records", async ({ page }) => {
  await routeArchiveCover(page);
  await routeConnectedWorkspace(page, { records: [archiveRecordFixture] });
  await page.goto("/owner/workspace");

  const rail = page.getByTestId("personal-cover-rail");
  await expect(rail).toContainText("Real Archive Album");
  await expect(rail.getByRole("button", { name: /Real Archive Album 기록 수정/ })).toBeVisible();
  await expect(rail.locator("img")).toHaveAttribute("src", "https://covers.example.test/real-archive-album.jpg");
});

test("Given a visitor, when the archive home opens, then private archive content stays absent and owner access appears once", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: false }),
    contentType: "application/json",
    status: 200
  }));
  for (const viewport of visitorViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/");

    await expect(page.getByTestId("personal-cover-rail")).toHaveCount(0);
    await expect(page.getByTestId("public-discovery-deck")).toHaveCount(1);
    await expect(page.locator(".insight-region")).toHaveCount(0);
    await expect(page.locator(".record-list")).toHaveCount(0);
    await expect(page.locator("nav.task-navigation")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "아카이브 관리" })).toHaveCount(1);
    if (testInfo.project.name === "desktop") {
      await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, viewport.name) });
    }
  }
});

test("Given a typed private-insights configuration failure, when the connected workspace opens, then it renders a Korean-first recoverable shell without recommendations", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights*", (route) => route.fulfill({
    body: JSON.stringify({ code: "BACKEND_CONFIGURATION_ERROR", retryable: false }),
    contentType: "application/json",
    status: 503
  }));

  await page.goto("/owner/workspace");

  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});

test("Given the connected workspace, when it renders each supported viewport and keyboard focus, then it has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Each visual evidence viewport is captured once.");
  await routeArchiveCover(page);
  await routeConnectedWorkspace(page, { records: [archiveRecordFixture] });
  for (const viewport of responsiveViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/owner/workspace");
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, viewport.name) });
  }

  await page.setViewportSize({ height: 900, width: 375 });
  await page.goto("/owner/workspace");
  await page.locator("#album-search").focus();
  await expect(page.locator("#album-search")).toBeFocused();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "keyboard-focus.png") });
});
