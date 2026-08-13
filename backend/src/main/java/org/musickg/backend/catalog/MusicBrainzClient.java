package org.musickg.backend.catalog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.LockSupport;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class MusicBrainzClient implements MusicCatalogGateway {
    private static final long MAX_RATE_LIMIT_QUEUE_NANOS = Duration.ofSeconds(2).toNanos();
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final ConnectedServiceProperties.MusicBrainz configuration;
    private final Map<String, CachedAlbums> albumCache = new ConcurrentHashMap<>();
    private final Map<String, CachedTags> tagCache = new ConcurrentHashMap<>();
    private long nextRequestAtNanos;

    public MusicBrainzClient(RestClient client, ObjectMapper objectMapper, ConnectedServiceProperties.MusicBrainz configuration) {
        this.client = client;
        this.objectMapper = objectMapper;
        this.configuration = configuration;
    }

    public List<MusicCatalogGateway.Album> search(String albumTitle, String artist) {
        if (blank(albumTitle) || blank(artist)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        String query = "artist:\"" + escapeTerm(artist) + "\" AND releasegroup:\"" + escapeTerm(albumTitle) + "\"";
        return searchQuery(query);
    }

    public List<MusicCatalogGateway.Album> search(String query) {
        if (blank(query)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        String term = escapeTerm(query);
        return searchQuery("releasegroup:\"" + term + "\" OR artist:\"" + term + "\"");
    }

    public List<MusicCatalogGateway.Album> searchByArtist(String artist) {
        if (blank(artist)) throw new IllegalArgumentException("MUSICBRAINZ_QUERY_REQUIRED");
        return searchQuery("artist:\"" + escapeTerm(artist) + "\"");
    }

    @Override
    public List<MusicCatalogGateway.Album> searchByTag(String tag) {
        if (blank(tag)) throw new IllegalArgumentException("MUSICBRAINZ_TAG_REQUIRED");
        return searchQuery("tag:\"" + escapeTerm(tag) + "\"");
    }

    @Override
    public List<String> tags(String releaseGroupMbid) {
        if (blank(releaseGroupMbid)) return List.of();
        CachedTags cached = tagCache.get(releaseGroupMbid);
        if (cached != null && !cached.expired()) return cached.tags();
        List<String> tags = parseTags(get("/release-group/" + encoded(releaseGroupMbid) + "?inc=tags+genres&fmt=json"));
        tagCache.put(releaseGroupMbid, new CachedTags(tags, System.nanoTime() + Duration.ofHours(6).toNanos()));
        return tags;
    }

    @Override
    public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid) {
        if (blank(releaseGroupMbid)) throw new IllegalArgumentException("MUSICBRAINZ_RELEASE_GROUP_REQUIRED");
        try {
            String group = get("/release-group/" + encoded(releaseGroupMbid) + "?inc=releases&fmt=json");
            String releaseMbid = firstReleaseMbid(group);
            if (blank(releaseMbid)) return List.of();
            return parseTracks(get("/release/" + encoded(releaseMbid) + "?inc=recordings%2Bmedia&fmt=json"));
        } catch (CatalogAccessException exception) {
            if (exception.retryable()) throw exception;
            return parseRecordingSearch(get("/recording?query=" + encoded("rgid:" + releaseGroupMbid) + "&fmt=json&limit=100"));
        }
    }

    private List<MusicCatalogGateway.Album> searchQuery(String query) {
        CachedAlbums cached = albumCache.get(query);
        if (cached != null && !cached.expired()) return cached.albums();
        String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
        List<MusicCatalogGateway.Album> albums = parseAlbums(get("/release-group?query=" + encodedQuery + "&fmt=json&limit=10"));
        albumCache.put(query, new CachedAlbums(albums, System.nanoTime() + Duration.ofMinutes(2).toNanos()));
        return albums;
    }

    private String get(String pathAndQuery) {
        CatalogAccessException failure = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                awaitRateLimit();
                return client.get()
                        .uri(URI.create(configuration.baseUrl().replaceAll("/+$", "") + pathAndQuery))
                        .header("User-Agent", configuration.userAgent())
                        .retrieve()
                        .body(String.class);
            } catch (RestClientResponseException exception) {
                failure = fromResponse(exception);
                if (!failure.retryable() || attempt == 3) throw failure;
            } catch (ResourceAccessException exception) {
                failure = new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, exception);
                if (attempt == 3) throw failure;
            }
            LockSupport.parkNanos(Duration.ofMillis(200L * attempt).toNanos());
        }
        throw failure == null ? new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, null) : failure;
    }

    private List<MusicCatalogGateway.Album> parseAlbums(String response) {
        try {
            JsonNode groups = objectMapper.readTree(response).path("release-groups");
            if (!groups.isArray()) throw new IllegalStateException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
            List<MusicCatalogGateway.Album> albums = new ArrayList<>();
            for (JsonNode group : groups) {
                String primaryType = group.path("primary-type").asText();
                if (!primaryType.equals("Album") && !primaryType.equals("EP")) continue;
                String id = group.path("id").asText();
                String title = group.path("title").asText();
                List<String> artistCredits = artistCredits(group.path("artist-credit"));
                String artist = String.join(", ", artistCredits);
                if (id.isBlank() || title.isBlank() || artist.isBlank()) continue;
                boolean hasFrontCover = group.path("cover-art-archive").path("front").asBoolean(false);
                albums.add(new MusicCatalogGateway.Album(
                        id,
                        title,
                        artist,
                        group.path("first-release-date").asText(""),
                        hasFrontCover ? coverUrl(id) : "",
                        artistCredits));
            }
            return List.copyOf(albums);
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw new CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, exception);
        }
    }

    private List<MusicCatalogGateway.Track> parseTracks(String response) {
        try {
            JsonNode release = objectMapper.readTree(response);
            List<MusicCatalogGateway.Track> tracks = new ArrayList<>();
            for (JsonNode medium : release.path("media")) {
                for (JsonNode track : medium.path("tracks")) {
                    String recordingId = track.path("recording").path("id").asText();
                    String title = track.path("recording").path("title").asText(track.path("title").asText());
                    int position = track.path("position").asInt();
                    if (!blank(recordingId) && !blank(title) && position > 0) {
                        tracks.add(new MusicCatalogGateway.Track(recordingId, title, position));
                    }
                }
            }
            return List.copyOf(tracks);
        } catch (JsonProcessingException exception) {
            throw new CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, exception);
        }
    }

    private List<MusicCatalogGateway.Track> parseRecordingSearch(String response) {
        try {
            JsonNode recordings = objectMapper.readTree(response).path("recordings");
            if (!recordings.isArray()) throw new IllegalStateException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
            List<MusicCatalogGateway.Track> tracks = new ArrayList<>();
            for (JsonNode recording : recordings) {
                String id = recording.path("id").asText();
                String title = recording.path("title").asText();
                if (!blank(id) && !blank(title)) tracks.add(new MusicCatalogGateway.Track(id, title, tracks.size() + 1));
            }
            return List.copyOf(tracks);
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw new CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, exception);
        }
    }

    private String firstReleaseMbid(String response) {
        try {
            JsonNode releases = objectMapper.readTree(response).path("releases");
            if (!releases.isArray() || releases.isEmpty()) return "";
            return releases.get(0).path("id").asText();
        } catch (JsonProcessingException | IllegalStateException exception) {
            throw new CatalogAccessException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", false, exception);
        }
    }

    private List<String> parseTags(String response) {
        try {
            JsonNode body = objectMapper.readTree(response);
            java.util.LinkedHashSet<String> values = new java.util.LinkedHashSet<>();
            collectTags(values, body.path("genres"));
            collectTags(values, body.path("tags"));
            return List.copyOf(values.stream().limit(3).toList());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private static void collectTags(java.util.LinkedHashSet<String> values, JsonNode tags) {
        if (!tags.isArray()) return;
        for (JsonNode tag : tags) {
            String name = tag.path("name").asText().trim();
            if (!name.isBlank()) values.add(name);
        }
    }

    private static List<String> artistCredits(JsonNode credits) {
        if (!credits.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode credit : credits) {
            String name = credit.path("name").asText();
            if (!blank(name)) values.add(name);
        }
        return List.copyOf(values);
    }

    private static CatalogAccessException fromResponse(RestClientResponseException exception) {
        int status = exception.getStatusCode().value();
        if (status == 429) return new CatalogAccessException("MUSICBRAINZ_RATE_LIMITED", true, exception);
        if (status >= 500) return new CatalogAccessException("MUSICBRAINZ_UNAVAILABLE", true, exception);
        return new CatalogAccessException("MUSICBRAINZ_REQUEST_REJECTED", false, exception);
    }

    private synchronized void awaitRateLimit() {
        long interval = 1_000_000_000L / configuration.requestsPerSecond();
        long now = System.nanoTime();
        long scheduled = Math.max(now, nextRequestAtNanos);
        if (scheduled - now > MAX_RATE_LIMIT_QUEUE_NANOS) {
            throw new CatalogAccessException("MUSICBRAINZ_RATE_LIMITED", true, null);
        }
        nextRequestAtNanos = scheduled + interval;
        if (scheduled > now) LockSupport.parkNanos(scheduled - now);
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

    private static String escapeTerm(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if ("+-!(){}[]^\"~*?:\\/".indexOf(character) >= 0) escaped.append('\\');
            escaped.append(character);
        }
        return escaped.toString();
    }

    private record CachedAlbums(List<MusicCatalogGateway.Album> albums, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    private record CachedTags(List<String> tags, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    public static final class CatalogAccessException extends RuntimeException {
        private final boolean retryable;

        CatalogAccessException(String code, boolean retryable, Throwable cause) {
            super(code, cause);
            this.retryable = retryable;
        }

        public boolean retryable() { return retryable; }
    }

}
