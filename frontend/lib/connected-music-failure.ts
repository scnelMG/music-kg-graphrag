export type ConnectedMusicFailureKind =
  | "configuration"
  | "catalog-rate-limited"
  | "insufficient-history"
  | "notion-not-shared"
  | "notion-rate-limited"
  | "notion-unauthorized"
  | "owner-session-required"
  | "personal-graph-unavailable"
  | "unavailable";

export function connectedMusicFailureKind(message: string): ConnectedMusicFailureKind {
  if (message.includes("NOTION_CONNECTION_NOT_SHARED")) return "notion-not-shared";
  if (message.includes("NOTION_CONNECTION_UNAUTHORIZED")) return "notion-unauthorized";
  if (message.includes("NOTION_RATE_LIMITED")) return "notion-rate-limited";
  if (message.includes("MUSICBRAINZ_RATE_LIMITED")) return "catalog-rate-limited";
  if (message.includes("GRAPHDB_UNAVAILABLE")) return "personal-graph-unavailable";
  if (message.includes("INSUFFICIENT_PERSONAL_HISTORY")) return "insufficient-history";
  if (message.includes("OWNER_SESSION_REQUIRED")) return "owner-session-required";
  if (message.includes("BACKEND_CONFIGURATION_ERROR")) return "configuration";
  return "unavailable";
}
