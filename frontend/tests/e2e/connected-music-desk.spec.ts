import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: true }),
    contentType: "application/json",
    status: 200
  }));
});

test("keeps public MusicBrainz search usable while hiding the private workspace from visitors", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: false }),
    contentType: "application/json",
    status: 200
  }));

  await page.goto("/");
  await page.locator("#album-search").fill("Album One");
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await page.locator("form.search-row button").click();

  await expect(page.getByText("Album One", { exact: true })).toBeVisible();
  await page.getByText("Album One", { exact: true }).click();
  await expect(page.locator(".catalog-track-list")).toContainText("Track One");
  await expect(page.getByText("내 Notion 기록과 추천은 소유자만 볼 수 있습니다.")).toBeVisible();
  await expect(page.locator("#favourite-track-select")).toHaveCount(0);
  await expect(page.locator("#personal-insights .recommendation-note")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath("public-catalog-visitor-375.png"), fullPage: true });
});

test("Given visible personal recommendations, when a refresh cannot retrieve the latest insights, then stale recommendations are removed and the listener can retry", async ({ page }, testInfo) => {
  let insightRequests = 0;
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/sync", (route) => route.fulfill({
    body: JSON.stringify({ changedRecordCount: 0, lastSuccessfulAt: "2026-08-13T00:00:00Z", stale: false, status: "CURRENT" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/music/insights", (route) => {
    insightRequests += 1;
    if (insightRequests === 2) {
      return route.fulfill({
        body: JSON.stringify({ code: "GRAPHDB_UNAVAILABLE", message: "GraphDB unavailable" }),
        contentType: "application/json",
        status: 503
      });
    }
    return route.fulfill({
      body: JSON.stringify({
        graphTaste: {
          evidencePageIds: ["notion-record-one"],
          personalRecordCount: 1,
          relisten: [],
          recommendations: [{
            artist: "Artist Two",
            coverUrl: "",
            evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
            evidencePaths: [{ recordPageId: "notion-record-one", relation: "SHARES_MUSICBRAINZ_TAG", value: "dream pop" }],
            firstReleaseDate: "2025-01-01",
            releaseGroupMbid: "release-group-two",
            score: 7,
            title: "Album Two"
          }],
          retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
          seedArtist: "Artist One"
        },
        taste: {
          artists: [{ count: 1, value: "Artist One" }],
          favouriteTracks: [{ count: 1, value: "Track One" }],
          recordCount: 1,
          sentiments: [{ count: 1, value: "Loved" }]
        }
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/");
  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "새로 고침" }).click();

  await expect(page.getByText("Album Two", { exact: true })).toHaveCount(0);
  await expect(page.getByText("개인 추천 근거 그래프에 잠시 연결할 수 없습니다. 기록은 변경하지 않았으니 잠시 뒤 다시 시도해 주세요.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("stale-recommendation-recovery.png"), fullPage: true });

  await page.locator(".insight-state .insight-refresh").click();

  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
});

test("Given visible personal recommendations, when the personal workspace reconnect fails, then stale recommendations are removed", async ({ page }) => {
  let formOptionRequests = 0;
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/sync", (route) => route.fulfill({
    body: JSON.stringify({ changedRecordCount: 0, lastSuccessfulAt: "2026-08-13T00:00:00Z", stale: false, status: "CURRENT" }),
    contentType: "application/json",
    status: 200
  }));
  await page.unroute("**/api/music/form-options");
  await page.route("**/api/music/form-options", (route) => {
    formOptionRequests += 1;
    return route.fulfill({
      body: formOptionRequests === 1
        ? JSON.stringify({ sentiments: ["Loved"] })
        : JSON.stringify({ code: "BACKEND_UNAVAILABLE", message: "temporary" }),
      contentType: "application/json",
      status: formOptionRequests === 1 ? 200 : 503
    });
  });

  await page.goto("/");
  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "새로 고침" }).click();

  await expect(page.getByText("Album Two", { exact: true })).toHaveCount(0);
  await expect(page.getByText("추천을 불러오지 못했습니다.")).toBeVisible();
});

test("shows one primary relisten and keeps technical recommendation details closed by default", async ({ page }) => {
  await routeConnectedWorkspace(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오늘 다시 들을 앨범" })).toBeVisible();
  await expect(page.getByText("GraphRAG", { exact: false })).toHaveCount(0);
  await expect(page.getByText("근거 점수", { exact: false })).toHaveCount(0);
  await expect(page.locator(".today-recommendation .recommendation-reason summary")).toHaveText("왜 이 앨범인가요?");
});

test("Given graph-backed recommendations, when the listener explicitly requests a grounded LLM explanation, then the cited explanation appears without changing the recommendations", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/insights/explanation", (route) => route.fulfill({
    body: JSON.stringify({
      answer: "기록한 앨범의 최애곡과 감상을 근거로 다음 앨범을 골랐습니다.",
      citations: [{ artist: "Artist One", label: "E1", recordTitle: "Recorded Album", relation: "RECORDED_BY" }],
      status: "GENERATED"
    }),
    contentType: "application/json",
    status: 200
  }));

  await page.goto("/");
  await page.getByText("추천을 문장으로 보기", { exact: true }).click();
  await expect(page.getByRole("button", { name: "설명 만들기" })).toBeVisible();
  await page.getByRole("button", { name: "설명 만들기" }).click();

  await expect(page.getByText("기록한 앨범의 최애곡과 감상을 근거로 다음 앨범을 골랐습니다.")).toBeVisible();
  await expect(page.getByText("Recorded Album · Artist One", { exact: true })).toBeVisible();
  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("grounded-explanation.png"), fullPage: true });
});

