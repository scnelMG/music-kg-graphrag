import type { Page } from "@playwright/test";

export type AlbumFixture = {
  readonly artist: string;
  readonly artistCredits: readonly string[];
  readonly catalogId?: string;
  readonly catalogSource?: "ITUNES" | "MUSICBRAINZ";
  readonly catalogUrl?: string;
  readonly coverUrl: string;
  readonly firstReleaseDate: string;
  readonly primaryType: "Album" | "EP";
  readonly releaseGroupMbid: string;
  readonly searchScore: number;
  readonly title: string;
};

export type EditionFixture = {
  readonly country: string;
  readonly disambiguation: string;
  readonly recommended: boolean;
  readonly releaseDate: string;
  readonly releaseGroupMbid: string;
  readonly releaseMbid: string;
  readonly status: string;
  readonly title: string;
};

export type RecordFixture = {
  readonly albumTitle: string;
  readonly artist: string;
  readonly artistCredits: readonly string[];
  readonly coverUrl: string;
  readonly favouriteTrack: string;
  readonly lastEditedAt: string;
  readonly owned: boolean;
  readonly recordHandle: string;
  readonly releaseGroupMbid: string;
  readonly releaseMbid: string;
  readonly sentiment: string;
};

export const albumFixture: AlbumFixture = {
  artist: "Artist One",
  artistCredits: ["Artist One"],
  coverUrl: "",
  firstReleaseDate: "2024-01-01",
  primaryType: "Album",
  releaseGroupMbid: "release-group-one",
  searchScore: 100,
  title: "Album One"
};

export const editionFixture: EditionFixture = {
  country: "KR",
  disambiguation: "",
  recommended: true,
  releaseDate: "2024-01-01",
  releaseGroupMbid: "release-group-one",
  releaseMbid: "release-one",
  status: "Official",
  title: "Album One"
};

export type TrackFixture = { readonly position: number; readonly recordingMbid: string; readonly title: string };

export const trackFixture: TrackFixture = { position: 1, recordingMbid: "track-one", title: "Track One" };

type WorkspaceOptions = {
  readonly albums?: readonly AlbumFixture[];
  readonly editions?: readonly EditionFixture[];
  readonly records?: readonly RecordFixture[];
  readonly tracks?: readonly TrackFixture[];
};

function ownerInsightsPayload(): object {
  return {
    graphTaste: {
      evidencePageIds: ["notion-record-one"],
      personalRecordCount: 1,
      relisten: [{
        artist: "Artist One",
        coverUrl: "",
        evidenceMethod: "PERSONAL_RECORD_RELISTEN",
        evidencePageId: "notion-record-one",
        favouriteTrack: "Track One",
        owned: true,
        releaseGroupMbid: "release-group-one",
        title: "Album One"
      }],
      recommendations: [{
        artist: "Artist Two",
        coverUrl: "",
        evidenceMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
        evidencePaths: [{ recordPageId: "notion-record-one", relation: "SHARES_MUSICBRAINZ_TAG", value: "dream pop" }],
        firstReleaseDate: "2025-01-01",
        publicCurationReason: "same-artist",
        releaseGroupMbid: "release-group-two",
        score: 7,
        title: "Album Two"
      }],
      retrievalMethod: "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL",
      seedArtist: "Artist One"
    },
    taste: {
      artists: [{ count: 1, value: "Artist One" }],
      favouriteTracks: [{ count: 1, value: "Track One" }],
      recordCount: 1,
      sentiments: [{ count: 1, value: "Loved" }]
    }
  };
}

function publicInsightsPayload(): object {
  return {
    graphTaste: {
      relisten: [],
      recommendations: [{
        artist: "Artist Two",
        coverUrl: "",
        firstReleaseDate: "2025-01-01",
        publicCurationReason: "same-artist",
        releaseGroupMbid: "release-group-two",
        title: "Album Two"
      }]
    }
  };
}

export async function routeConnectedWorkspace(page: Page, options: WorkspaceOptions = {}): Promise<void> {
  const albums = options.albums ?? [albumFixture];
  const editions = options.editions ?? [editionFixture];
  const records = options.records ?? [];
  const tracks = options.tracks ?? [trackFixture];
  await Promise.all([
    page.route("**/api/owner/session", (route) => route.fulfill({ body: JSON.stringify({ owner: true }), contentType: "application/json", status: 200 })),
    page.route("**/api/music/health", (route) => route.fulfill({ body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200 })),
    page.route("**/api/music/readiness", (route) => route.fulfill({ body: JSON.stringify({ mode: "connected", status: "ok" }), contentType: "application/json", status: 200 })),
    page.route("**/api/music/form-options", (route) => route.fulfill({ body: JSON.stringify({ sentiments: ["Loved", "Reflective"] }), contentType: "application/json", status: 200 })),
    page.route("**/api/music/insights*", (route) => route.fulfill({
      body: JSON.stringify(new URL(route.request().url()).searchParams.get("scope") === "owner" ? ownerInsightsPayload() : publicInsightsPayload()),
      contentType: "application/json",
      status: 200
    })),
    page.route("**/api/music/records", (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      const offsetMatch = cursor === null ? null : /^fixture-offset-(\d+)$/.exec(cursor);
      const offsetText = offsetMatch?.[1];
      const offset = offsetText === undefined ? 0 : Number(offsetText);
      const pageSize = 12;
      const pageRecords = records.slice(offset, offset + pageSize);
      const nextOffset = offset + pageRecords.length;
      return route.fulfill({
        body: JSON.stringify({
          nextCursor: nextOffset < records.length ? `fixture-offset-${nextOffset}` : null,
          records: pageRecords
        }),
        contentType: "application/json",
        status: 200
      });
    }),
    page.route((url) => /\/api\/music\/records\/by-release-group\/[^/]+$/.test(url.pathname), (route) => {
      const releaseGroupMbid = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
      const record = records.find((candidate) => candidate.releaseGroupMbid === releaseGroupMbid);
      return route.fulfill({
        body: JSON.stringify({ record: record ?? null }),
        contentType: "application/json",
        status: 200
      });
    }),
    page.route((url) => url.pathname === "/api/music/albums", (route) => route.fulfill({ body: JSON.stringify({ albums }), contentType: "application/json", status: 200 })),
    page.route((url) => /\/api\/music\/albums\/[^/]+\/editions$/.test(url.pathname), (route) => route.fulfill({ body: JSON.stringify({ editions, hasMore: false, nextCursor: null }), contentType: "application/json", status: 200 })),
    page.route((url) => /\/api\/music\/albums\/[^/]+\/tracks$/.test(url.pathname), (route) => route.fulfill({ body: JSON.stringify({ tracks }), contentType: "application/json", status: 200 }))
  ]);
}
