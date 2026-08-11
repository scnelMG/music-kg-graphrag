import { expect, test } from "@playwright/test";

const backendOutage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";
const backendConfigurationError = process.env.TASK12B_E2E_BACKEND_CONFIGURATION_ERROR === "true";
const backendPort = process.env.TASK12_UI_E2E_BACKEND_PORT ?? "18080";

test("BFF integration reaches the authenticated fixture API", async ({ request }) => {
  test.skip(backendOutage || backendConfigurationError, "requires the local Spring fixture API");
  // Given the local Next BFF and separately running Spring fixture API
  // When the browser-facing health route is requested
  const response = await request.get("/api/fixture/health");

  // Then the server-only credential reaches Spring and only safe health data returns
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ mode: "fixture", status: "ok" });
});

test("missing shared secret returns a typed 401", async ({ playwright }) => {
  test.skip(backendOutage || backendConfigurationError, "requires the local Spring fixture API");
  // Given a direct client with no BFF credential
  const directClient = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${backendPort}` });

  // When it calls the separately hosted API boundary
  const response = await directClient.get("/api/v1/health");

  // Then Spring rejects it without exposing configuration
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ code: "BFF_AUTH_REQUIRED" });
  await directClient.dispose();
});

test("running BFF process renders recoverable configuration guidance when server settings are absent", async ({ page, request }, testInfo) => {
  test.skip(!backendConfigurationError, "requires TASK12B_E2E_BACKEND_CONFIGURATION_ERROR=true");
  // Given a real Next process started without backend URL or shared-secret settings
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // When the browser-facing health route and review desk are opened
  const response = await request.get("/api/fixture/health");
  await page.goto("/");

  // Then the typed process response drives actionable Korean recovery UI
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({
    code: "BACKEND_CONFIGURATION_ERROR",
    message: "The fixture backend is not configured.",
    retryable: false
  });
  await expect(page.getByRole("status")).toContainText("백엔드 연결 설정이 완료되지 않았습니다.");
  await expect(page.getByText("추천과 근거를 연결하려면 설정이 필요합니다.")).toHaveCount(1);
  await expect(page.locator("#album-search")).toBeEditable();
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("backend-configuration-recoverable.png"), fullPage: true });
});

test("running BFF process renders a recoverable typed 503 during backend outage", async ({ page, request }, testInfo) => {
  test.skip(!backendOutage, "requires TASK12B_E2E_BACKEND_OUTAGE=true");
  // Given a running Next process configured with an unreachable backend
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // When a client calls the real browser-facing route over HTTP
  const response = await request.get("/api/fixture/health");

  // Then the process returns only the recoverable typed state
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({
    code: "BACKEND_UNAVAILABLE",
    message: "The fixture backend is temporarily unavailable.",
    retryable: true
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("백엔드 연결에 실패했습니다.");
  await expect(page.getByRole("status")).not.toContainText("temporarily unavailable");
  await page.locator(".search-row button").click();
  await expect(page.getByRole("status")).toContainText("복구 후 재시도해 주세요.");
  await expect(page.locator("#album-search")).toBeEditable();
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("backend-outage-recoverable.png"), fullPage: true });
});

test("review desk renders a message-less 502 contract error without crashing", async ({ page }, testInfo) => {
  // Given browser-facing BFF routes where review save returns a typed 502 without message
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/fixture/health", (route) => route.fulfill({
    body: JSON.stringify({ mode: "fixture", status: "ok" }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/fixture/candidates**", (route) => route.fulfill({
    body: JSON.stringify({
      candidates: [{ artist: "윤슬", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "밤의 기록" }],
      mode: "fixture"
    }),
    contentType: "application/json",
    status: 200
  }));
  await page.route("**/api/fixture/reviews", (route) => route.fulfill({
    body: JSON.stringify({ code: "BACKEND_CONTRACT_ERROR", retryable: false }),
    contentType: "application/json",
    status: 502
  }));

  // When a user searches, writes a review, and submits it through a real browser
  await page.goto("/");
  await page.locator(".search-row button").click();
  await page.getByRole("button", { name: /밤의 기록/ }).click();
  await page.locator("#review").fill("preserve this review");
  await page.locator(".save-button").click();

  // Then the typed code is display-safe, the form remains usable, and no page exception occurs
  await expect(page.getByRole("status")).toContainText("백엔드 응답 형식을 확인하지 못했습니다.");
  await expect(page.locator("#review")).toHaveValue("preserve this review");
  await expect(page.locator("#review")).toBeEditable();
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contract-error-recoverable.png"), fullPage: true });
});
