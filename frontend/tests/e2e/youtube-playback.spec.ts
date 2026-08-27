import { expect, test } from "@playwright/test";

import { albumFixture, routeConnectedWorkspace, trackFixture } from "./connected-workspace-fixtures";

test("Given an owner verifies a YouTube candidate for a selected recording, when saving the record, then playback stays opt-in and the exact mapping is persisted", async ({ page }, testInfo) => {
  let savedPayload: unknown = null;
  await routeConnectedWorkspace(page);
  await page.route("**/api/music/youtube/candidates*", (route) => route.fulfill({
    body: JSON.stringify({ candidates: [{
      channelTitle: "Artist One Official",
      thumbnailUrl: "",
      title: "Artist One - Track One (Official Audio)",
      videoId: "dQw4w9WgXcQ"
    }] }),
    contentType: "application/json",
    status: 200
  }));
  await page.unroute("**/api/music/records");
  await page.route((url) => url.pathname === "/api/music/records", async (route) => {
    if (route.request().method() === "POST") {
      savedPayload = route.request().postDataJSON();
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: "2026-08-16T00:00:00.000Z", operation: "CREATED" }), contentType: "application/json", status: 201 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ nextCursor: null, records: [] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await page.locator(".edition-option").filter({ hasText: editionFixtureLabel }).click();
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption(trackFixture.recordingMbid);

  await page.getByRole("button", { name: "YouTube 후보 찾기" }).click();
  await expect(page.getByText("Artist One - Track One (Official Audio)", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "YouTube에서 확인" }).first()).toHaveAttribute("href", /dQw4w9WgXcQ/);
  await expect(page.locator("iframe[title='YouTube 미리 듣기']")).toHaveCount(0);

  await page.getByRole("button", { name: "영상 확인" }).click();
  await expect(page.getByText("이 영상이 1. Track One과 같은 곡인가요?")).toBeVisible();
  await expect(page.locator(".youtube-confirmation")).toHaveAttribute("aria-describedby", "youtube-confirmation-description");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("youtube-candidate-confirmation.png"), fullPage: true });
  await page.getByRole("button", { name: "확인하고 이 곡에 연결" }).click();
  await expect(page.getByText("선택한 영상은 저장 후에도 이 곡에만 연결됩니다.")).toBeVisible();
  await expect(page.locator("iframe[title='YouTube 미리 듣기']")).toHaveCount(0);

  await page.getByRole("button", { name: "미리 듣기" }).click();
  await expect(page.locator("iframe[title='YouTube 미리 듣기']")).toHaveAttribute("src", /dQw4w9WgXcQ/);
  await page.screenshot({ path: testInfo.outputPath("youtube-confirmed-playback.png"), fullPage: true });

  await page.getByRole("button", { name: "Notion에 기록 저장" }).click();
  await page.getByRole("button", { name: "Notion에 저장하기" }).click();
  expect(savedPayload).toMatchObject({
    youtubeChannelTitle: "Artist One Official",
    youtubeRecordingMbid: trackFixture.recordingMbid,
    youtubeVideoId: "dQw4w9WgXcQ",
    youtubeVideoTitle: "Artist One - Track One (Official Audio)"
  });
});

test("Given two tracks with the same title, when the owner chooses the second track and confirms a YouTube video, then only that recording MBID is searched and saved", async ({ page }) => {
  let requestedRecordingMbid = "";
  let savedPayload: unknown = null;
  await routeConnectedWorkspace(page, {
    tracks: [
      { position: 1, recordingMbid: "recording-a", title: "Same Title" },
      { position: 2, recordingMbid: "recording-b", title: "Same Title" }
    ]
  });
  await page.route("**/api/music/youtube/candidates*", (route) => {
    requestedRecordingMbid = new URL(route.request().url()).searchParams.get("recordingMbid") ?? "";
    return route.fulfill({ body: JSON.stringify({ candidates: [{
      channelTitle: "Artist One Official",
      thumbnailUrl: "",
      title: "Artist One - Same Title (Official Audio)",
      videoId: "dQw4w9WgXcQ"
    }] }), contentType: "application/json", status: 200 });
  });
  await page.unroute("**/api/music/records");
  await page.route((url) => url.pathname === "/api/music/records", async (route) => {
    if (route.request().method() === "POST") {
      savedPayload = route.request().postDataJSON();
      await route.fulfill({ body: JSON.stringify({ notionLastEditedAt: "2026-08-16T00:00:00.000Z", operation: "CREATED" }), contentType: "application/json", status: 201 });
      return;
    }
    await route.fulfill({ body: JSON.stringify({ nextCursor: null, records: [] }), contentType: "application/json", status: 200 });
  });

  await page.goto("/owner/workspace");
  await page.locator("#album-search").fill(albumFixture.title);
  await page.locator("form.search-row button").click();
  await page.locator(".candidate-row").filter({ hasText: albumFixture.title }).click();
  await page.locator(".edition-option").filter({ hasText: editionFixtureLabel }).click();
  await page.locator("#sentiment").selectOption("Loved");
  await page.locator("#favourite-track-select").selectOption("recording-b");
  await page.getByRole("button", { name: "YouTube 후보 찾기" }).click();
  await expect.poll(() => requestedRecordingMbid).toBe("recording-b");
  await page.getByRole("button", { name: "영상 확인" }).click();
  await page.getByRole("button", { name: "확인하고 이 곡에 연결" }).click();
  await page.getByRole("button", { name: "Notion에 기록 저장" }).click();
  await page.getByRole("button", { name: "Notion에 저장하기" }).click();

  expect(savedPayload).toMatchObject({ youtubeRecordingMbid: "recording-b" });
});

const editionFixtureLabel = "2024-01-01";
