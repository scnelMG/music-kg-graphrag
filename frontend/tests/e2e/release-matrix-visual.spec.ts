import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { albumFixture, routeConnectedWorkspace, routeDeterministicCoverArt } from "./connected-workspace-fixtures";

const evidenceDirectory = process.env.RELEASE_MATRIX_EVIDENCE_DIR;
const firstCoverUrl = "https://coverartarchive.org/release-group/4b19cdd4-9f1a-4387-b5bd-d1367e0bb1ef/front-250";
const nextCoverUrl = "https://coverartarchive.org/release/bee5e0cd-1767-4a8e-9578-6455e87ba60b/front-250";
const factualAlbum = { ...albumFixture, coverUrl: firstCoverUrl };
const existingRecord = {
  albumTitle: albumFixture.title,
  artist: albumFixture.artist,
  artistCredits: albumFixture.artistCredits,
  coverUrl: firstCoverUrl,
  favouriteTrack: "Track One",
  lastEditedAt: "2026-08-12T00:00:00.000Z",
  owned: true,
  recordHandle: "notion-record-one",
  releaseGroupMbid: albumFixture.releaseGroupMbid,
  releaseMbid: "release-one",
  sentiment: "Loved"
} as const;
const viewports = [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }] as const;
const colorSchemes = ["light", "dark"] as const;
const requestedMatrixWidth = Number(process.env.RELEASE_MATRIX_WIDTH ?? "0");
const matrixViewports = requestedMatrixWidth === 0 ? viewports : viewports.filter((viewport) => viewport.width === requestedMatrixWidth);
const requestedColorScheme = process.env.RELEASE_MATRIX_COLOR;
const matrixColorSchemes = requestedColorScheme === "light" || requestedColorScheme === "dark" ? [requestedColorScheme] as const : colorSchemes;

type InsightMode = "empty" | "error" | "loading" | "ready";

const recommendations = [
  { artist: "김사월", artistCredits: ["김사월"], coverUrl: firstCoverUrl, firstReleaseDate: "2020-09-14", primaryType: "EP", publicCurationReason: "shared-tag", releaseGroupMbid: "public-heaven", sharedMusicBrainzTag: "dream pop", title: "헤븐 (Heaven)" },
  { artist: "Miles Davis", artistCredits: ["Miles Davis"], coverUrl: nextCoverUrl, firstReleaseDate: "1959-08-17", primaryType: "Album", publicCurationReason: "same-artist", releaseGroupMbid: "8e8a594f-2175-38c7-a871-abb68ec363e7", title: "Kind of Blue" }
] as const;

function evidencePath(fileName: string): string {
  return join(evidenceDirectory ?? ".release-matrix-evidence", fileName);
}

async function capture(page: Page, fileName: string): Promise<void> {
  if (evidenceDirectory !== undefined) await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ fullPage: true, path: evidencePath(fileName) });
}

async function waitForFirstLoadedImage(page: Page, selector: string): Promise<void> {
  const image = page.locator(selector).first();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
}

