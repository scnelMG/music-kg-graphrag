import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test("shows neutral search progress and prioritizes visible catalog cover art", async ({ page }, testInfo) => {
  await routeConnectedWorkspace(page);
  let releaseSearch: (() => void) | undefined;
  const searchResponse = new Promise<void>((resolve) => { releaseSearch = resolve; });
  let releaseCoverFailures: (() => void) | undefined;
  const coverFailures = new Promise<void>((resolve) => { releaseCoverFailures = resolve; });
  const coverRequests: string[] = [];
  await page.route("**/api/music/albums?*", async (route) => {
    await searchResponse;
    await route.fulfill({
      body: JSON.stringify({ albums: [{
        artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"], coverUrl: "",
        firstReleaseDate: "2020-01-01", primaryType: "Album", releaseGroupMbid: "missing-cover-one", searchScore: 100, title: "모기"
      }, {
        artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"], coverUrl: "",
        firstReleaseDate: "2020-01-01", primaryType: "EP", releaseGroupMbid: "missing-cover-two", searchScore: 99, title: "파편"
      }, ...["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"].map((releaseGroupMbid, index) => ({
        artist: "극동아시아타이거즈", artistCredits: ["극동아시아타이거즈"], coverUrl: `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-250`,
        firstReleaseDate: "2020-01-01", primaryType: "Album" as const, releaseGroupMbid, searchScore: 98 - index, title: `표지 앨범 ${index + 1}`
      }))] }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("https://coverartarchive.org/**", async (route) => {
    coverRequests.push(route.request().url());
    await coverFailures;
    await route.abort("failed");
  });

  await page.goto("/");
  const requested = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/music/albums");
  await page.locator("#album-search").fill("극동");
  await page.locator("form.search-row button").click();
  await requested;

  await expect(page.getByText("음반을 찾고 있습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText(/MusicBrainz를 조회/)).toHaveCount(0);
  if (releaseSearch === undefined) throw new Error("Expected delayed catalog response");
  releaseSearch();

  await expect(page.getByText("앨범", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Album", { exact: true })).toHaveCount(0);
  const covers = page.locator(".candidate-row img");
  await expect(covers).toHaveCount(4);
  await expect(covers.first()).toHaveAttribute("src", "https://coverartarchive.org/release-group/00000000-0000-4000-8000-000000000001/front-250");
  for (const cover of [covers.nth(0), covers.nth(1), covers.nth(2)]) {
    await expect(cover).not.toHaveAttribute("loading", "lazy");
    await expect(cover).toHaveAttribute("fetchpriority", "high");
  }
  await expect(covers.nth(3)).toHaveAttribute("loading", "lazy");
  await expect.poll(() => coverRequests.length).toBeGreaterThanOrEqual(1);
  expect(coverRequests[0]).toBe("https://coverartarchive.org/release-group/00000000-0000-4000-8000-000000000001/front-250");
  if (releaseCoverFailures === undefined) throw new Error("Expected a direct Cover Art Archive request");
  releaseCoverFailures();
  await expect(page.getByLabel("표지 앨범 1 표지 정보 없음")).toBeVisible();
  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ path: testInfo.outputPath(`catalog-search-${viewport.width}.png`), fullPage: true });
  }
});
