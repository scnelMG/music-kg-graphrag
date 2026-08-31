package org.musickg.backend.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.LockSupport;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class MusicBrainzClient implements MusicCatalogGateway {
    private static final int MAX_ATTEMPTS = 2;
    private static final int RELEASE_BROWSE_LIMIT = 20;
    private final RestClient client;
    private final MusicBrainzPayloadParser parser;
    private final ConnectedServiceProperties.MusicBrainz configuration;
    private final Map<String, CachedAlbums> albumCache = new ConcurrentHashMap<>();
    private final Map<String, CachedEditionPage> editionPageCache = new ConcurrentHashMap<>();
    private final Map<String, CachedEdition> editionCache = new ConcurrentHashMap<>();
    private final Map<String, CachedTags> tagCache = new ConcurrentHashMap<>();
    private final MusicBrainzRateLimiter rateLimiter = new MusicBrainzRateLimiter();

    public MusicBrainzClient(RestClient client, ObjectMapper objectMapper, ConnectedServiceProperties.MusicBrainz configuration) {
        this.client = client;
        this.parser = new MusicBrainzPayloadParser(objectMapper);
        this.configuration = configuration;
    }

    public List<MusicCatalogGateway.Album> search(String albumTitle, String artist) {
        if (blank(albumTitle) || blank(artist)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        return searchQuery(MusicBrainzSearchQuery.albumAndArtist(albumTitle, artist));
    }

    public List<MusicCatalogGateway.Album> search(String query) {
        if (blank(query)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        return searchQuery(MusicBrainzSearchQuery.freeText(query));
    }

    public List<MusicCatalogGateway.Album> searchByArtist(String artist) {
        if (blank(artist)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        return searchQuery(MusicBrainzSearchQuery.artist(artist));
    }

    @Override
    public List<MusicCatalogGateway.Album> searchByTag(String tag) {
        if (blank(tag)) throw new IllegalArgumentException("MUSICBRAINZ_TAG_REQUIRED");
        return searchQuery(MusicBrainzSearchQuery.tag(tag));
    }

    @Override
    public List<String> tags(String releaseGroupMbid) {
        if (blank(releaseGroupMbid)) return List.of();
        CachedTags cached = tagCache.get(releaseGroupMbid);
        if (cached != null && !cached.expired()) return cached.tags();
        List<String> tags = parser.tags(get("/release-group/" + encoded(releaseGroupMbid) + "?inc=tags+genres&fmt=json"));
        MusicBrainzCache.put(tagCache, releaseGroupMbid, new CachedTags(tags, System.nanoTime() + Duration.ofHours(6).toNanos()));
        return tags;
    }

    @Override
    public List<MusicCatalogGateway.Edition> editions(String releaseGroupMbid) {
        return editions(releaseGroupMbid, null, null).editions();
    }

    @Override
    public MusicCatalogGateway.EditionPage editions(String releaseGroupMbid, String cursor, String selectedReleaseMbid) {
        if (blank(releaseGroupMbid)) throw new IllegalArgumentException("MUSICBRAINZ_RELEASE_GROUP_REQUIRED");
        int offset = editionOffset(cursor);
        MusicCatalogGateway.EditionPage page = editionPage(releaseGroupMbid, offset);
        if (offset != 0 || blank(selectedReleaseMbid)
                || page.editions().stream().anyMatch(edition -> edition.releaseMbid().equals(selectedReleaseMbid))) {
            return page;
        }
        List<MusicCatalogGateway.Edition> editions = new ArrayList<>(page.editions());
        editions.add(edition(releaseGroupMbid, selectedReleaseMbid));
        return new MusicCatalogGateway.EditionPage(editions, page.nextCursor(), page.hasMore());
    }

    @Override
    public boolean editionBelongsToReleaseGroup(String releaseGroupMbid, String releaseMbid) {
        if (blank(releaseGroupMbid) || blank(releaseMbid)) return false;
        edition(releaseGroupMbid, releaseMbid);
        return true;
    }

    @Override
    public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid) {
        if (blank(releaseGroupMbid)) throw new IllegalArgumentException("MUSICBRAINZ_RELEASE_GROUP_REQUIRED");
        try {
            String releaseMbid = editions(releaseGroupMbid).stream()
                    .filter(MusicCatalogGateway.Edition::recommended)
                    .map(MusicCatalogGateway.Edition::releaseMbid)
                    .findFirst()
                    .orElse("");
            if (blank(releaseMbid)) return List.of();
            return tracks(releaseGroupMbid, releaseMbid);
        } catch (CatalogAccessException exception) {
            if (exception.retryable() || !exception.code().equals("MUSICBRAINZ_REQUEST_REJECTED")) throw exception;
            return parser.recordingSearch(get("/recording?query=" + encoded("rgid:" + releaseGroupMbid) + "&fmt=json&limit=100"));
        }
    }

    @Override
    public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid, String releaseMbid) {
        if (blank(releaseGroupMbid)) throw new IllegalArgumentException("MUSICBRAINZ_RELEASE_GROUP_REQUIRED");
        if (blank(releaseMbid)) return tracks(releaseGroupMbid);
        boolean belongsToReleaseGroup = editionBelongsToReleaseGroup(releaseGroupMbid, releaseMbid);
        if (!belongsToReleaseGroup) throw new CatalogAccessException("MUSICBRAINZ_RELEASE_NOT_IN_GROUP", false, null);
        return parser.tracks(get("/release/" + encoded(releaseMbid) + "?inc=recordings%2Bmedia&fmt=json"));
    }

    private List<MusicCatalogGateway.Album> searchQuery(String query) {
        CachedAlbums cached = albumCache.get(query);
        if (cached != null && !cached.expired()) return cached.albums();
        String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
        List<MusicCatalogGateway.Album> albums = parser.albums(
                get("/release-group?query=" + encodedQuery + "&fmt=json&limit=10"), this::coverUrl);
        MusicBrainzCache.put(albumCache, query, new CachedAlbums(albums, System.nanoTime() + Duration.ofMinutes(2).toNanos()));
        return albums;
    }

    private MusicCatalogGateway.EditionPage editionPage(String releaseGroupMbid, int offset) {
        String cacheKey = releaseGroupMbid + "|" + offset;
        CachedEditionPage cached = editionPageCache.get(cacheKey);
        if (cached != null && !cached.expired()) return cached.page();
        MusicBrainzPayloadParser.EditionPage providerPage = parser.editionPage(
                releaseGroupMbid,
                get("/release?release-group=" + encoded(releaseGroupMbid)
                        + "&limit=" + RELEASE_BROWSE_LIMIT + "&offset=" + offset + "&fmt=json"));
        Set<String> releaseMbids = new HashSet<>();
        if (providerPage.editions().stream().anyMatch(edition -> !releaseMbids.add(edition.releaseMbid()))) {
            throw contractError();
        }
        if (providerPage.returnedCount() > RELEASE_BROWSE_LIMIT
                || offset > providerPage.releaseCount()
                || (providerPage.returnedCount() == 0 && offset < providerPage.releaseCount())
                || offset + providerPage.returnedCount() > providerPage.releaseCount()) throw contractError();
        List<MusicCatalogGateway.Edition> ranked = parser.rankEditions(providerPage.editions());
        long editionExpiry = System.nanoTime() + Duration.ofMinutes(10).toNanos();
        providerPage.editions().forEach(edition -> MusicBrainzCache.put(editionCache, edition.releaseMbid(), new CachedEdition(edition, editionExpiry)));
        List<MusicCatalogGateway.Edition> editions = offset == 0 ? ranked : ranked.stream()
                .map(MusicBrainzClient::withoutRecommendation)
                .toList();
        int nextOffset = offset + providerPage.returnedCount();
        boolean hasMore = nextOffset < providerPage.releaseCount();
        MusicCatalogGateway.EditionPage page = new MusicCatalogGateway.EditionPage(
                editions, hasMore ? Integer.toString(nextOffset) : null, hasMore);
        MusicBrainzCache.put(editionPageCache, cacheKey, new CachedEditionPage(page, System.nanoTime() + Duration.ofMinutes(2).toNanos()));
        return page;
    }

    private MusicCatalogGateway.Edition edition(String releaseGroupMbid, String releaseMbid) {
        CachedEdition cached = editionCache.get(releaseMbid);
        if (cached != null && !cached.expired()) {
            if (!cached.edition().releaseGroupMbid().equals(releaseGroupMbid)) {
                throw CatalogAccessException.releaseNotInGroup();
            }
            return cached.edition();
        }
        MusicCatalogGateway.Edition edition = parser.edition(releaseGroupMbid,
                get("/release/" + encoded(releaseMbid) + "?inc=release-groups&fmt=json"));
        MusicBrainzCache.put(editionCache, releaseMbid, new CachedEdition(edition, System.nanoTime() + Duration.ofMinutes(10).toNanos()));
        return edition;
    }

    private static MusicCatalogGateway.Edition withoutRecommendation(MusicCatalogGateway.Edition edition) {
        return new MusicCatalogGateway.Edition(
                edition.releaseMbid(), edition.releaseGroupMbid(), edition.title(), edition.releaseDate(),
                edition.country(), edition.status(), edition.disambiguation(), false);
    }

    private static int editionOffset(String cursor) {
        if (blank(cursor)) return 0;
        try {
            int offset = Integer.parseInt(cursor);
            if (offset < 0) throw new IllegalArgumentException("MUSICBRAINZ_EDITION_CURSOR_INVALID");
            return offset;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("MUSICBRAINZ_EDITION_CURSOR_INVALID", exception);
        }
    }

    private static CatalogAccessException contractError() {
        return new CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, null);
    }

    private String get(String pathAndQuery) {
        CatalogAccessException failure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                rateLimiter.awaitRequest(configuration.requestsPerSecond());
                return client.get()
                        .uri(URI.create(configuration.baseUrl().replaceAll("/+$", "") + pathAndQuery))
                        .header("User-Agent", configuration.userAgent())
                        .retrieve()
                        .body(String.class);
            } catch (RestClientResponseException exception) {
                failure = fromResponse(exception);
                if (!failure.retryable() || attempt == MAX_ATTEMPTS) throw failure;
            } catch (ResourceAccessException exception) {
                failure = new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, exception);
                if (attempt == MAX_ATTEMPTS) throw failure;
            }
            LockSupport.parkNanos(Duration.ofMillis(200L * attempt).toNanos());
        }
        throw failure == null ? new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, null) : failure;
    }

    private static CatalogAccessException fromResponse(RestClientResponseException exception) {
        int status = exception.getStatusCode().value();
        if (status == 429) return new CatalogAccessException("MUSICBRAINZ_RATE_LIMITED", true, exception);
        if (status >= 500) return new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, exception);
        return new CatalogAccessException("MUSICBRAINZ_REQUEST_REJECTED", false, exception);
    }

    private String coverUrl(String releaseGroupMbid) {
        return configuration.coverArtArchiveBaseUrl().replaceAll("/+$", "")
                + "/release-group/" + releaseGroupMbid + "/front-250";
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String encoded(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record CachedAlbums(List<MusicCatalogGateway.Album> albums, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    private record CachedEditionPage(MusicCatalogGateway.EditionPage page, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    private record CachedEdition(MusicCatalogGateway.Edition edition, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    private record CachedTags(List<String> tags, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    public static final class CatalogAccessException extends RuntimeException {
        public static CatalogAccessException releaseNotInGroup() {
            return new CatalogAccessException("MUSICBRAINZ_RELEASE_NOT_IN_GROUP", false, null);
        }

        public static CatalogAccessException releaseGroupNotFound() {
            return new CatalogAccessException("MUSICBRAINZ_RELEASE_GROUP_NOT_FOUND", false, null);
        }

        public static CatalogAccessException trackNotInRelease() {
            return new CatalogAccessException("MUSICBRAINZ_TRACK_NOT_IN_RELEASE", false, null);
        }

        private final String code;
        private final boolean retryable;

        CatalogAccessException(String code, boolean retryable, Throwable cause) {
            super(code, cause);
            this.code = code;
            this.retryable = retryable;
        }

        public String code() { return code; }

        public boolean retryable() { return retryable; }
    }

}
