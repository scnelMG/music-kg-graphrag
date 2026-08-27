import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test("Given a duplicate exists after the first twelve records, when its album is selected, then the authoritative values are prefilled", async ({ page }) => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    albumTitle: `Earlier album ${index + 1}`,
    artist: "Earlier artist",
    artistCredits: ["Earlier artist"],
    coverUrl: "",
    favouriteTrack: `Earlier track ${index + 1}`,
    lastEditedAt: "2026-08-10T00:00:00.000Z",
    owned: false,
    recordHandle: `earlier-${index + 1}`,
    releaseGroupMbid: `earlier-group-${index + 1}`,
    releaseMbid: `earlier-release-${index + 1}`,
    sentiment: "Reflective"
  }));
  records.push({
    albumTitle: "Album One",
    artist: "Artist One",
    artistCredits: ["Artist One"],
    coverUrl: "",
    favouriteTrack: "Track One",
    lastEditedAt: "2026-08-11T00:00:00.000Z",
    owned: true,
    recordHandle: "record-13",
    releaseGroupMbid: "release-group-one",
    releaseMbid: "release-one",
    sentiment: "Loved"
  });
  await routeConnectedWorkspace(page, { records });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill("Album One");
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: "Album One" }).click();

  await expect(page.locator("#sentiment")).toHaveValue("Loved");
  await expect(page.locator("#favourite-track-select")).toHaveValue("track-one");
  await expect(page.locator("#owned")).toBeChecked();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
});

test("Given an older lookup is slow, when another album is selected, then the stale response cannot replace it", async ({ page }) => {
  let releaseOlderLookup = (): void => undefined;
  let markOlderLookupStarted = (): void => undefined;
  const olderLookupGate = new Promise<void>((resolve) => { releaseOlderLookup = resolve; });
  const olderLookupStarted = new Promise<void>((resolve) => { markOlderLookupStarted = resolve; });
  const albums = [
    {
      artist: "Artist One", artistCredits: ["Artist One"], coverUrl: "", firstReleaseDate: "2024-01-01",
      primaryType: "Album" as const, releaseGroupMbid: "release-group-one", searchScore: 100, title: "Album One"
    },
    {
      artist: "Artist Two", artistCredits: ["Artist Two"], coverUrl: "", firstReleaseDate: "2025-01-01",
      primaryType: "EP" as const, releaseGroupMbid: "release-group-two", searchScore: 99, title: "Album Two"
    }
  ];
  await routeConnectedWorkspace(page, { albums });
  await page.route("**/api/music/records/by-release-group/**", async (route) => {
    const releaseGroup = new URL(route.request().url()).pathname.split("/").at(-1);
    if (releaseGroup === "release-group-one") {
      markOlderLookupStarted();
      await olderLookupGate;
      await route.fulfill({ body: JSON.stringify({ record: {
        albumTitle: "Album One", artist: "Artist One", artistCredits: ["Artist One"], coverUrl: "",
        favouriteTrack: "Track One", lastEditedAt: "2026-08-10T00:00:00.000Z", owned: true,
        recordHandle: "record-one", releaseGroupMbid: "release-group-one", releaseMbid: "release-one", sentiment: "Loved"
      } }), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ record: {
      albumTitle: "Album Two", artist: "Artist Two", artistCredits: ["Artist Two"], coverUrl: "",
      favouriteTrack: "Other track", lastEditedAt: "2026-08-11T00:00:00.000Z", owned: false,
      recordHandle: "record-two", releaseGroupMbid: "release-group-two", releaseMbid: "release-two", sentiment: "Reflective"
    } }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill("Album");
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: "Album One" }).click();
  await olderLookupStarted;
  await page.locator(".candidate-row").filter({ hasText: "Album Two" }).click();
  await expect(page.locator("#sentiment")).toHaveValue("Reflective");

  releaseOlderLookup();
  await expect(page.locator(".candidate-row").filter({ hasText: "Album Two" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sentiment")).toHaveValue("Reflective");
});

test("Given owner access and records are unresolved, when an album is found, then selection waits for the authoritative record", async ({ page }) => {
  const existingRecord = {
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
  };
  let releaseOwnerSession = (): void => undefined;
  let releaseRecords = (): void => undefined;
  const ownerSessionGate = new Promise<void>((resolve) => {
    releaseOwnerSession = resolve;
  });
  const recordsGate = new Promise<void>((resolve) => {
    releaseRecords = resolve;
  });
  await routeConnectedWorkspace(page, { records: [existingRecord] });
  await page.unroute("**/api/owner/session");
  await page.unroute("**/api/music/records");
  await page.route("**/api/owner/session", async (route) => {
    await ownerSessionGate;
    await route.fulfill({ body: JSON.stringify({ owner: true }), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/music/records", async (route) => {
    await recordsGate;
    await route.fulfill({
      body: JSON.stringify({
        nextCursor: null,
        records: [existingRecord]
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill("Album One");
  await page.locator("form.search-row button").click();
  const candidate = page.locator(".candidate-row").filter({ hasText: "Album One" });
  await expect(candidate).toBeDisabled();

  releaseOwnerSession();
  await expect(candidate).toBeDisabled();
  releaseRecords();
  await expect(candidate).toBeEnabled();
  await candidate.click();

  await expect(page.locator("#sentiment")).toHaveValue("Loved");
  await expect(page.locator("#favourite-track-select")).toHaveValue("track-one");
  await expect(page.locator("#owned")).toBeChecked();
  await expect(page.locator(".save-button")).toContainText("Notion 기록 갱신");
});
