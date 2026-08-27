import { describe, expect, it } from "vitest";

import { connectedMusicFailureKind } from "../lib/connected-music-failure";

describe("connected music failure classification", () => {
  it.each([
    ["NOTION_CONNECTION_NOT_SHARED", "notion-not-shared"],
    ["NOTION_CONNECTION_UNAUTHORIZED", "notion-unauthorized"],
    ["NOTION_RATE_LIMITED", "notion-rate-limited"],
    ["MUSICBRAINZ_RATE_LIMITED", "catalog-rate-limited"],
    ["ITUNES_RATE_LIMITED", "catalog-rate-limited"],
    ["GRAPHDB_UNAVAILABLE", "personal-graph-unavailable"],
    ["INSUFFICIENT_PERSONAL_HISTORY", "insufficient-history"],
    ["OWNER_SESSION_REQUIRED", "owner-session-required"],
    ["CATALOG_IDENTITY_CONFIGURATION_REQUIRED", "configuration"],
    ["BACKEND_CONFIGURATION_ERROR", "configuration"],
    ["BACKEND_UNAVAILABLE", "unavailable"]
  ] as const)("classifies %s without interpreting upstream details", (message, expected) => {
    expect(connectedMusicFailureKind(message)).toBe(expected);
  });
});
