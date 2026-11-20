import { NextResponse } from "next/server";
import { z } from "zod";

const mbid = z.string().uuid();
const credit = z.object({ name: z.string().optional(), artist: z.object({ name: z.string() }) });
const group = z.object({
  id: mbid, title: z.string().min(1), "primary-type": z.string().default(""),
  "first-release-date": z.string().default(""), score: z.coerce.number().int().nonnegative().default(0),
  "artist-credit": z.array(credit).min(1)
});
const release = z.object({
  id: mbid, title: z.string().min(1), date: z.string().default(""),
  country: z.string().default(""), status: z.string().default(""), disambiguation: z.string().default("")
});
const itunesAlbum = z.object({
  collectionId: z.number().int().positive(), collectionName: z.string().min(1), artistName: z.string().min(1),
  collectionViewUrl: z.string().url(), artworkUrl100: z.string().url().optional(), releaseDate: z.string().default("")
});
const genres: Record<string, string> = { "dream-pop": "dream pop", "indie-rock": "indie rock", folk: "folk", electronic: "electronic" };
const userAgent = "MusicKnowledgeGraph/0.1 (https://github.com/scnelMG/music-kg-graphrag)";
let nextMusicBrainzRequestAt = 0;

class CatalogError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}

async function readProvider(provider: "MUSICBRAINZ" | "ITUNES", path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, provider === "MUSICBRAINZ" ? "https://musicbrainz.org/ws/2/" : "https://itunes.apple.com/");
  url.search = new URLSearchParams(params).toString();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (provider === "MUSICBRAINZ") {
      // shortcut: pacing is per warm instance; use a shared limiter if traffic needs multiple instances.
      const delay = Math.max(attempt === 0 ? 1100 : 2200, nextMusicBrainzRequestAt - Date.now());
      if (delay > 5000) throw new CatalogError("MUSICBRAINZ_RATE_LIMITED");
      nextMusicBrainzRequestAt = Date.now() + delay + 1100;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": userAgent },
      signal: AbortSignal.timeout(12_000), redirect: "error", next: { revalidate: 600 }
    });
    if (provider === "MUSICBRAINZ" && attempt === 0 && (response.status === 503 || response.status === 429)) continue;
    if (!response.ok) {
      if (response.status === 429 || (provider === "MUSICBRAINZ" && response.status === 503)) throw new CatalogError(`${provider}_RATE_LIMITED`);
      throw new CatalogError(`${provider}_UNAVAILABLE`);
    }
    return response.json();
  }
  throw new CatalogError(`${provider}_UNAVAILABLE`);
}

async function searchMusicBrainz(query: string) {
  const payload = z.object({ "release-groups": z.array(group) }).parse(await readProvider("MUSICBRAINZ", "release-group", { query: `(${query}) AND (primarytype:album OR primarytype:ep)`, fmt: "json", limit: "10" }));
  return payload["release-groups"].filter((album) => album["primary-type"] === "Album" || album["primary-type"] === "EP").map((album) => {
    const artistCredits = album["artist-credit"].map((item) => item.name || item.artist.name);
    return {
      artist: artistCredits.join(", "), artistCredits, catalogId: album.id, catalogSource: "MUSICBRAINZ" as const, catalogUrl: "",
      coverUrl: `https://coverartarchive.org/release-group/${album.id}/front-250`, firstReleaseDate: album["first-release-date"],
      primaryType: album["primary-type"], releaseGroupMbid: album.id, searchScore: album.score, title: album.title
    };
  }).sort((a, b) => b.searchScore - a.searchScore || a.title.localeCompare(b.title) || a.catalogId.localeCompare(b.catalogId));
}

function escapeTerm(value: string): string {
  return value.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, "\\$&");
}

async function searchAlbums(query: string) {
  const term = escapeTerm(query);
  let expression = `releasegroup:"${term}" OR artist:"${term}"`;
  if (/^[\p{L}\p{N}]+$/u.test(query) && /[\p{Script=Hangul}]/u.test(query)) expression += ` OR releasegroup:${term}* OR artist:${term}*`;
  let primaryFailure: unknown;
  try {
    const albums = await searchMusicBrainz(expression);
    if (albums.length > 0) return albums;
  } catch (error) {
    if (!(error instanceof CatalogError) && !(error instanceof TypeError) && !(error instanceof DOMException)) throw error;
    primaryFailure = error;
  }
  const payload = z.object({ results: z.array(z.unknown()) }).parse(await readProvider("ITUNES", "search", { term: query, country: "KR", media: "music", entity: "album", limit: "10" }));
  const albums = payload.results.flatMap((item) => {
    const result = itunesAlbum.safeParse(item);
    if (!result.success) return [];
    const album = result.data;
    return [{
      artist: album.artistName, artistCredits: [album.artistName], catalogId: String(album.collectionId), catalogSource: "ITUNES" as const,
      catalogUrl: album.collectionViewUrl, coverUrl: album.artworkUrl100 ?? "", firstReleaseDate: album.releaseDate.slice(0, 10),
      primaryType: "Album", releaseGroupMbid: "", searchScore: 0, title: album.collectionName
    }];
  });
  if (albums.length === 0 && primaryFailure) throw primaryFailure;
  return albums;
}