async function configurePublicRoutes(page: Page): Promise<{ setInsightMode: (mode: InsightMode) => void }> {
  let insightMode: InsightMode = "ready";
  await routeConnectedWorkspace(page, { albums: [factualAlbum] });
  await routeDeterministicCoverArt(page);
  await page.unroute("**/api/music/insights*");
  await page.route("**/api/music/insights*", async (route) => {
    if (insightMode === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (insightMode === "error") {
      await route.fulfill({ body: JSON.stringify({ code: "BACKEND_UNAVAILABLE", message: "연결이 지연되고 있습니다." }), contentType: "application/json", status: 503 });
      return;
    }
    const currentRecommendations = insightMode === "empty" ? [] : recommendations;
    await route.fulfill({ body: JSON.stringify({ graphTaste: { recommendations: currentRecommendations, relisten: [] } }), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/music/catalog/explore?genre=*", (route) => route.fulfill({
    body: JSON.stringify({ albums: [factualAlbum] }),
    contentType: "application/json",
    status: 200
  }));
  return { setInsightMode: (mode) => { insightMode = mode; } };
}

test("captures the complete public responsive state matrix and technical receipts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures canonical matrices once");
  test.setTimeout(360_000);
  const consoleMessages: Array<{ text: string; type: string }> = [];
  const responses: Array<{ path: string; status: number }> = [];
  page.on("console", (message) => consoleMessages.push({ text: message.text(), type: message.type() }));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname === "127.0.0.1") responses.push({ path: url.pathname, status: response.status() });
  });
  const routes = await configurePublicRoutes(page);
  await page.clock.install();

  for (const colorScheme of matrixColorSchemes) {
    for (const viewport of matrixViewports) {
      const suffix = `${colorScheme}-${viewport.width}`;
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });

      routes.setInsightMode("loading");
      await page.goto("/");
      await expect(page.locator(".public-discovery-skeleton")).toBeVisible();
      await capture(page, `matrix-public-loading-${suffix}.png`);

      routes.setInsightMode("error");
      await page.goto("/");
      await expect(page.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
      await capture(page, `matrix-public-error-${suffix}.png`);

      routes.setInsightMode("ready");
      await page.goto("/");
      const deck = page.getByTestId("public-discovery-deck");
      await expect.poll(() => deck.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      await capture(page, `matrix-public-rest-${suffix}.png`);
      const browserTime = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(browserTime + 1_000);
      await deck.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(deck.locator(".deck-skip")).toBeDisabled();
      await expect(deck.locator(".discovery-card")).toHaveCount(2);
      await page.clock.runFor(90);
      const enteringOpacity = Number(await deck.locator(".discovery-card-current .album-art").evaluate((element) => getComputedStyle(element).opacity));
      expect(enteringOpacity).toBeGreaterThan(0.62);
      expect(enteringOpacity).toBeLessThan(1);
      await capture(page, `matrix-public-mid-${suffix}.png`);
      await page.clock.runFor(200);
      await expect(deck.locator(".deck-skip")).toBeEnabled();
      await expect(deck.locator(".discovery-card")).toHaveCount(1);
      await expect(deck.locator(".discovery-card-current .album-art")).toHaveCSS("opacity", "1");
      await expect.poll(() => deck.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      await capture(page, `matrix-public-settled-${suffix}.png`);
      await page.clock.resume();

      await page.goto("/");
      await page.getByTestId("public-discovery-deck").getByRole("button", { name: "좋아요" }).click();
      await page.clock.runFor(200);
      await expect(page.getByTestId("public-liked-list")).toBeVisible();
      await capture(page, `matrix-public-liked-${suffix}.png`);
      await page.clock.resume();
      await page.evaluate(() => localStorage.clear());

      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      const reducedDeck = page.getByTestId("public-discovery-deck");
      await expect.poll(() => reducedDeck.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      await reducedDeck.focus();
      await page.keyboard.press("ArrowLeft");
      await capture(page, `matrix-public-reduced-${suffix}.png`);
      await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });

      routes.setInsightMode("empty");
      await page.goto("/");
      await expect(page.locator(".genre-collection")).toBeVisible();
      await capture(page, `matrix-public-empty-${suffix}.png`);
      for (const genre of ["드림 팝", "인디 록", "포크", "전자음악"] as const) {
        await page.getByRole("button", { name: genre }).click();
        await expect(page.getByTestId("public-discovery-deck")).toBeVisible();
        await capture(page, `matrix-public-genre-${genre.replace(" ", "-")}-${suffix}.png`);
        await page.goto("/");
      }

      await page.locator("#album-search").fill("ㅇㄴㄹ");
      await page.locator("form.search-row button").click();
      await expect(page.locator(".result-region")).toContainText("초성 검색은 지원하지 않아요");
      await capture(page, `matrix-public-jamo-${suffix}.png`);

      await page.locator("#album-search").fill("가".repeat(201));
      await page.locator("form.search-row button").click();
      await expect(page.locator(".result-region")).toContainText("200자 이하");
      await capture(page, `matrix-public-long-${suffix}.png`);

      await page.locator("#album-search").fill(albumFixture.title);
      await page.locator("form.search-row button").click();
      await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
      await expect(page.locator(".catalog-album-detail")).toBeVisible();
      await waitForFirstLoadedImage(page, ".catalog-album-detail img");
      await capture(page, `matrix-public-selected-${suffix}.png`);
    }
  }

  await page.setViewportSize({ width: 640, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto("/method");
  const zoomDimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(zoomDimensions.scrollWidth).toBeLessThanOrEqual(zoomDimensions.clientWidth);
  const cdp = await page.context().newCDPSession(page);
  const accessibilityTree = await cdp.send("Accessibility.getFullAXTree");
  const accessibilitySummary = accessibilityTree.nodes.flatMap((node) => {
    const role = node.role?.value;
    const name = node.name?.value;
    return typeof role === "string" && typeof name === "string" && name.length > 0 ? [{ name, role }] : [];
  });
  expect(accessibilitySummary.some((node) => node.role === "heading" && node.name === "추천이 만들어지는 방식")).toBe(true);
  const expectedConsoleErrors = consoleMessages.filter((message) => message.type === "error" && message.text.includes("status of 503"));
  const unexpectedConsoleErrors = consoleMessages.filter((message) => message.type === "error" && !message.text.includes("status of 503"));
  expect(unexpectedConsoleErrors).toEqual([]);
  const unexpectedResponses = responses.filter((response) => response.status >= 500 && response.path !== "/api/music/insights");
  expect(unexpectedResponses).toEqual([]);
  if (evidenceDirectory !== undefined) {
    await writeFile(evidencePath("release-technical-receipt.json"), JSON.stringify({ accessibilitySummary, consoleMessages, expectedConsoleErrors, responses, unexpectedConsoleErrors, zoom200PercentEquivalent: zoomDimensions }, null, 2));
  }
});

