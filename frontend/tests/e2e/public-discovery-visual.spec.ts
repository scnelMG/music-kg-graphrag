import { expect, test, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

const factualCoverUrl = "https://coverartarchive.org/release-group/4b19cdd4-9f1a-4387-b5bd-d1367e0bb1ef/front-250";
const nextFactualCoverUrl = "https://coverartarchive.org/release/bee5e0cd-1767-4a8e-9578-6455e87ba60b/front-250";

async function evidencePath(testInfo: TestInfo, name: string): Promise<string> {
  const configuredDirectory = process.env.TASK12_UI_EVIDENCE_DIR;
  if (configuredDirectory === undefined) return testInfo.outputPath(name);
  const directory = resolve(process.cwd(), configuredDirectory);
  await mkdir(directory, { recursive: true });
  return resolve(directory, name);
}

async function routePublicDiscovery(page: Parameters<typeof routeConnectedWorkspace>[0], recommendations: readonly object[]): Promise<void> {
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.unroute("**/api/music/insights*");
  await page.route("**/api/owner/session", (route) => route.fulfill({
    body: JSON.stringify({ owner: false }), contentType: "application/json", status: 200
  }));
  await page.route("**/api/music/insights*", (route) => route.fulfill({
    body: JSON.stringify({ graphTaste: { relisten: [], recommendations } }), contentType: "application/json", status: 200
  }));
}

test("captures the public discovery deck, liked state, recovery, focus, and reduced-motion states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Captures each public visual state once.");
  await routePublicDiscovery(page, [
    { artist: "김사월", artistCredits: ["김사월"], coverUrl: factualCoverUrl, firstReleaseDate: "2020-09-14", primaryType: "EP", publicCurationReason: "shared-tag", releaseGroupMbid: "public-heaven", sharedMusicBrainzTag: "dream pop", title: "헤븐 (Heaven)" },
    { artist: "Miles Davis", artistCredits: ["Miles Davis"], coverUrl: nextFactualCoverUrl, firstReleaseDate: "1959-08-17", primaryType: "Album", publicCurationReason: "same-artist", releaseGroupMbid: "8e8a594f-2175-38c7-a871-abb68ec363e7", title: "Kind of Blue" }
  ]);

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("public-discovery-deck")).not.toContainText("실제 앨범");
    await expect(page.locator(".discovery-card img")).toHaveAttribute("src", factualCoverUrl);
    await expect(page.locator(".discovery-next-preview img")).toHaveAttribute("src", nextFactualCoverUrl);
    await expect.poll(() => page.locator(".discovery-next-preview img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.locator("body")).toHaveCSS("font-family", /Malgun Gothic/);
    await expect.poll(() => page.evaluate(() => Array.from(document.fonts).some((font) => font.family === "Noto Serif KR Variable" && font.status === "loaded"))).toBe(true);
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, `public-deck-${viewport.width}.png`) });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect.poll(() => page.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-dark-375.png") });

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const deck = page.getByTestId("public-discovery-deck");
  await expect.poll(() => deck.locator(".discovery-card img").evaluate((image: HTMLImageElement) => image.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-rest-375.png") });
  await deck.focus();
  await expect(deck).toBeFocused();
  await expect(deck).toHaveCSS("outline-width", "3px");
  await page.screenshot({ path: await evidencePath(testInfo, "public-deck-focus-375.png") });
  await page.clock.install();
  await page.keyboard.press("ArrowRight");
  await expect(deck.locator(".deck-skip")).toBeDisabled();
  await expect(deck.locator(".deck-like")).toBeDisabled();
  await page.clock.runFor(100);
  await expect(deck.locator(".discovery-card")).toHaveCount(2);
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-mid-375.png") });
  await page.clock.runFor(100);
  await expect(deck.locator(".discovery-card")).toHaveCount(1);
  await expect(deck.locator(".deck-skip")).toBeEnabled();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-settled-375.png") });
  await expect(page.getByTestId("public-liked-list")).toContainText("헤븐 (Heaven)");
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-liked-375.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reducedDeck = page.getByTestId("public-discovery-deck");
  await expect(reducedDeck.locator(".discovery-card")).toHaveCSS("transition-duration", "1e-05s");
  await reducedDeck.focus();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-deck-reduced-motion-375.png") });
});

test("captures the public empty-curation recovery and Korean consonant guidance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Captures each public visual state once.");
  await routePublicDiscovery(page, []);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator(".genre-collection")).toBeVisible();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-empty-genre-375.png") });
  await page.locator("#album-search").fill("ㅇㄴㄹ");
  await page.locator("form.search-row button").click();
  await expect(page.locator(".result-region")).toContainText("초성 검색은 지원하지 않아요");
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "public-jamo-guidance-375.png") });
});
