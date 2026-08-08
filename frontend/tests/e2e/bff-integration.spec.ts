import { expect, test } from "@playwright/test";

const backendOutage = process.env.TASK12B_E2E_BACKEND_OUTAGE === "true";

test("BFF integration reaches the authenticated fixture API", async ({ request }) => {
  test.skip(backendOutage, "requires the local Spring fixture API");
  // Given the local Next BFF and separately running Spring fixture API
  // When the browser-facing health route is requested
  const response = await request.get("/api/fixture/health");

  // Then the server-only credential reaches Spring and only safe health data returns
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ mode: "fixture", status: "ok" });
});

test("missing shared secret returns a typed 401", async ({ playwright }) => {
  test.skip(backendOutage, "requires the local Spring fixture API");
  // Given a direct client with no BFF credential
  const directClient = await playwright.request.newContext({ baseURL: "http://127.0.0.1:18080" });

  // When it calls the separately hosted API boundary
  const response = await directClient.get("/api/v1/health");

  // Then Spring rejects it without exposing configuration
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ code: "BFF_AUTH_REQUIRED" });
  await directClient.dispose();
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
  await expect(page.getByRole("status")).toContainText("백엔드에 연결할 수 없습니다.");
  await expect(page.getByRole("status")).not.toContainText("temporarily unavailable");
  await page.locator(".search-row button").click();
  await expect(page.getByRole("status")).toContainText("연결이 복구된 뒤 다시 시도해 주세요.");
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
      candidates: [{ artist: "Fixture Artist", id: "fixture-album-001", source: "PUBLIC_FIXTURE", title: "Fixture Album" }],
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
  await page.getByRole("button", { name: /Fixture Album/ }).click();
  await page.locator("#review").fill("preserve this review");
  await page.locator(".save-button").click();

  // Then the typed code is display-safe, the form remains usable, and no page exception occurs
  await expect(page.getByRole("status")).toContainText("백엔드 응답 형식을 확인하지 못했습니다.");
  await expect(page.locator("#review")).toHaveValue("preserve this review");
  await expect(page.locator("#review")).toBeEditable();
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contract-error-recoverable.png"), fullPage: true });
});