function edition(releaseGroupMbid: string, item: z.infer<typeof release>, recommended = false) {
  return { country: item.country, disambiguation: item.disambiguation, recommended, releaseDate: item.date, releaseGroupMbid, releaseMbid: item.id, status: item.status, title: item.title };
}

async function getRelease(releaseGroupMbid: string, releaseMbid: string, tracks: boolean) {
  mbid.parse(releaseMbid);
  const payload = await readProvider("MUSICBRAINZ", `release/${releaseMbid}`, { inc: tracks ? "release-groups+recordings+media" : "release-groups", fmt: "json" });
  const identity = release.extend({ "release-group": z.object({ id: mbid }) }).parse(payload);
  if (identity["release-group"].id !== releaseGroupMbid) throw new CatalogError("MUSICBRAINZ_RELEASE_NOT_IN_GROUP", 400);
  return { identity, payload };
}

async function editions(releaseGroupMbid: string, params: URLSearchParams) {
  const offset = Number(params.get("cursor") ?? "0");
  const page = z.object({ "release-count": z.number().int().nonnegative(), releases: z.array(release).max(20) }).parse(
    await readProvider("MUSICBRAINZ", "release", { "release-group": releaseGroupMbid, limit: "20", offset: String(offset), fmt: "json" })
  );
  const nextOffset = offset + page.releases.length;
  if (offset > page["release-count"] || nextOffset > page["release-count"] || (page.releases.length === 0 && offset < page["release-count"])) throw new CatalogError("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", 502);
  const ordered = [...page.releases].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || Number(b.status === "Official") - Number(a.status === "Official") || a.id.localeCompare(b.id));
  const values = ordered.map((item, index) => edition(releaseGroupMbid, item, offset === 0 && index === 0));
  const selected = params.get("selected");
  if (selected && !values.some((item) => item.releaseMbid === selected)) values.push(edition(releaseGroupMbid, (await getRelease(releaseGroupMbid, selected, false)).identity));
  const hasMore = nextOffset < page["release-count"];
  return { editions: values, hasMore, nextCursor: hasMore ? String(nextOffset) : null };
}

async function tracks(releaseGroupMbid: string, releaseMbid: string) {
  const { payload } = await getRelease(releaseGroupMbid, releaseMbid, true);
  const parsed = z.object({ media: z.array(z.object({ tracks: z.array(z.object({ position: z.number().int().positive(), recording: z.object({ id: mbid, title: z.string().min(1) }) })) })) }).parse(payload);
  return parsed.media.flatMap((medium) => medium.tracks.map((track) => ({ position: track.position, recordingMbid: track.recording.id, title: track.recording.title })));
}

async function itunesTracks(collectionId: string) {
  const song = z.object({ wrapperType: z.literal("track"), collectionId: z.number().int(), trackId: z.number().int().positive(), trackName: z.string().min(1), trackNumber: z.number().int().positive() });
  for (const country of ["KR", "US"]) {
    const payload = z.object({ results: z.array(z.unknown()) }).parse(await readProvider("ITUNES", "lookup", { id: collectionId, entity: "song", country }));
    const values = payload.results.flatMap((item) => {
      const parsed = song.safeParse(item);
      if (!parsed.success || String(parsed.data.collectionId) !== collectionId) return [];
      return [{ position: parsed.data.trackNumber, recordingMbid: `itunes:${parsed.data.trackId}`, title: parsed.data.trackName }];
    });
    if (values.length > 0) return values;
  }
  return [];
}

export async function callPublicCatalog(path: string, params = new URLSearchParams()) {
  try {
    let payload: unknown;
    if (path === "api/v1/catalog/albums") {
      payload = await searchAlbums(z.string().trim().min(1).max(200).parse(params.get("q")));
    } else if (path === "api/v1/catalog/explore") {
      const tag = genres[params.get("genre") ?? ""];
      if (!tag) throw new CatalogError("MALFORMED_REQUEST", 400);
      payload = await searchMusicBrainz(`tag:"${tag}"`);
    } else {
      const album = /^api\/v1\/catalog\/albums\/([^/]+)\/(editions|tracks)$/.exec(path);
      const itunes = /^api\/v1\/catalog\/itunes\/albums\/([0-9]+)\/tracks$/.exec(path);
      if (album) {
        const id = mbid.safeParse(album[1]);
        if (!id.success) throw new CatalogError("MALFORMED_REQUEST", 400);
        const selected = params.get(album[2] === "tracks" ? "edition" : "selected");
        if ((album[2] === "tracks" || selected !== null) && !mbid.safeParse(selected).success) throw new CatalogError("MALFORMED_REQUEST", 400);
        payload = album[2] === "editions" ? await editions(id.data, params) : await tracks(id.data, params.get("edition") ?? "");
      } else if (itunes) {
        payload = await itunesTracks(itunes[1]);
      } else throw new CatalogError("MALFORMED_REQUEST", 400);
    }
    return { kind: "received" as const, response: Response.json(payload) };
  } catch (error) {
    const status = error instanceof CatalogError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 502 : 503;
    const code = error instanceof CatalogError ? error.code : status === 502 ? "PUBLIC_CATALOG_CONTRACT_ERROR" : "PUBLIC_CATALOG_UNAVAILABLE";
    return { kind: "handled" as const, response: NextResponse.json({ code, retryable: status === 503 }, { status, headers: { "cache-control": "no-store", ...(status === 503 ? { "retry-after": "5" } : {}) } }) };
  }
}
