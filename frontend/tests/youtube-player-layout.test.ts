import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("YouTube preview layout", () => {
  it("keeps the embedded player compact on wide record-editor screens", () => {
    const ownerStyles = readFileSync(resolve("app/styles/owner.css"), "utf8");

    expect(ownerStyles).toMatch(/\.youtube-playback\s*\{[^}]*width:\s*min\(100%,\s*42rem\)/s);
  });
});
