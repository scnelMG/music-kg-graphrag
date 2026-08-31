import { expect, test } from "@playwright/test";

import { albumFixture, routeConnectedWorkspace, trackFixture, type RecordFixture } from "./connected-workspace-fixtures";

test("Given more than twelve Notion records, when the listener opens record management, then later pages load only on request", async ({ page }) => {
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
      body: JSON.stringify({ nextCursor: cursor === null ? "record-cursor-12" : null, records: cursor === null ? records.slice(0, 12) : records.slice(12) }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/owner/workspace");

  await expect(page.locator(".record-entry")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "다음 기록 더 보기" })).toBeVisible();

  await page.getByRole("button", { name: "다음 기록 더 보기" }).click();

  await expect(page.locator(".record-entry")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "다음 기록 더 보기" })).toHaveCount(0);
});

test("Given a large personal history, when the desk opens, then records and insights load in parallel", async ({ page }) => {
  let insightsRequested = 0;
  let recordsRequested = false;
  let releaseRecords: (() => void) | undefined;
  const pendingRecords = new Promise<void>((resolve) => { releaseRecords = resolve; });
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/music/insights*");
  await page.unroute((url) => url.pathname === "/api/music/records");
  await page.route((url) => url.pathname === "/api/music/insights", async (route) => {
    insightsRequested += 1;
    await route.fulfill({
      body: JSON.stringify({
        graphTaste: { evidencePageIds: ["notion-record-one"], personalRecordCount: 1, recommendations: [], relisten: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "Artist One" },
        taste: { artists: [], favouriteTracks: [], recordCount: 1, sentiments: [] }
      }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route((url) => url.pathname === "/api/music/records", async (route) => {
    recordsRequested = true;
    await pendingRecords;
    await route.fulfill({ body: JSON.stringify({ nextCursor: null, records: [] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await expect.poll(() => recordsRequested).toBe(true);
  await expect.poll(() => insightsRequested).toBe(1);

  releaseRecords?.();
  await expect(page.getByText("아직 저장된 기록이 없습니다.")).toBeVisible();
  expect(insightsRequested).toBe(1);
});

test("Given the personal form connection initially fails, when the listener retries records, then recording becomes available again", async ({ page }) => {
  let formOptionRequests = 0;
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/music/form-options");
  await page.route("**/api/music/form-options", (route) => {
    formOptionRequests += 1;
    if (formOptionRequests === 1) {
      return route.fulfill({
        body: JSON.stringify({ code: "BACKEND_UNAVAILABLE", message: "temporary" }),
        contentType: "application/json",
        status: 503
      });
    }
    return route.fulfill({
      body: JSON.stringify({ sentiments: ["Loved", "Reflective"] }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/owner/workspace");
  await expect(page.getByRole("button", { name: "기록 다시 불러오기" })).toBeVisible();

  await page.getByRole("button", { name: "기록 다시 불러오기" }).click();

  await expect(page.getByText("개인 기록 연결됨", { exact: true })).toBeVisible();
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await expect(page.locator("#sentiment")).toBeEnabled();
  expect(formOptionRequests).toBe(2);
});

test("Given no selected album, when the connected desk opens, then record fields stay hidden until a real result is chosen", async ({ page }) => {
  await routeConnectedWorkspace(page);

  await page.goto("/owner/workspace");

  await expect(page.locator("#sentiment")).toHaveCount(0);
  await expect(page.locator("#favourite-track-select")).toHaveCount(0);
  await expect(page.locator("#owned")).toHaveCount(0);
  await expect(page.locator(".save-button")).toHaveCount(0);
  await expect(page.getByText("검색 결과에서 앨범 하나를 고르면 감상과 최애곡을 남길 수 있어요.")).toBeVisible();

  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await expect(page).toHaveURL(/\?q=/);
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();

  await expect(page.locator("#sentiment")).toBeVisible();
  await expect(page.locator("#favourite-track-select")).toBeVisible();
  await expect(page.locator("#owned")).toBeVisible();
  await expect(page.locator(".save-button")).toBeVisible();
});

test("Given a shared search link, when the connected desk opens, then it restores and executes the query", async ({ page }) => {
  let requestedQuery = "";
  await routeConnectedWorkspace(page);
  await page.route((url) => url.pathname === "/api/music/albums", async (route) => {
    requestedQuery = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({ body: JSON.stringify({ albums: [albumFixture] }), contentType: "application/json", status: 200 });
  });

  await page.goto(`/?q=${encodeURIComponent(albumFixture.title)}`);

  await expect(page.locator("#album-search")).toHaveValue(albumFixture.title);
  await expect(page.locator("#album-search")).toHaveAttribute("name", "q");
  await expect(page.locator("#album-search")).toHaveAttribute("autocomplete", "off");
  await expect(page.locator("#album-search")).toHaveAttribute("inputmode", "search");
  await expect(page.locator(".candidate-row").filter({ hasText: albumFixture.title })).toBeVisible();
  expect(requestedQuery).toBe(albumFixture.title);
});

test("Given a MusicBrainz album, when a listener selects its track and sentiment, then the record is created through the connected BFF", async ({ page }, testInfo) => {
  let saved = false;
  const savedRecord: RecordFixture = {
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
  await page.route("**/api/music/records", async (route) => {
    if (route.request().method() === "POST") {
      const payload: unknown = route.request().postDataJSON();
      expect(payload).toMatchObject({ albumTitle: albumFixture.title, favouriteTrack: trackFixture.title,
        favouriteRecordingMbid: trackFixture.recordingMbid, sentiment: "Loved" });
      expect(route.request().headers()["x-music-kg-write-confirmed"]).toBe("true");
      saved = true;
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: savedRecord.lastEditedAt, notionPageId: savedRecord.recordHandle, operation: "CREATED" }), contentType: "application/json", status: 201 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ records: saved ? [savedRecord] : [] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await page.locator(".edition-option").filter({ hasText: "2024-01-01" }).click();
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption(trackFixture.recordingMbid);
  await page.locator("#owned").check();
  await expect(page.locator(".save-button")).toBeEnabled();

  await page.locator(".save-button").click();
  await expect(page.locator(".save-confirmation")).toContainText("이 기록을 Notion에 저장할까요?");
  await expect(page.getByRole("button", { name: "Notion에 저장하기" })).toBeFocused();
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: testInfo.outputPath(`record-save-confirmation-${viewport.width}.png`), fullPage: true });
  }
  expect(saved).toBe(false);
  await page.getByRole("button", { name: "Notion에 저장하기" }).click();

  await expect(page.locator(".record-list")).toContainText(albumFixture.title);
  await expect(page.locator(".record-list")).toContainText(trackFixture.title);
  await expect(page.locator(".notice.success").filter({ hasText: "Notion 음악 감상 데이터베이스에 새 기록을 저장했습니다." })).toBeFocused();
});

test("Given an existing Notion record, when its MusicBrainz release group is selected, then the form is prefilled for an update", async ({ page }) => {
  const existingRecord: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-11T00:00:00.000Z",
    owned: true,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Reflective"
  };
  await routeConnectedWorkspace(page, { records: [existingRecord] });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();

  await expect(page.locator("#sentiment")).toHaveValue(existingRecord.sentiment);
  await expect(page.locator("#favourite-track-select")).toHaveValue(trackFixture.recordingMbid);
  await expect(page.locator("#owned")).toBeChecked();
});

test("Given a selected album with a delayed track request, when a new search clears the selection, then the late track response cannot restore it", async ({ page }) => {
  let releaseTracks: (() => void) | undefined;
  const pendingTracks = new Promise<void>((resolve) => { releaseTracks = resolve; });
  await routeConnectedWorkspace(page);
  await page.unroute((url) => url.pathname === "/api/music/albums");
  await page.route(`**/api/music/albums/${albumFixture.releaseGroupMbid}/tracks`, async (route) => {
    await pendingTracks;
    await route.fulfill({ body: JSON.stringify({ tracks: [trackFixture] }), contentType: "application/json", status: 200 });
  });
  await page.route((url) => url.pathname === "/api/music/albums", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    const albums = query === "second" ? [] : [albumFixture];
    return route.fulfill({ body: JSON.stringify({ albums }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill("first");
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await page.locator("#album-search").fill("second");
  await page.locator("form.search-row button").click();
  await expect(page.locator(".candidate-row")).toHaveCount(0);

  releaseTracks?.();
  await expect(page.locator("#favourite-track-select")).toHaveCount(0);
  await expect(page.locator(".selected-record")).not.toContainText(albumFixture.title);
});

test("Given a stored Notion record, when the listener cancels archive confirmation, then Notion is unchanged", async ({ page }, testInfo) => {
  let archiveRequests = 0;
  const existingRecord: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-11T00:00:00.000Z",
    owned: false,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Loved"
  };
  await routeConnectedWorkspace(page, { records: [existingRecord] });
  await page.route(/\/api\/music\/records(?:\/.*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "DELETE") archiveRequests += 1;
    await route.fulfill({ body: JSON.stringify({ records: [existingRecord] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.getByRole("button", { name: "Notion에서 보관" }).click();
  await expect(page.locator(".archive-confirmation")).toContainText(existingRecord.albumTitle);
  await expect(page.getByRole("button", { name: "보관하기" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("record-archive-confirmation.png"), fullPage: true });
  await page.getByRole("button", { name: "보관하지 않기" }).click();
  await expect(page.locator(".archive-confirmation")).toHaveCount(0);
  expect(archiveRequests).toBe(0);
  await page.keyboard.press("Escape");

  expect(archiveRequests).toBe(0);
  await expect(page.locator(".record-list")).toContainText(existingRecord.albumTitle);
});

test("Given a stored Notion record, when the listener confirms archive, then the refreshed archive no longer lists it", async ({ page }) => {
  let archived = false;
  const existingRecord: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-11T00:00:00.000Z",
    owned: false,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Loved"
  };
  await routeConnectedWorkspace(page);
  await page.route(/\/api\/music\/records(?:\/.*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "DELETE") {
      archived = true;
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: existingRecord.lastEditedAt, notionPageId: existingRecord.recordHandle, operation: "ARCHIVED" }), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ records: archived ? [] : [existingRecord] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await expect(page.locator(".record-list")).toContainText(existingRecord.albumTitle);
  await page.getByRole("button", { name: "Notion에서 보관" }).click();
  await page.getByRole("button", { name: "보관하기" }).click();
  await expect(page.locator(".record-list .record-entry")).toHaveCount(0);
  await expect(page.locator(".notice.success").filter({ hasText: `${existingRecord.albumTitle} 기록을 보관했습니다.` })).toBeFocused();
});

test("Given a newly archived Notion record, when the listener chooses undo, then the record is restored", async ({ page }, testInfo) => {
  let archived = false;
  let restoreRequests = 0;
  const existingRecord: RecordFixture = {
    albumTitle: albumFixture.title,
    artist: albumFixture.artist,
    artistCredits: albumFixture.artistCredits,
    coverUrl: albumFixture.coverUrl,
    favouriteTrack: trackFixture.title,
    lastEditedAt: "2026-08-11T00:00:00.000Z",
    owned: false,
    recordHandle: "notion-record-one",
    releaseGroupMbid: albumFixture.releaseGroupMbid,
    releaseMbid: "release-one",
    sentiment: "Loved"
  };
  await routeConnectedWorkspace(page);
  await page.route(/\/api\/music\/records(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      archived = true;
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: existingRecord.lastEditedAt, notionPageId: existingRecord.recordHandle, operation: "ARCHIVED" }), contentType: "application/json", status: 200 });
      return;
    }
    if (request.method() === "POST" && request.url().endsWith("/restore")) {
      restoreRequests += 1;
      archived = false;
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: existingRecord.lastEditedAt, notionPageId: existingRecord.recordHandle, operation: "RESTORED" }), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ records: archived ? [] : [existingRecord] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.getByRole("button", { name: "Notion에서 보관" }).click();
  await page.getByRole("button", { name: "보관하기" }).click();
  await page.getByRole("button", { name: "보관 취소" }).click();
  await expect(page.locator(".save-confirmation")).toContainText("이 기록을 Notion에 복원할까요?");
  await expect(page.getByRole("button", { name: "Notion에서 복원하기" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("record-restore-confirmation.png"), fullPage: true });
  expect(restoreRequests).toBe(0);
  await page.getByRole("button", { name: "Notion에서 복원하기" }).click();

  await expect(page.locator(".record-list")).toContainText(existingRecord.albumTitle);
  await expect(page.locator(".notice.success").filter({ hasText: "Notion 기록을 복원했습니다." })).toBeFocused();
  expect(restoreRequests).toBe(1);
});

test("Given unavailable private insights, when the desk opens, then the public search stays visible without fabricated recommendations", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/music/insights*");
  await page.route((url) => url.pathname === "/api/music/insights", (route) => route.fulfill({ body: JSON.stringify({ code: "BACKEND_UNAVAILABLE", retryable: true }), contentType: "application/json", status: 503 }));

  await page.goto("/owner/workspace");

  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await expect(page.locator(".record-list .record-entry")).toHaveCount(0);
  await expect(page.locator(".recommendation-note")).toHaveCount(0);
});
