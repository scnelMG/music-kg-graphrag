import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test("Given a public visitor, when real discovery cards are liked or skipped, then likes stay browser-local and cards open catalog exploration", async ({ page }) => {
  const requests: string[] = [];
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.unroute("**/api/music/insights*");
  await page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner: false }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/insights*", (route) => route.fulfill({
    body: JSON.stringify({ graphTaste: {
      relisten: [],
      recommendations: [
        { artist: "Artist One", coverUrl: "", firstReleaseDate: "2024-01-01", publicCurationReason: "shared-tag", releaseGroupMbid: "public-one", sharedMusicBrainzTag: "dream pop", title: "Public One" },
        { artist: "Artist Two", artistCredits: ["Artist Two"], coverUrl: "", firstReleaseDate: "2023-01-01", primaryType: "EP", publicCurationReason: "same-artist", releaseGroupMbid: "public-two", title: "Public Two" }
      ]
    } }), contentType: "application/json", status: 200
  }));
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));

  await page.goto("/");
  const deck = page.getByTestId("public-discovery-deck");
  await expect(deck.locator(".discovery-stage-frame")).toHaveCount(1);
  await expect(deck).toContainText("Public One");
  expect(requests).not.toContain("/api/owner/session");
  await expect(deck).toContainText("아카이브에 쌓인 “dream pop” 흐름과 이어집니다.");
  await expect(deck.getByRole("button", { name: "수록곡 보기", exact: true })).toBeVisible();
  await expect(deck.getByRole("button", { name: "Public One 수록곡 보기" })).toHaveCount(0);

  await page.clock.install();
  await deck.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(deck.locator(".discovery-card")).toHaveAttribute("data-transition-state", "exiting");
  await expect(deck).toContainText("Public One");
  await page.clock.runFor(80);
  await expect(deck).toContainText("Public One");
  await page.clock.runFor(80);
  await expect(deck).toContainText("Public Two");
  await page.reload();
  await page.getByTestId("public-discovery-deck").focus();
  await page.keyboard.press("ArrowRight");
  await expect(deck).toContainText("Public Two");
  await expect(deck).toContainText("EP");
  await expect(deck).toContainText("아카이브가 다뤄 온 아티스트의 다른 앨범입니다.");
  await expect(deck).not.toContainText("실제 EP");
  await expect(page.getByTestId("public-liked-list")).toContainText("Public One");
  expect(requests.some((path) => path.startsWith("/api/music/records"))).toBe(false);

  await page.reload();
  const nestedLike = page.getByTestId("public-discovery-deck").getByRole("button", { name: "좋아요" });
  await nestedLike.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("public-discovery-deck")).toContainText("Public One");

  await expect(page.getByTestId("public-liked-list")).toContainText("Public One");
  await page.getByTestId("public-liked-list").getByRole("button", { name: "열기", exact: true }).click();
  await expect(page.locator(".catalog-album-detail")).toContainText("Public One");
});

test("Given a public search, when a Korean consonant-only or empty result query is entered, then it explains and recovers without dead detail", async ({ page }) => {
  let catalogRequests = 0;
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.unroute("**/api/music/albums*");
  await page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner: false }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/albums*", (route) => {
    catalogRequests += 1;
    return route.fulfill({ body: JSON.stringify({ albums: [] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/");
  await expect(page.locator(".catalog-album-detail")).toHaveCount(0);
  await page.locator("#album-search").fill("ㅇㄴㄹ");
  await page.locator("form.search-row button").click();
  await expect(page.locator(".result-region")).toContainText("초성 검색은 지원하지 않아요");
  expect(catalogRequests).toBe(0);

  await page.locator("#album-search").fill("No matching album");
  await page.locator("form.search-row button").click();
  await expect(page.locator(".result-region")).toContainText("일치하는 앨범을 찾지 못했습니다.");
  await page.getByRole("button", { name: "Kind of Blue 검색" }).click();
  await expect.poll(() => catalogRequests).toBe(2);
  await expect(page.locator(".result-region")).toContainText("일치하는 앨범을 찾지 못했습니다.");
  await page.getByRole("button", { name: "입력 지우기" }).click();
  await expect(page.locator("#album-search")).toHaveValue("");

  const requestsBeforeLongQuery = catalogRequests;
  await page.locator("#album-search").fill("가".repeat(201));
  await page.locator("form.search-row button").click();
  await expect(page.locator(".result-region")).toContainText("검색어는 200자 이하로 입력해 주세요.");
  expect(catalogRequests).toBe(requestsBeforeLongQuery);
});

test("Given no public curation card, when a visitor chooses a declared genre, then only real catalog results populate the deck", async ({ page }) => {
  const requests: string[] = [];
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.unroute("**/api/music/insights*");
  await page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner: false }), contentType: "application/json", status: 200 }));
  await page.route("**/api/music/insights*", (route) => route.fulfill({
    body: JSON.stringify({ graphTaste: { relisten: [], recommendations: [] } }), contentType: "application/json", status: 200
  }));
  await page.route("**/api/music/catalog/explore?genre=dream-pop", (route) => route.fulfill({
    body: JSON.stringify({ albums: [{ artist: "Genre Artist", artistCredits: ["Genre Artist"], coverUrl: "", firstReleaseDate: "2024-01-01", primaryType: "EP", releaseGroupMbid: "genre-ep", searchScore: 1, title: "Genre EP" }] }),
    contentType: "application/json", status: 200
  }));
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));

  await page.goto("/");
  await expect(page.locator(".genre-collection")).toContainText("원하는 흐름부터 찾아보세요.");
  await page.getByRole("button", { name: "드림 팝" }).click();
  await expect(page.getByTestId("public-discovery-deck")).toContainText("Genre EP");
  await expect(page.getByTestId("public-discovery-deck")).toContainText("EP");
  await expect(page.getByTestId("public-discovery-deck")).not.toContainText("실제 EP");
  expect(requests.some((path) => path.startsWith("/api/music/records"))).toBe(false);
});
