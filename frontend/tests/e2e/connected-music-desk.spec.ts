import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace, type AlbumFixture, type EditionFixture } from "./connected-workspace-fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: true }),
    contentType: "application/json",
    status: 200
  }));
});

test("shows curated public discovery without exposing a recorded album or Notion writes", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: false }),
    contentType: "application/json",
    status: 200
  }));

  await page.goto("/");
  await expect(page.locator("#personal-insights")).toBeVisible();
  await expect(page.getByRole("heading", { name: "이 아카이브에서 발견한 앨범" })).toBeVisible();
  await expect(page.getByText("Album One", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
  const reasons = page.locator(".recommendation-reason");
  await reasons.nth(0).locator("summary").click();
  await expect(page.getByText("이 아카이브의 공개 추천에서 고른 앨범입니다.", { exact: true })).toBeVisible();
  await expect(page.getByText("추천 근거를 바탕으로 다시 들을 한 장을 골랐습니다.")).toHaveCount(0);
  await expect(page.locator(".record-list")).toHaveCount(0);
  await expect(page.getByText(/최애곡/)).toHaveCount(0);
  await page.locator("#album-search").fill("Album One");
  await expect(page.locator("form.search-row button")).toBeEnabled();
  await page.locator("form.search-row button").click();

  await expect(page.locator(".candidate-row").filter({ hasText: "Album One" })).toBeVisible();
  await page.locator(".candidate-row").filter({ hasText: "Album One" }).click();
  await page.locator(".edition-option").filter({ hasText: "2024-01-01" }).click();
  await expect(page.locator(".catalog-track-list")).toContainText("Track One");
  await expect(page.getByRole("link", { name: "내 기록 열기" })).toBeVisible();
  await expect(page.locator("#favourite-track-select")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Notion/ })).toHaveCount(0);
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`public-catalog-visitor-${viewport.width}.png`), fullPage: true });
  }
});

test("shows the private archive and record controls only after owner authentication", async ({ page }) => {
  await routeConnectedWorkspace(page, { records: [{
    albumTitle: "Album One", artist: "Artist One", artistCredits: ["Artist One"], coverUrl: "",
    favouriteTrack: "Track One", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true,
    recordHandle: "record-one", releaseGroupMbid: "release-group-one", releaseMbid: "release-one", sentiment: "Loved"
  }] });

  await page.goto("/");

  await expect(page.locator(".insight-region")).toBeVisible();
  await expect(page.locator(".record-list")).toBeVisible();
  await expect(page.locator(".insight-heading .insight-refresh")).toBeVisible();
  await expect(page.locator(".record-actions")).toBeVisible();
  await page.locator("#album-search").fill("Album One");
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: "Album One" }).click();
  await expect(page.locator("#sentiment")).toBeVisible();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
});

test("Given Korean Album and EP candidates, when the owner chooses a reissue, then its factual tracks and release ID are saved", async ({ page }) => {
  const albums: readonly AlbumFixture[] = [
    { artist: "김사월", artistCredits: ["김사월"], coverUrl: "", firstReleaseDate: "2015-10-27", primaryType: "Album", releaseGroupMbid: "susan-group", searchScore: 100, title: "수잔" },
    { artist: "김사월", artistCredits: ["김사월"], coverUrl: "", firstReleaseDate: "2020-09-14", primaryType: "EP", releaseGroupMbid: "heaven-group", searchScore: 93, title: "헤븐 (Heaven)" }
  ];
  const editions: readonly EditionFixture[] = [
    { country: "KR", disambiguation: "초판", recommended: true, releaseDate: "2020-09-14", releaseGroupMbid: "heaven-group", releaseMbid: "heaven-first", status: "Official", title: "헤븐 (Heaven)" },
    { country: "KR", disambiguation: "2023 리이슈", recommended: false, releaseDate: "2023-06-01", releaseGroupMbid: "heaven-group", releaseMbid: "heaven-reissue", status: "Official", title: "헤븐 (Heaven)" }
  ];
  let savedReleaseMbid = "";
  await routeConnectedWorkspace(page, {
    albums,
    editions,
    tracks: [{ position: 1, recordingMbid: "heaven-track", title: "너무 깊이 생각하지 마" }]
  });
  await page.route("**/api/music/records", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload: unknown = route.request().postDataJSON();
    if (typeof payload === "object" && payload !== null && "releaseMbid" in payload && typeof payload.releaseMbid === "string") {
      savedReleaseMbid = payload.releaseMbid;
    }
    return route.fulfill({ body: JSON.stringify({ notionLastEditedAt: "2026-08-15T00:00:00.000Z", operation: "CREATED" }), contentType: "application/json", status: 201 });
  });

  await page.goto("/");
  await page.locator("#album-search").fill("김사월");
  await page.locator("form.search-row button").click();
  await expect(page.getByText("수잔", { exact: true })).toBeVisible();
  await expect(page.getByText("헤븐 (Heaven)", { exact: true })).toBeVisible();
  await expect(page.getByText("EP", { exact: true })).toBeVisible();
  await page.locator(".candidate-row").filter({ hasText: "헤븐 (Heaven)" }).click();

  await expect(page.getByText("발매판 선택", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /초판/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "발매판을 고르면 수록곡을 확인합니다." })).toBeVisible();
  await page.getByRole("button", { name: /초판/ }).click();
  await page.getByRole("button", { name: /2023 리이슈/ }).click();
  await expect(page.locator(".catalog-track-list")).toContainText("너무 깊이 생각하지 마");
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption("heaven-track");
  await page.getByRole("button", { name: "Notion에 기록 저장" }).click();
  await page.getByRole("button", { name: "Notion에 저장하기" }).click();

  await expect.poll(() => savedReleaseMbid).toBe("heaven-reissue");
});

