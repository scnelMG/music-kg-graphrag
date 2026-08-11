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
  await page.route("**/api/fixture/candidates**", (route) => route.fulfill({ body: JSON.stringify({ candidates: [{ artist: "윤슬", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "밤의 기록" }], mode: "fixture" }), contentType: "application/json", status: 200 }));
  await page.route("**/api/fixture/candidates/*/evidence", (route) => route.fulfill({
    body: JSON.stringify({
      answer: "선택한 음반은 현재 기록과 이어져 있어요.",
      claims: [{ evidenceIds: ["fixture-evidence-001"], text: "선택한 음반과 이어지는 청취 단서입니다." }],
      records: [{ id: "fixture-evidence-001", subjectId: "fixture-album-001", summary: "선택한 음반과 이어지는 청취 단서입니다." }],
      selectionStatus: "FIXTURE_SELECTED",
      state: "ready"
    }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/fixture/recommendations", (route) => route.fulfill({
    body: JSON.stringify({
      policyVersion: "fixture-policy-v1",
      recommendation: {
        candidateId: "fixture-album-001",
        evidenceIds: ["fixture-evidence-001"],
        score: {
          diversity: 0.08,
          metadataRelevance: 0.176,
          novelty: 0.075,
          pathStrength: 0.23,
          personalEvidence: 0.3325
        },
        title: "잠든 세계의 밤",
        totalScore: 0.8935
      },
      reviewCandidateId: "fixture-album-001"
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

  await expect(page.getByRole("button", { name: "기록 저장" })).toBeDisabled();
  await expect(page.getByText("먼저 음반을 고르면, 여기에 내 기록을 남길 수 있어요.")).toBeVisible();
  await expect(page.getByTestId("insight-empty")).toHaveCount(1);
  await expect(page.getByText("프로비넌스")).toHaveCount(0);
  await expect(page.getByText("평가 메타데이터")).toHaveCount(0);

  await page.getByRole("button", { name: "음반 찾기" }).click();
  await expect(page.getByText("밤의 기록", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "기록 저장" })).toBeDisabled();
  await page.getByRole("button", { name: /밤의 기록/ }).click();

  await expect(page.getByRole("button", { name: "기록 저장" })).toBeEnabled();
  await expect(page.getByText("선택한 음반은 현재 기록과 이어져 있어요.", { exact: true })).toBeVisible();
  await expect(page.locator("details:not([open])").getByText("fixture-evidence-001", { exact: true })).toHaveCount(2);
  await expect(page.getByText("음반을 고르면 여기에서 이유를 읽을 수 있어요.")).toHaveCount(0);
});

test("puts the listener's flow before fixture and GraphRAG implementation details", async ({ page }) => {
  await mockConfiguredBff(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "내 음악 기록" })).toBeVisible();
  await expect(page.getByText("무슨 음악을 다시 듣고 싶은지, 한 장씩 기록해 보세요.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "추천과 근거" })).toBeVisible();
  await expect(page.getByText("PUBLIC_FIXTURE", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Evidence path", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Evidence synthesis", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Recommendation", { exact: true })).toHaveCount(0);
});

test("renders Korean-first configuration recovery", async ({ page }) => {
  await page.route("**/api/fixture/health", (route) => route.fulfill({ body: JSON.stringify({ code: "BACKEND_CONFIGURATION_ERROR", message: "The fixture backend is not configured.", retryable: false }), contentType: "application/json", status: 503 }));
  await page.goto("/");

  await expect(page.getByRole("status")).toContainText("백엔드 연결 설정이 완료되지 않았습니다.");
  await expect(page.getByRole("status")).not.toContainText("not configured");
  await expect(page.getByText("추천과 근거를 연결하려면 설정이 필요합니다.")).toHaveCount(1);
  await expect(page.getByText("조치 필요")).toBeVisible();
});

test("captures responsive Korean layouts without horizontal overflow", async ({ page }, testInfo) => {
  await mockConfiguredBff(page);
  for (const viewport of responsiveViewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto("/");
    await page.getByRole("button", { name: "음반 찾기" }).click();
    await page.getByRole("button", { name: /밤의 기록/ }).click();
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
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "음반 찾기" })).toBeFocused();
  await page.screenshot({ fullPage: true, path: await evidencePath(testInfo, "keyboard-focus.png") });
});
