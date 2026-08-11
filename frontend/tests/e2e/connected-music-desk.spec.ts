import { expect, test } from "@playwright/test";

test("shows recorded relistens before new MusicBrainz discoveries with their distinct evidence", async ({ page }, testInfo) => {
  await page.route("**/api/music/health", (route) => route.fulfill({
    body: JSON.stringify({ mode: "connected", status: "ok" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/music/form-options", (route) => route.fulfill({
    body: JSON.stringify({ sentiments: ["오래 남음"] }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/music/insights", (route) => route.fulfill({
    body: JSON.stringify({
      graphTaste: {
        evidencePageIds: ["record-1"],
        personalRecordCount: 1,
        retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
        relisten: [{
          artist: "Artist A",
          coverUrl: "",
          evidenceMethod: "PERSONAL_RECORD_RELISTEN",
          evidencePageId: "record-1",
          favouriteTrack: "Favourite Track",
          owned: true,
          releaseGroupMbid: "recorded-release-group",
          title: "Recorded Album"
        }],
        recommendations: [{
          artist: "Artist A",
          artistCredits: ["Artist A"],
          coverUrl: "",
          evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          evidencePaths: [{ recordPageId: "record-1", relation: "RECORDED_BY", value: "Artist A" }],
          firstReleaseDate: "2024-01-01",
          releaseGroupMbid: "new-release-group",
          title: "New Discovery",
          score: 1
        }],
        seedArtist: "Artist A"
      },
      taste: {
        artists: [{ count: 1, value: "Artist A" }],
        favouriteTracks: [{ count: 1, value: "Favourite Track" }],
        recordCount: 1,
        sentiments: [{ count: 1, value: "오래 남음" }]
      }
    }),
    contentType: "application/json",
    status: 200
  }));

  await page.goto("/");

  const recommendation = page.locator(".recommendation-note");
  await expect(recommendation).toContainText("Recorded Album");
  await expect(recommendation).toContainText("New Discovery");
  await expect(recommendation.locator(".recommendation-row")).toHaveCount(2);
  await expect(recommendation).toContainText("Artist A");
  await expect(recommendation.getByText("Recorded Album", { exact: true })).toBeVisible();
  await expect(recommendation.getByText("New Discovery", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`connected-music-insights-${testInfo.project.name}.png`), fullPage: true });
});

test("keeps the connected personal-insights workspace legible at every supported review width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures the canonical widths once");
  await page.route("**/api/music/health", (route) => route.fulfill({
    body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200
  }));
  await page.route("**/api/music/form-options", (route) => route.fulfill({
    body: JSON.stringify({ sentiments: ["오래 남음"] }), contentType: "application/json", status: 200
  }));
  await page.route("**/api/music/insights", (route) => route.fulfill({
    body: JSON.stringify({
      graphTaste: {
        evidencePageIds: ["record-1"], personalRecordCount: 1, retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
        relisten: [{ artist: "Artist A", coverUrl: "", evidenceMethod: "PERSONAL_RECORD_RELISTEN", evidencePageId: "record-1", favouriteTrack: "Favourite Track", owned: true, releaseGroupMbid: "recorded-release-group", title: "Recorded Album" }],
        recommendations: [{ artist: "Artist A", artistCredits: ["Artist A"], coverUrl: "", evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", evidencePaths: [{ recordPageId: "record-1", relation: "RECORDED_BY", value: "Artist A" }], firstReleaseDate: "2024-01-01", releaseGroupMbid: "new-release-group", score: 1, title: "New Discovery" }],
        seedArtist: "Artist A"
      },
      taste: { artists: [{ count: 1, value: "Artist A" }], favouriteTracks: [{ count: 1, value: "Favourite Track" }], recordCount: 1, sentiments: [{ count: 1, value: "오래 남음" }] }
    }), contentType: "application/json", status: 200
  }));

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".recommendation-note")).toContainText("Recorded Album");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`connected-music-insights-${viewport.width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.locator("#album-search").focus();
  await expect(page.locator("#album-search")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("connected-music-focus-375.png"), fullPage: true });
});

test("loads actual MusicBrainz tracks before a listener can choose a favourite track", async ({ page }) => {
  await page.route("**/api/music/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/form-options", (route) => route.fulfill({ body: JSON.stringify({ sentiments: ["Loved"] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/insights", (route) => route.fulfill({ body: JSON.stringify({ graphTaste: { evidencePageIds: ["record-1"], personalRecordCount: 1, relisten: [], recommendations: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "Artist" }, taste: { artists: [{ count: 1, value: "Artist" }], favouriteTracks: [], recordCount: 1, sentiments: [{ count: 1, value: "Loved" }] } }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records", (route) => route.fulfill({ body: JSON.stringify({ records: [] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums?*", (route) => route.fulfill({ body: JSON.stringify({ albums: [{ artist: "Artist", artistCredits: ["Artist"], coverUrl: "", firstReleaseDate: "2024-01-01", releaseGroupMbid: "release-group-id", title: "Selected Album" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/release-group-id/tracks", (route) => route.fulfill({ body: JSON.stringify({ tracks: [{ position: 1, recordingMbid: "recording-id", title: "Actual Track" }] }), contentType: "application/json", status: 200 }));

  await page.goto("/");
  await page.locator("#album-search").fill("Selected Album");
  await page.locator("form.search-row button").click();
  await page.getByText("Selected Album", { exact: true }).click();

  await expect(page.locator("#favourite-track")).toHaveCount(0);
  await expect(page.locator("#favourite-track-select")).toContainText("Actual Track");
});

test("prefills an existing Notion record and makes its update explicit when the same album is selected", async ({ page }, testInfo) => {
  await page.route("**/api/music/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/form-options", (route) => route.fulfill({ body: JSON.stringify({ sentiments: ["Loved"] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/insights", (route) => route.fulfill({ body: JSON.stringify({ graphTaste: { evidencePageIds: ["record-1"], personalRecordCount: 1, relisten: [], recommendations: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "Artist" }, taste: { artists: [{ count: 1, value: "Artist" }], favouriteTracks: [{ count: 1, value: "Existing Track" }], recordCount: 1, sentiments: [{ count: 1, value: "Loved" }] } }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records", (route) => route.fulfill({ body: JSON.stringify({ records: [{ albumTitle: "Recorded Album", artist: "Artist", artistCredits: ["Artist"], coverUrl: "", favouriteTrack: "Existing Track", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true, pageId: "record-1", releaseGroupMbid: "recorded-release-group", sentiment: "Loved" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums?*", (route) => route.fulfill({ body: JSON.stringify({ albums: [{ artist: "Artist", artistCredits: ["Artist"], coverUrl: "", firstReleaseDate: "2024-01-01", releaseGroupMbid: "recorded-release-group", title: "Recorded Album" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/recorded-release-group/tracks", (route) => route.fulfill({ body: JSON.stringify({ tracks: [{ position: 1, recordingMbid: "existing-track", title: "Existing Track" }] }), contentType: "application/json", status: 200 }));

  await page.goto("/");
  await page.locator("#album-search").fill("Recorded Album");
  await page.locator("form.search-row button").click();
  await page.getByText("Recorded Album", { exact: true }).first().click();

  await expect(page.locator("#sentiment")).toHaveValue("Loved");
  await expect(page.locator("#favourite-track-select")).toHaveValue("Existing Track");
  await expect(page.locator("#owned")).toBeChecked();
  await expect(page.getByText("이미 Notion에 기록한 음반입니다. 저장하면 새 페이지 대신 기존 기록을 갱신합니다.")).toBeVisible();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
  await page.screenshot({ path: testInfo.outputPath("duplicate-record-prefill-desktop.png"), fullPage: true });
});
