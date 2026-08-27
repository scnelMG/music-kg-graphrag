import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const evidenceDirectory = process.env.SERVICE_VISUAL_EVIDENCE_DIR;

async function capture(page: Page, fileName: string, testInfo: TestInfo): Promise<void> {
  const path = evidenceDirectory === undefined ? testInfo.outputPath(fileName) : join(evidenceDirectory, fileName);
  if (evidenceDirectory !== undefined) await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ fullPage: true, path });
}

test("captures route-aware trust and owner access surfaces at review widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "captures canonical widths once");
  const routes = [
    { label: "추천 방식", path: "method" },
    { label: "개인정보 처리", path: "privacy" },
    { label: "이용 조건", path: "terms" }
  ] as const;

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(`/${route.path}`);
      await expect(page.getByRole("navigation", { name: "이 페이지의 내용" })).toBeVisible();
      await expect(page.locator("footer").getByRole("link", { name: route.label })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
      await capture(page, `service-${route.path}-${viewport.width}.png`, testInfo);
    }
    await page.goto("/owner");
    await expect(page.locator(".archive-navigation [aria-current=page]")).toHaveText("개인 기록");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await capture(page, `owner-access-${viewport.width}.png`, testInfo);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/method");
  await capture(page, "service-method-dark-375.png", testInfo);
  await page.goto("/owner");
  await capture(page, "owner-access-dark-375.png", testInfo);
});