test("Given visible personal recommendations, when an incremental refresh fails, then the last confirmed recommendation stays clearly labelled", async ({ page }, testInfo) => {
  let insightRequests = 0;
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/sync", (route) => route.fulfill({
    body: JSON.stringify({ changedRecordCount: 0, lastSuccessfulAt: "2026-08-13T00:00:00Z", stale: false, status: "CURRENT" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/music/insights*", (route) => {
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

  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
  await expect(page.getByText("새 추천을 불러오지 못했습니다. 마지막으로 확인된 추천을 보여드립니다.")).toBeVisible();
  await expect(page.getByText("개인 추천 근거 그래프에 잠시 연결할 수 없습니다. 기록은 변경하지 않았으니 잠시 뒤 다시 시도해 주세요.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("stale-recommendation-recovery.png"), fullPage: true });

  await page.getByRole("button", { name: "다시 불러오기" }).click();

  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
  await expect(page.getByText("새 추천을 불러오지 못했습니다. 마지막으로 확인된 추천을 보여드립니다.")).toHaveCount(0);
});

test("Given a settled personal workspace, when the owner refreshes recommendations, then static form options are not reloaded", async ({ page }) => {
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

  await expect(page.getByText("Album Two", { exact: true })).toBeVisible();
  await expect.poll(() => formOptionRequests).toBe(1);
});

test("shows one primary relisten and keeps technical recommendation details closed by default", async ({ page }) => {
  await routeConnectedWorkspace(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오늘 다시 들을 앨범" })).toBeVisible();
  await expect(page.getByText("GraphRAG", { exact: false })).toHaveCount(0);
  await expect(page.getByText("근거 점수", { exact: false })).toHaveCount(0);
  await expect(page.locator(".today-recommendation .recommendation-reason")).not.toHaveAttribute("open", "");
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
  await page.route("**/api/music/insights*", (route) => route.fulfill({
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
  await today.locator("summary").click();
  await recommendation.locator("summary").click();
  await expect(today).toContainText("내 기록에서 최애곡 “Favourite Track”을 남긴 앨범입니다.");
  await expect(recommendation).toContainText("내 기록의 아티스트 “Artist A”와 연결됩니다.");
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
        recordHandle: "record-1", releaseGroupMbid: "recorded-release-group", releaseMbid: "recorded-release", sentiment: "오래 남음"
      }]
    }), contentType: "application/json", status: 200
  }));
  await page.route("**/api/music/insights*", (route) => route.fulfill({
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
  await page.route("**/api/music/insights*", (route) => route.fulfill({ body: JSON.stringify({ graphTaste: { evidencePageIds: ["record-1"], personalRecordCount: 1, relisten: [], recommendations: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "Artist" }, taste: { artists: [{ count: 1, value: "Artist" }], favouriteTracks: [], recordCount: 1, sentiments: [{ count: 1, value: "Loved" }] } }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records", (route) => route.fulfill({ body: JSON.stringify({ records: [] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records/by-release-group/release-group-id", (route) => route.fulfill({ body: JSON.stringify({ record: null }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums?*", (route) => route.fulfill({ body: JSON.stringify({ albums: [{ artist: "Artist", artistCredits: ["Artist"], coverUrl: "", firstReleaseDate: "2024-01-01", primaryType: "Album", releaseGroupMbid: "release-group-id", searchScore: 100, title: "Selected Album" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/release-group-id/editions", (route) => route.fulfill({ body: JSON.stringify({ editions: [{ country: "US", disambiguation: "", recommended: true, releaseDate: "2024-01-01", releaseGroupMbid: "release-group-id", releaseMbid: "release-id", status: "Official", title: "Selected Album" }], hasMore: false, nextCursor: null }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/release-group-id/tracks*", (route) => route.fulfill({ body: JSON.stringify({ tracks: [{ position: 1, recordingMbid: "recording-id", title: "Actual Track" }] }), contentType: "application/json", status: 200 }));

  await page.goto("/");
  await page.locator("#album-search").fill("Selected Album");
  await page.locator("form.search-row button").click();
  await page.getByText("Selected Album", { exact: true }).click();
  await page.locator(".edition-option").filter({ hasText: "2024-01-01" }).click();

  await expect(page.locator("#favourite-track")).toHaveCount(0);
  await expect(page.locator("#favourite-track-select")).toContainText("Actual Track");
});

test("prefills an existing Notion record and makes its update explicit when the same album is selected", async ({ page }, testInfo) => {
  await page.route("**/api/music/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/form-options", (route) => route.fulfill({ body: JSON.stringify({ sentiments: ["Loved"] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/insights*", (route) => route.fulfill({ body: JSON.stringify({ graphTaste: { evidencePageIds: ["record-1"], personalRecordCount: 1, relisten: [], recommendations: [], retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", seedArtist: "Artist" }, taste: { artists: [{ count: 1, value: "Artist" }], favouriteTracks: [{ count: 1, value: "Existing Track" }], recordCount: 1, sentiments: [{ count: 1, value: "Loved" }] } }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records", (route) => route.fulfill({ body: JSON.stringify({ records: [{ albumTitle: "Recorded Album", artist: "Artist", artistCredits: ["Artist"], coverUrl: "", favouriteTrack: "Existing Track", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true, recordHandle: "record-1", releaseGroupMbid: "recorded-release-group", releaseMbid: "recorded-release", sentiment: "Loved" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/records/by-release-group/recorded-release-group", (route) => route.fulfill({ body: JSON.stringify({ record: { albumTitle: "Recorded Album", artist: "Artist", artistCredits: ["Artist"], coverUrl: "", favouriteTrack: "Existing Track", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true, recordHandle: "record-1", releaseGroupMbid: "recorded-release-group", releaseMbid: "recorded-release", sentiment: "Loved" } }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums?*", (route) => route.fulfill({ body: JSON.stringify({ albums: [{ artist: "Artist", artistCredits: ["Artist"], coverUrl: "", firstReleaseDate: "2024-01-01", primaryType: "Album", releaseGroupMbid: "recorded-release-group", searchScore: 100, title: "Recorded Album" }] }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/recorded-release-group/editions*", (route) => route.fulfill({ body: JSON.stringify({ editions: [{ country: "US", disambiguation: "", recommended: true, releaseDate: "2024-01-01", releaseGroupMbid: "recorded-release-group", releaseMbid: "recorded-release", status: "Official", title: "Recorded Album" }], hasMore: false, nextCursor: null }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums/recorded-release-group/tracks*", (route) => route.fulfill({ body: JSON.stringify({ tracks: [{ position: 1, recordingMbid: "existing-track", title: "Existing Track" }] }), contentType: "application/json", status: 200 }));

  await page.goto("/");
  await page.locator("#album-search").fill("Recorded Album");
  await page.locator("form.search-row button").click();
  const recordedCandidate = page.locator(".candidate-row").filter({ hasText: "Recorded Album" });
  await expect(recordedCandidate).toContainText("기록 있음");
  await recordedCandidate.click();

  await page.locator(".edition-option").filter({ hasText: "2024-01-01" }).click();

  await expect(page.locator("#sentiment")).toHaveValue("Loved");
  await expect(page.locator("#favourite-track-select")).toHaveValue("existing-track");
  await expect(page.locator("#owned")).toBeChecked();
  await expect(page.getByText("이미 Notion에 기록한 음반입니다. 저장하면 새 페이지 대신 기존 기록을 갱신합니다.")).toBeVisible();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
  await page.screenshot({ path: testInfo.outputPath("duplicate-record-prefill-desktop.png"), fullPage: true });
});

test("Given the owner record snapshot is delayed, when the same album is found, then selection waits and preserves the existing values", async ({ page }) => {
  let releaseRecords = (): void => undefined;
  const recordsGate = new Promise<void>((resolve) => {
    releaseRecords = resolve;
  });
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/music/records");
  await page.unroute((url) => /\/api\/music\/records\/by-release-group\/[^/]+$/.test(url.pathname));
  await page.route("**/api/music/records", async (route) => {
    await recordsGate;
    await route.fulfill({
      body: JSON.stringify({
        nextCursor: null,
        records: [{
          albumTitle: "Album One",
          artist: "Artist One",
          artistCredits: ["Artist One"],
          coverUrl: "",
          favouriteTrack: "Track One",
          lastEditedAt: "2026-08-11T00:00:00.000Z",
          owned: true,
          recordHandle: "record-1",
          releaseGroupMbid: "release-group-one",
          releaseMbid: "release-one",
          sentiment: "Loved"
        }]
      }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("**/api/music/records/by-release-group/release-group-one", (route) => route.fulfill({
    body: JSON.stringify({ record: {
      albumTitle: "Album One", artist: "Artist One", artistCredits: ["Artist One"], coverUrl: "",
      favouriteTrack: "Track One", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: true,
      recordHandle: "record-1", releaseGroupMbid: "release-group-one", releaseMbid: "release-one", sentiment: "Loved"
    } }), contentType: "application/json", status: 200
  }));

  await page.goto("/");
  await page.locator("#album-search").fill("Album One");
  await page.locator("form.search-row button").click();
  const candidate = page.locator(".candidate-row").filter({ hasText: "Album One" });
  await expect(candidate).toBeDisabled();

  releaseRecords();
  await expect(candidate).toBeEnabled();
  await candidate.click();

  await expect(page.locator("#sentiment")).toHaveValue("Loved");
  await expect(page.locator("#favourite-track-select")).toHaveValue("track-one");
  await expect(page.locator("#owned")).toBeChecked();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
});

test("Given a release group with many editions, when a later page temporarily fails, then retry appends one bounded page and keeps the selected edition", async ({ page }) => {
  const firstPageEditions: readonly EditionFixture[] = Array.from({ length: 20 }, (_, index) => ({
    country: "KR",
    disambiguation: "",
    recommended: index === 0,
    releaseDate: `2001-01-${String(index + 1).padStart(2, "0")}`,
    releaseGroupMbid: "release-group-one",
    releaseMbid: `release-${index}`,
    status: "Official",
    title: "Album One"
  }));
  let editionRequests = 0;
  let failedCursorRequest = false;
  await routeConnectedWorkspace(page);
  await page.unroute((url) => /\/api\/music\/albums\/[^/]+\/editions$/.test(url.pathname));
  await page.route((url) => /\/api\/music\/albums\/[^/]+\/editions$/.test(url.pathname), (route) => {
    editionRequests += 1;
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor === "20" && !failedCursorRequest) {
      failedCursorRequest = true;
      return route.fulfill({ body: JSON.stringify({ code: "BACKEND_UNAVAILABLE", retryable: true }), contentType: "application/json", status: 503 });
    }
    return route.fulfill({
      body: JSON.stringify(cursor === null
        ? { editions: firstPageEditions, hasMore: true, nextCursor: "20" }
        : { editions: [{ ...firstPageEditions[1], recommended: false, releaseMbid: "release-20" }], hasMore: false, nextCursor: null }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/?q=Album%20One");
  await page.locator(".candidate-row").filter({ hasText: "Album One" }).click();
  await expect(page.locator(".edition-option")).toHaveCount(20);
  await expect(page.locator(".edition-option").first()).toHaveAttribute("aria-pressed", "false");
  await page.locator(".edition-option").first().click();
  await expect(page.locator(".edition-option").first()).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "발매판 더 보기" }).click();

  await expect(page.locator(".edition-picker .notice.error")).toContainText("잠시 뒤 다시 시도");
  await expect(page.getByRole("button", { name: "발매판 다시 불러오기" })).toBeVisible();
  await page.getByRole("button", { name: "발매판 다시 불러오기" }).click();

  await expect(page.locator(".edition-option")).toHaveCount(21);
  await expect(page.locator(".edition-option").first()).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => editionRequests).toBe(3);
});