test("Given a synchronized personal graph, when the listener requests a refresh, then the workspace requests only the protected sync endpoint", async ({ page }) => {
  let syncRequests = 0;
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/sync", async (route) => {
    syncRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ changedRecordCount: 0, lastSuccessfulAt: "2026-08-13T00:00:00Z", stale: false, status: "CURRENT" })
    });
  });

  await page.goto("/");
  await page.locator(".insight-heading .insight-refresh").click();

  await expect.poll(() => syncRequests).toBe(1);
});

test("offers a keyboard skip link to the listening workspace", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

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

  const today = page.locator(".today-recommendation");
  const recommendation = page.locator(".recommendation-note");
  await expect(today).toContainText("Recorded Album");
  await expect(recommendation).toContainText("New Discovery");
  await expect(page.locator(".today-recommendation, .recommendation-note").locator(".relisten-entry, .discovery-entry")).toHaveCount(1);
  await expect(today).toContainText("Artist A");
  await expect(today.getByText("Recorded Album", { exact: true })).toBeVisible();
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
  await page.route("**/api/music/records", (route) => route.fulfill({
    body: JSON.stringify({
      nextCursor: null,
      records: [{
        albumTitle: "Recorded Album", artist: "Artist A", artistCredits: ["Artist A"], coverUrl: "",
        favouriteTrack: "Favourite Track", lastEditedAt: "2026-08-13T00:00:00.000Z", owned: true,
        recordHandle: "record-1", releaseGroupMbid: "recorded-release-group", sentiment: "오래 남음"
      }]
    }), contentType: "application/json", status: 200
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
    await expect(page.locator(".today-recommendation")).toContainText("Recorded Album");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`connected-music-insights-${viewport.width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#album-search").focus();
  await expect(page.locator("#album-search")).toBeFocused();
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath("connected-music-focus-375.png") });

  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("connected-music-skip-focus-375.png") });
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
  await page.route("**/api/music/records", (route) => route.fulfill({ body: JSON.stringify({ records: [{ albumTitle: "Recorded Album", artist: "Artist", artistCredits: ["Artist"], coverUrl: "", favouriteTrack: "Existing Track", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true, recordHandle: "record-1", releaseGroupMbid: "recorded-release-group", sentiment: "Loved" }] }), contentType: "application/json", status: 200 }));
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
