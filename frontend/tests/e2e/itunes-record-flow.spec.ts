import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

const evidenceDirectory = process.env.ITUNES_RECORD_EVIDENCE_DIR;

async function captureWorkflow(page: Page, fileName: string, testInfo: TestInfo): Promise<void> {
  const path = evidenceDirectory === undefined ? testInfo.outputPath(fileName) : join(evidenceDirectory, fileName);
  if (evidenceDirectory !== undefined) await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

test("Given an iTunes-only Korean album, when its track is selected and saved, then it keeps the Apple collection identity without a MusicBrainz edition", async ({ page }, testInfo) => {
  const savedRecord = {
    albumTitle: "새 음반", artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"],
    catalogId: "123456789", catalogSource: "ITUNES", coverUrl: "", favouriteTrack: "첫 곡",
    lastEditedAt: "2026-08-21T00:00:00.000Z", owned: false, recordHandle: "saved-itunes-record",
    releaseGroupMbid: "", releaseMbid: "", sentiment: "Loved"
  };
  let saved = false;
  let releaseRecordReload: (() => void) | undefined;
  const recordReload = new Promise<void>((resolve) => { releaseRecordReload = resolve; });
  await routeConnectedWorkspace(page, {
    albums: [{
      artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"], catalogId: "123456789", catalogSource: "ITUNES",
      catalogUrl: "https://music.apple.com/kr/album/new-album/123456789", coverUrl: "", firstReleaseDate: "2025-04-11",
      primaryType: "Album", releaseGroupMbid: "", searchScore: 0, title: "새 음반"
    }]
  });
  await page.unroute("**/api/music/records");
  await page.route((url) => url.pathname === "/api/music/records/by-catalog-identity", (route) => route.fulfill({
    body: JSON.stringify({ record: null }), contentType: "application/json", status: 200
  }));
  await page.route((url) => url.pathname === "/api/music/itunes/albums/123456789/tracks", (route) => route.fulfill({
    body: JSON.stringify({ tracks: [{ position: 1, recordingMbid: "itunes:987654321", title: "첫 곡" }] }), contentType: "application/json", status: 200
  }));
  await page.route((url) => url.pathname === "/api/music/records", async (route) => {
    if (route.request().method() === "GET") {
      if (saved) await recordReload;
      await route.fulfill({ body: JSON.stringify({ nextCursor: null, records: saved ? [savedRecord] : [] }), contentType: "application/json", status: 200 });
      return;
    }
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({ catalogId: "123456789", catalogSource: "ITUNES", releaseGroupMbid: "", releaseMbid: "" });
    saved = true;
    await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: "2026-08-21T00:00:00.000Z", operation: "CREATED" }), contentType: "application/json", status: 201 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill("극동");
  await page.getByRole("button", { name: "음반 찾기" }).click();
  await page.getByRole("button", { name: /새 음반/ }).click();
  await expect(page.locator(".catalog-album-detail")).not.toContainText("발매판 선택");
  await expect(page.locator(".catalog-track-list")).toContainText("첫 곡");
  await expect(page.getByText("YouTube 확인", { exact: true })).toHaveCount(0);
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption("itunes:987654321");
  await expect(page.locator("#favourite-track-select")).toHaveValue("itunes:987654321");
  await expect(page.getByText("YouTube 확인", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Notion에 기록 저장" }).click();
  const saveRequest = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/music/records");
  await page.getByRole("button", { name: "Notion에 저장하기" }).click();
  await saveRequest;
  await expect(page.locator(".record-editor .notice.success")).toHaveCount(0);
  releaseRecordReload?.();
  await expect(page.locator(".record-editor .notice.success")).toContainText("새 기록을 저장했습니다.");
  await expect(page.locator("#favourite-track-select")).toHaveValue("itunes:987654321");
  await expect(page.getByText("YouTube 확인", { exact: true })).toHaveCount(0);
  await expect(page.locator(".record-list")).toContainText("새 음반");
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await captureWorkflow(page, `itunes-record-workflow-${viewport.width}.png`, testInfo);
  }
});
