import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const responsiveViewports = [
  { height: 900, name: "home-375.png", width: 375 },
  { height: 900, name: "home-768.png", width: 768 },
  { height: 900, name: "home-1280.png", width: 1280 }
] as const;

async function mockConfiguredBff(page: Page): Promise<void> {
  await page.route("**/api/fixture/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "fixture", status: "ok" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/fixture/candidates**", (route) => route.fulfill({ body: JSON.stringify({ candidates: [{ artist: "Fixture Artist", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "Fixture Album" }], mode: "fixture" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/fixture/candidates/*/evidence", (route) => route.fulfill({
    body: JSON.stringify({
      answer: "Fixture evidence answer",
      claims: [{ evidenceIds: ["fixture-evidence-001"], text: "Fixture evidence only" }],
      records: [{ id: "fixture-evidence-001", subjectId: "fixture-album-001", summary: "Fixture evidence only" }],
      selectionStatus: "FIXTURE_SELECTED",
      state: "ready"
    }),
    contentType: "application/json",
    status: 200
  }));
}

async function evidencePath(testInfo: TestInfo, name: string): Promise<string> {
  const configuredDirectory = process.env.TASK12_UI_EVIDENCE_DIR;
  if (configuredDirectory === undefined) return testInfo.outputPath(name);
  const directory = resolve(process.cwd(), configuredDirectory);
  await mkdir(directory, { recursive: true });
  return resolve(directory, name);
}

test("requires explicit selection and renders only typed supplied evidence", async ({ page }) => {
  await mockConfiguredBff(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "fixture에 저장" })).toBeDisabled();
  await expect(page.getByText("저장하려면 검색 결과에서 후보를 먼저 선택해 주세요.")).toBeVisible();
  await expect(page.getByText("연결된 근거가 없습니다.")).toHaveCount(2);
  await expect(page.getByText("프로비넌스")).toHaveCount(0);
  await expect(page.getByText("평가 메타데이터")).toHaveCount(0);

  await page.getByRole("button", { name: "후보 찾기" }).click();
  await expect(page.getByText("Fixture Album", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "fixture에 저장" })).toBeDisabled();
  await page.getByRole("button", { name: /Fixture Album/ }).click();

  await expect(page.getByRole("button", { name: "fixture에 저장" })).toBeEnabled();
  await expect(page.getByText("Fixture evidence answer", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture-evidence-001", { exact: true })).toHaveCount(1);
  await expect(page.getByText("근거가 연결되기 전에는 답변을 만들지 않습니다.")).toHaveCount(0);
});

test("renders Korean-first configuration recovery", async ({ page }) => {
  await page.route("**/api/fixture/health", (route) => route.fulfill({ body: JSON.stringify({ code: "BACKEND_CONFIGURATION_ERROR", message: "The fixture backend is not configured.", retryable: false }), contentType: "application/json", status: 503 }));
  await page.goto("/");

  await expect(page.getByRole("status")).toContainText("백엔드 연결 설정이 완료되지 않았습니다.");
  await expect(page.getByRole("status")).not.toContainText("not configured");
  await expect(page.getByText("근거 서비스 설정이 필요합니다.")).toHaveCount(2);
  await expect(page.getByText("조치 필요")).toBeVisible();
});

test("captures responsive Korean layouts without horizontal overflow", async ({ page }, testInfo) => {
  await mockConfiguredBff(page);
  for (const viewport of responsiveViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/");
    await page.getByRole("button", { name: "후보 찾기" }).click();
    await page.getByRole("button", { name: /Fixture Album/ }).click();
    const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, viewport.name) });
  }

  await page.setViewportSize({ height: 900, width: 640 });
  await page.goto("/");
  const zoomDimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(zoomDimensions.scrollWidth).toBeLessThanOrEqual(zoomDimensions.clientWidth);
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "home-200-percent-zoom-equivalent.png") });
});

test("shows keyboard focus on task navigation", async ({ page }, testInfo) => {
  await mockConfiguredBff(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "1. 후보 검색" })).toBeFocused();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "keyboard-focus.png") });
});