test("captures owner denial and connected task states across themes and widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures canonical matrices once");
  test.setTimeout(600_000);
  let owner = true;
  await routeConnectedWorkspace(page, { albums: [factualAlbum], records: [existingRecord] });
  await routeDeterministicCoverArt(page);
  await page.unroute("**/api/owner/session");
  await page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner }), contentType: "application/json", status: 200 }));

  for (const colorScheme of matrixColorSchemes) {
    await page.emulateMedia({ colorScheme });
    for (const viewport of matrixViewports) {
      const suffix = `${colorScheme}-${viewport.width}`;
      await page.setViewportSize(viewport);
      owner = false;
      await page.goto("/owner/workspace");
      await expect(page.locator(".access-denied")).toBeVisible();
      await capture(page, `matrix-owner-denial-${suffix}.png`);

      owner = true;
      await page.goto("/owner/workspace");
      await expect(page.locator(".owner-workspace")).toBeVisible();
      await waitForFirstLoadedImage(page, 'img[alt="Album One 앨범 커버"]');
      await capture(page, `matrix-owner-connected-${suffix}.png`);
      await page.locator("#album-search").fill(albumFixture.title);
      await page.locator("form.search-row button").click();
      await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
      await expect(page.locator(".selected-record")).toBeVisible();
      await waitForFirstLoadedImage(page, 'img[alt="Album One 앨범 커버"]');
      await capture(page, `matrix-owner-selected-${suffix}.png`);
      await page.locator(".edition-option").first().click();
      await page.locator("#sentiment").selectOption("Loved");
      await page.locator("#favourite-track-select").selectOption("track-one");
      await page.getByRole("button", { name: /Notion (기록 갱신|에 기록)/ }).click();
      await expect(page.locator(".save-confirmation")).toBeVisible();
      await capture(page, `matrix-owner-save-${suffix}.png`);
      await page.getByRole("button", { name: "저장하지 않기" }).click();
      await page.getByRole("button", { name: "Notion에서 보관" }).click();
      await expect(page.locator(".archive-confirmation")).toBeVisible();
      await capture(page, `matrix-owner-archive-${suffix}.png`);
    }
  }
});
