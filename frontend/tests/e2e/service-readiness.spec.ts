import { expect, test } from "@playwright/test";

import { routeConnectedWorkspace } from "./connected-workspace-fixtures";

test("Given a public visitor, when the archive opens, then service trust pages and a restrained heading rhythm are available", async ({ page }) => {
  await routeConnectedWorkspace(page);
  await page.unroute("**/api/owner/session");
  await page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner: false }), contentType: "application/json", status: 200 }));

  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "주요 탐색" })).toBeVisible();
  await expect(page.locator("footer").getByRole("link")).toHaveCount(3);
  await expect(page.locator("main .section-kicker")).toHaveCount(2);

  await page.locator("footer").getByRole("link", { name: "추천 방식" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "추천이 만들어지는 방식" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("main")).toContainText("영구 pgvector 검증 전에는 벡터 검색을 사용하지 않습니다.");

  await page.getByRole("link", { name: "개인정보 처리" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "개인정보 처리 안내" })).toBeVisible();
  await expect(page.locator("main")).toContainText("좋아요 목록은 이 브라우저에만 저장됩니다.");

  await page.getByRole("link", { name: "이용 조건" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "이용 조건" })).toBeVisible();
  await expect(page.getByRole("link", { name: "음악 아카이브로 돌아가기" })).toBeVisible();
});
