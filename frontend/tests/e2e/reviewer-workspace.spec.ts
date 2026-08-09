import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

type RequestTrace = {
  readonly method: string;
  readonly pathname: string;
};

function traceFor(requests: readonly RequestTrace[]): string {
  return `${JSON.stringify({ requests }, null, 2)}\n`;
}

test("Given a fixture candidate, when a reviewer selects and saves it, then recommendation, evidence, and GraphRAG answer remain visible", async ({ page }, testInfo) => {
  const requests: RequestTrace[] = [];
  const appOrigin = new URL(testInfo.project.use.baseURL ?? "http://127.0.0.1").origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === appOrigin) requests.push({ method: request.method(), pathname: url.pathname });
  });

  // Given the real local Spring fixture API and Next BFF are running
  await page.goto("/");
  await expect(page.getByTestId("fixture-label")).toHaveText("fixture only");

  // When the reviewer searches, selects the fixture candidate, and records a review
  await page.locator(".search-row button").click();
  await expect(page.getByText("Fixture Album", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Fixture Album/ }).click();
  await page.locator("#review").fill("Reviewer workspace fixture record");
  await page.locator(".save-button").click();

  // Then the selected candidate retains its backend-supplied GraphRAG answer, recommendation, evidence path, and save receipt
  await expect(page.getByTestId("graphrag-answer")).toHaveText("Fixture evidence answer");
  await expect(page.getByTestId("recommendation-panel")).toContainText("World of Sleepers");
  await expect(page.getByTestId("recommendation-panel")).toContainText("personal-graph-lexical-v1");
  await expect(page.getByTestId("recommendation-panel")).toContainText("fixture-album-001");
  await expect(page.getByTestId("recommendation-panel")).toContainText("0.3325");
  await expect(page.getByTestId("recommendation-panel")).toContainText("0.23");
  await expect(page.getByTestId("recommendation-panel")).toContainText("0.176");
  await expect(page.getByTestId("recommendation-panel")).toContainText("0.08");
  await expect(page.getByTestId("recommendation-panel")).toContainText("0.075");
  await expect(page.getByTestId("recommendation-panel")).toContainText("evidence:preference-path-001");
  await expect(page.getByText("fixture-evidence-001", { exact: true })).toBeVisible();
  await expect(page.getByTestId("save-confirmation")).toContainText("fixture-review-001");
  await page.screenshot({ path: testInfo.outputPath(`reviewer-workspace-${testInfo.project.name}.png`), fullPage: true });
  await writeFile(testInfo.outputPath(`reviewer-workspace-${testInfo.project.name}-network.json`), traceFor(requests));
});

test("Given a search with no fixture candidate, when the reviewer searches, then typed no-evidence panels show no synthesized answer", async ({ page }, testInfo) => {
  // Given the real local reviewer workspace
  await page.goto("/");
  await expect(page.getByTestId("fixture-label")).toHaveText("fixture only");

  // When the fixture search has no candidate result
  await page.locator("#album-search").fill("definitely-not-the-fixture");
  await page.locator(".search-row button").click();

  // Then the evidence path and synthesis panels remain in their typed no-evidence state without a fabricated answer or citation
  await expect(page.locator(".candidate-row")).toHaveCount(0);
  await expect(page.locator("#evidence-review .evidence-state")).toHaveCount(2);
  await expect(page.getByTestId("graphrag-answer")).toHaveCount(0);
  await expect(page.getByText("fixture-evidence-001", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`reviewer-no-evidence-${testInfo.project.name}.png`), fullPage: true });
});

test("Given selected fixture evidence, when recommendation retrieval fails, then the workspace shows a typed recovery record without a fabricated recommendation", async ({ page }) => {
  // Given real browser UI routes whose recommendation BFF response is an unavailable typed failure
  await page.route("**/api/fixture/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "fixture", status: "ok" }), contentType: "application/json", status: 200 }));
  await page.route((url) => url.pathname === "/api/fixture/candidates", (route) => route.fulfill({
    body: JSON.stringify({ candidates: [{ artist: "Fixture Artist", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "Fixture Album" }], mode: "fixture" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/fixture/candidates/fixture-album-001/evidence", (route) => route.fulfill({
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
  await page.route("**/api/fixture/recommendations", (route) => route.fulfill({
    body: JSON.stringify({ code: "BACKEND_UNAVAILABLE", retryable: true }),
    contentType: "application/json",
    status: 503
  }));
  await page.goto("/");

  // When the reviewer selects the fixture candidate
  await page.locator(".search-row button").click();
  await page.getByRole("button", { name: /Fixture Album/ }).click();

  // Then the existing GraphRAG answer remains attributable while recommendation failure is explicit and no candidate is fabricated
  await expect(page.getByTestId("graphrag-answer")).toHaveText("Fixture evidence answer");
  await expect(page.getByTestId("recommendation-unavailable")).toBeVisible();
  await expect(page.getByTestId("recommendation-panel")).toHaveCount(0);
});

test("Given a configured outage or configuration failure, when the reviewer opens the workspace, then the typed error is recoverable without evidence data", async ({ page, request }, testInfo) => {
  const configurationFailure = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";
  const outage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
  test.skip(!configurationFailure && !outage, "requires a real configured failure-mode process");

  // Given the real Next process is started with a deliberately unavailable or missing backend configuration
  const health = await request.get("/api/fixture/health");

  // When the reviewer workspace is opened
  await page.goto("/");

  // Then the typed 503 remains recoverable and does not invent GraphRAG or recommendation data
  expect(health.status()).toBe(503);
  await expect(page.locator("#album-search")).toBeEditable();
  await expect(page.locator("#evidence-review .evidence-state")).toHaveCount(2);
  await expect(page.getByTestId("graphrag-answer")).toHaveCount(0);
  await expect(page.getByTestId("recommendation-panel")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`reviewer-recoverable-${testInfo.project.name}.png`), fullPage: true });
});
