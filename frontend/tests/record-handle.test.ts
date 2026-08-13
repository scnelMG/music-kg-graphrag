import { describe, expect, it } from "vitest";

import { issueRecordHandle, resolveRecordHandle } from "../lib/record-handle";

describe("opaque record handle", () => {
  it("round-trips a Notion page id without exposing it in the browser handle", () => {
    const pageId = "a1b2c3d4-e5f6-7890-abcd-ef0123456789";
    const secret = "a-server-only-secret-that-is-long-enough";

    const handle = issueRecordHandle(pageId, secret);

    expect(handle).not.toContain(pageId);
    expect(resolveRecordHandle(handle, secret)).toBe(pageId);
  });

  it("rejects a handle that was altered or signed by another deployment secret", () => {
    const handle = issueRecordHandle("notion-page-id", "a-server-only-secret-that-is-long-enough");

    expect(resolveRecordHandle(`${handle}x`, "a-server-only-secret-that-is-long-enough")).toBeNull();
    expect(resolveRecordHandle(handle, "another-server-only-secret-that-is-long-enough")).toBeNull();
  });
});
