import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vercel deployment boundary", () => {
  it("excludes local credentials and QA artifacts from deployment archives", async () => {
    const entries = new Set(
      (await readFile("../.vercelignore", "utf8"))
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );

    const requiredEntries = [
      ".env*",
      ".gcloud-config",
      ".superpowers",
      "debug.log",
      "frontend/--write-out",
      "frontend/.audit",
      "frontend/.playwright-*"
    ];

    expect(requiredEntries.filter((entry) => !entries.has(entry))).toEqual([]);
  });
});
