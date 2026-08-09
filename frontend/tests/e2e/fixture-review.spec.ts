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
  const appOrigin = new URL(page.url()).origin;
  await expect(page.getByRole("button", { name: "fixture에 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "후보 찾기" }).click();
  await expect(page.getByText("Fixture Album", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Fixture Album/ }).click();
  await expect(page.getByText("Fixture evidence answer", { exact: true })).toBeVisible();
  await expect(page.getByText("fixture-evidence-001", { exact: true })).toHaveCount(1);
  await expect(page.locator(".source-line").filter({ hasText: "fixture-evidence-001" })).toBeVisible();
  await page.locator("#review").fill("fixture 검토 기록");
  await page.getByRole("button", { name: "fixture에 저장" }).click();
  await expect(page.getByRole("status")).toContainText("외부 쓰기는 수행하지 않았습니다.");
  await expect(page.getByTestId("save-confirmation")).toContainText("fixture-review-001");
  await expect(page.getByTestId("save-confirmation")).toContainText("SAVED_IN_FIXTURE_MODE");
  expect(requests.every((url) => url.startsWith(`${appOrigin}/`))).toBe(true);
  expect(requests.some((url) => /graphdb|musicbrainz|coverartarchive|openai/i.test(url))).toBe(false);
  await writeFile(testInfo.outputPath("same-origin-network-trace.redacted.json"), `${JSON.stringify({ requests: redactSameOriginRequests(requests) }, null, 2)}\n`);
});

test("keeps the currently selected candidate's evidence when an earlier request finishes last", async ({ page }, testInfo) => {
  let releaseFirstEvidence: (() => void) | undefined;
  const firstEvidence = new Promise<void>((resolve) => {
    releaseFirstEvidence = resolve;
  });

  // Given two candidates with an intentionally delayed first evidence response
  await page.route("**/api/fixture/health", (route) => route.fulfill({
    body: JSON.stringify({ mode: "fixture", status: "ok" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route((url) => url.pathname === "/api/fixture/candidates", (route) => route.fulfill({
    body: JSON.stringify({
      candidates: [
        { artist: "Artist A", id: "candidate-a", source: "PUBLIC_FIXTURE", title: "Candidate A" },
        { artist: "Artist B", id: "candidate-b", source: "PUBLIC_FIXTURE", title: "Candidate B" }
      ],
      mode: "fixture"
    }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/fixture/candidates/*/evidence", async (route) => {
    const candidateId = route.request().url().split("/").at(-2);
    if (candidateId === "candidate-a") await firstEvidence;
    await route.fulfill({
      body: JSON.stringify({
        answer: `Evidence for ${candidateId}`,
        claims: [{ evidenceIds: [`evidence-${candidateId}`], text: `Claim for ${candidateId}` }],
        records: [{ id: `evidence-${candidateId}`, subjectId: candidateId, summary: `Claim for ${candidateId}` }],
        selectionStatus: "FIXTURE_SELECTED",
        state: "ready"
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await page.goto("/");
  await page.locator(".search-row button").click();
  await page.getByRole("button", { name: /Candidate A/ }).click();

  // When the user selects B before A's delayed evidence response completes
  await page.getByRole("button", { name: /Candidate B/ }).click();
  await expect(page.getByRole("button", { name: /Candidate B/ })).toHaveAttribute("aria-pressed", "true");
  releaseFirstEvidence?.();

  // Then A's late result cannot overwrite evidence that belongs to the visible B selection
  await expect(page.getByText("Evidence for candidate-b", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidence for candidate-a", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("out-of-order-evidence-fixed.png"), fullPage: true });
});

test("keeps the form usable and reports a typed invalid rating", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "후보 찾기" }).click();
  await page.getByRole("button", { name: /Fixture Album/ }).click();
  await page.getByLabel("평점 (1–5)").fill("6");
  await page.getByLabel("검토 메모").fill("입력은 남아 있어야 합니다.");
  await page.getByRole("button", { name: "fixture에 저장" }).click();
  await expect(page.getByRole("status")).toContainText("평점은 1에서 5 사이의 정수여야 합니다.");
  await expect(page.getByLabel("검토 메모")).toHaveValue("입력은 남아 있어야 합니다.");
});

test("shows the backend-confirmed fixture review identifier after saving", async ({ page }) => {
  // Given a selected fixture candidate and a valid review
  await page.goto("/");
  await page.getByRole("button", { name: "후보 찾기" }).click();
  await expect(page.getByText("Fixture Album", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Fixture Album/ }).click();
  await page.locator("#review").fill("fixture 저장 확인");

  // When the review is saved through the real BFF and fixture backend
  await page.getByRole("button", { name: "fixture에 저장" }).click();

  // Then the returned identifier and typed status are observable in the UI
  await expect(page.getByTestId("save-confirmation")).toContainText("fixture-review-001");
  await expect(page.getByTestId("save-confirmation")).toContainText("SAVED_IN_FIXTURE_MODE");
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
