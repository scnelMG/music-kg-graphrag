import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

function redactSameOriginRequests(requests: readonly string[]): readonly string[] {
  return requests.map((request) => {
    const url = new URL(request);
    return `${url.origin}${url.pathname}`;
  });
}

test("searches and saves an explicitly labelled fixture review without external requests", async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await expect(page.getByTestId("fixture-label")).toHaveText("fixture only");
  await page.getByRole("button", { name: "후보 찾기" }).click();
  await expect(page.getByText("Fixture Album", { exact: true })).toBeVisible();
  await page.getByLabel("검토 메모").fill("fixture 검토 기록");
  await page.getByRole("button", { name: "fixture에 저장" }).click();
  await expect(page.getByRole("status")).toContainText("외부 쓰기는 수행하지 않았습니다.");
  expect(requests.every((url) => url.startsWith("http://127.0.0.1:3100/"))).toBe(true);
  expect(requests.some((url) => /graphdb|musicbrainz|coverartarchive|openai/i.test(url))).toBe(false);
  await writeFile(testInfo.outputPath("same-origin-network-trace.redacted.json"), `${JSON.stringify({ requests: redactSameOriginRequests(requests) }, null, 2)}\n`);
});

test("keeps the form usable and reports a typed invalid rating", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "후보 찾기" }).click();
  await page.getByLabel("평점 (1–5)").fill("6");
  await page.getByLabel("검토 메모").fill("입력은 남아 있어야 합니다.");
  await page.getByRole("button", { name: "fixture에 저장" }).click();
  await expect(page.getByRole("status")).toContainText("평점은 1에서 5 사이의 정수여야 합니다.");
  await expect(page.getByLabel("검토 메모")).toHaveValue("입력은 남아 있어야 합니다.");
});

test("adapter-disabled mode renders a recoverable state without fixture candidates", async ({ page }) => {
  test.skip(process.env.FIXTURE_ADAPTER_MODE !== "disabled", "requires the deterministic disabled fixture-adapter mode");

  await page.goto("/");

  await expect(page.getByTestId("external-backend-unavailable")).toBeVisible();
  await expect(page.getByTestId("external-backend-unavailable")).toContainText("EXTERNAL_BACKEND_UNAVAILABLE");
  await expect(page.getByTestId("external-backend-unavailable")).toContainText("fixture 어댑터를 다시 활성화");
  await expect(page.getByText("Fixture Album", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "앨범 찾기" })).toHaveCount(0);
});
