import { afterEach, describe, expect, it, vi } from "vitest";

const originalNewSecret = process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET;
const originalLegacySecret = process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET;
const originalDistDir = process.env.NEXT_DIST_DIR;

afterEach(() => {
  if (originalNewSecret === undefined) delete process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET;
  else process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET = originalNewSecret;
  if (originalLegacySecret === undefined) delete process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET;
  else process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET = originalLegacySecret;
  if (originalDistDir === undefined) delete process.env.NEXT_DIST_DIR;
  else process.env.NEXT_DIST_DIR = originalDistDir;
  vi.resetModules();
});

describe("Next public secret guard", () => {
  it.each([
    ["NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET", "new-public-value"],
    ["NEXT_PUBLIC_BACKEND_SHARED_SECRET", "legacy-public-value"]
  ] as const)("rejects a credential in %s independently", async (variableName, value) => {
    // Given exactly one non-empty public credential variable
    process.env.NEXT_PUBLIC_BACKEND_BFF_SHARED_SECRET = "";
    process.env.NEXT_PUBLIC_BACKEND_SHARED_SECRET = "";
    process.env[variableName] = value;

    // When Next configuration is loaded
    const loadConfiguration = import("../next.config");

    // Then that credential independently fails the bundle guard
    await expect(loadConfiguration).rejects.toThrow("NEXT_PUBLIC backend credentials are forbidden");
  });

  it("uses an isolated Next output directory when the process supplies one", async () => {
    process.env.NEXT_DIST_DIR = ".next-e2e";

    const configuration = (await import("../next.config")).default;

    expect(configuration.distDir).toBe(".next-e2e");
  });
});
