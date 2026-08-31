import { describe, expect, it } from "vitest";

import { metadata as methodMetadata } from "../app/method/page";
import { metadata as privacyMetadata } from "../app/privacy/page";
import { metadata as termsMetadata } from "../app/terms/page";

describe("service page metadata", () => {
  it.each([
    ["method", methodMetadata, "/method"],
    ["privacy", privacyMetadata, "/privacy"],
    ["terms", termsMetadata, "/terms"]
  ])("publishes a page-specific canonical URL for %s", (_name, metadata, canonical) => {
    expect(metadata.alternates).toMatchObject({ canonical });
  });
});
