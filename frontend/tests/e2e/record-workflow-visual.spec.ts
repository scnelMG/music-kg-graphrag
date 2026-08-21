import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { albumFixture, routeConnectedWorkspace, trackFixture, type RecordFixture } from "./connected-workspace-fixtures";

const evidenceDirectory = process.env.RECORD_WORKFLOW_EVIDENCE_DIR;

async function capture(page: Page, fileName: string, testInfo: TestInfo): Promise<void> {
  const ordinaryCapture = fileName !== "record-workflow-focus-375.png";
  if (ordinaryCapture) {
    await page.locator("#main-content").focus();
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(page.locator(".skip-link")).not.toBeFocused();
    await page.waitForTimeout(200);
    await page.locator(".skip-link").evaluate((element) => { element.style.visibility = "hidden"; });
  }
  const path = evidenceDirectory === undefined ? testInfo.outputPath(fileName) : join(evidenceDirectory, fileName);
  if (evidenceDirectory !== undefined) await mkdir(evidenceDirectory, { recursive: true });
  try {
    await page.screenshot({ path, fullPage: true });
  } finally {
    if (ordinaryCapture) await page.locator(".skip-link").evaluate((element) => { element.style.removeProperty("visibility"); });
  }
}

test("keeps the selected-record and archive-confirmation workflow legible at review widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures the canonical widths once");
  const record: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-12T00:00:00.000Z",
    owned: true,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Loved"
  };
  await routeConnectedWorkspace(page, { records: [record] });

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#album-search").fill(albumFixture.title);
    await page.locator("form.search-row button").click();
    await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
    await expect(page.locator("#favourite-track-select")).toContainText(trackFixture.title);
    await page.getByRole("button", { name: "Notion 기록 갱신" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("이 기록을 Notion에 저장할까요?");
    await capture(page, `record-save-confirmation-${viewport.width}.png`, testInfo);
    await page.getByRole("button", { name: "저장하지 않기" }).click();
    await page.getByRole("button", { name: "Notion에서 보관" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await capture(page, `record-workflow-${viewport.width}.png`, testInfo);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.waitForTimeout(200);
  await capture(page, "record-workflow-focus-375.png", testInfo);
});

test("keeps the restore confirmation visible before it can change a Notion record", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures the canonical confirmation once");
  let archived = false;
  const record: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-12T00:00:00.000Z",
    owned: true,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Loved"
  };
  await routeConnectedWorkspace(page);
  await page.route(/\/api\/music\/records(?:\/.*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "DELETE") {
      archived = true;
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: record.lastEditedAt, notionPageId: record.recordHandle, operation: "ARCHIVED" }), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ nextCursor: null, records: archived ? [] : [record] }), contentType: "application/json", status: 200 });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Notion에서 보관" }).click();
  await page.getByRole("button", { name: "보관하기" }).click();
  await page.getByRole("button", { name: "보관 취소" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("이 기록을 Notion에 복원할까요?");
  await capture(page, "record-restore-confirmation-375.png", testInfo);
});

test("keeps a long Notion record list measured at review widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures the canonical widths once");
  const records: readonly RecordFixture[] = Array.from({ length: 13 }, (_, index) => ({
    albumTitle: `Album ${index + 1}`,
    artist: "Artist One",
    artistCredits: ["Artist One"],
    coverUrl: "",
    favouriteTrack: "Track One",
    lastEditedAt: "2026-08-12T00:00:00.000Z",
    owned: false,
    recordHandle: `notion-record-${index + 1}`,
    releaseGroupMbid: `release-group-${index + 1}`,
    releaseMbid: `release-${index + 1}`,
    sentiment: "Loved"
  }));
  await routeConnectedWorkspace(page, { records: records.slice(0, 12) });
  await page.unroute("**/api/music/records");
  await page.route((url) => url.pathname === "/api/music/records", (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    return route.fulfill({
      body: JSON.stringify({
        nextCursor: cursor === null ? "record-cursor-12" : null,
        records: cursor === null ? records.slice(0, 12) : records.slice(12)
      }),
      contentType: "application/json",
      status: 200
    });
  });

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".record-entry")).toHaveCount(12);
    await expect(page.getByRole("button", { name: "다음 기록 더 보기" })).toBeVisible();
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await capture(page, `record-list-batch-${viewport.width}.png`, testInfo);
  }
});
