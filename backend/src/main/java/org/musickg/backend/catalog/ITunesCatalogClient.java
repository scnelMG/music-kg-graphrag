package org.musickg.backend.catalog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class ITunesCatalogClient implements SupplementalCatalogGateway {
    private static final int RESULT_LIMIT = 10;
    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final Map<String, CachedSearch> searchCache = new ConcurrentHashMap<>();
    private final Deque<Long> requestNanos = new ArrayDeque<>();

    public ITunesCatalogClient(RestClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<MusicCatalogGateway.Album> search(String query) {
        if (blank(query)) throw new IllegalArgumentException("ITUNES_QUERY_REQUIRED");
        CachedSearch cached = searchCache.get(query);
        if (cached != null && !cached.expired()) return cached.albums();
        List<MusicCatalogGateway.Album> albums = parseAlbums(get("/search?term=" + encoded(query)
                + "&country=KR&media=music&entity=album&limit=" + RESULT_LIMIT));
        MusicBrainzCache.put(searchCache, query, new CachedSearch(albums,
                System.nanoTime() + Duration.ofMinutes(10).toNanos()));
        return albums;
    }

    @Override
    public MusicCatalogGateway.Album album(String collectionId) {
        if (blank(collectionId) || !collectionId.matches("[0-9]+")) {
            throw new IllegalArgumentException("ITUNES_COLLECTION_ID_REQUIRED");
        }
        return parseAlbums(get("/lookup?id=" + encoded(collectionId) + "&country=KR")).stream()
                .filter(album -> album.catalogId().equals(collectionId))
                .findFirst()
                .orElseThrow(() -> new MusicBrainzClient.CatalogAccessException("ITUNES_COLLECTION_NOT_FOUND", false, null));
    }

    @Override
    public List<MusicCatalogGateway.Track> tracks(String collectionId) {
        if (blank(collectionId) || !collectionId.matches("[0-9]+")) {
            throw new IllegalArgumentException("ITUNES_COLLECTION_ID_REQUIRED");
        }
        return parseTracks(get("/lookup?id=" + encoded(collectionId) + "&entity=song&country=KR"), collectionId);
    }

    private String get(String pathAndQuery) {
        acquireRequest();
        try {
            return client.get().uri(URI.create(pathAndQuery)).retrieve().body(String.class);
        } catch (RestClientResponseException exception) {
            throw new MusicBrainzClient.CatalogAccessException("ITUNES_REQUEST_REJECTED", false, exception);
        } catch (ResourceAccessException exception) {
            throw new MusicBrainzClient.CatalogAccessException("ITUNES_UNAVAILABLE", true, exception);
        }
    }

    private List<MusicCatalogGateway.Album> parseAlbums(String response) {
        try {
            JsonNode results = objectMapper.readTree(response).path("results");
            if (!results.isArray()) throw contractError();
            List<MusicCatalogGateway.Album> albums = new ArrayList<>();
            LinkedHashSet<String> seenCollectionIds = new LinkedHashSet<>();
            for (JsonNode result : results) {
                if (!"collection".equals(result.path("wrapperType").asText())
                        || !"Album".equals(result.path("collectionType").asText())) continue;
                String collectionId = result.path("collectionId").asText();
                String title = result.path("collectionName").asText();
                String artist = result.path("artistName").asText();
                String catalogUrl = result.path("collectionViewUrl").asText();
                if (blank(collectionId) || blank(title) || blank(artist) || !catalogUrl.startsWith("https://")
                        || !seenCollectionIds.add(collectionId)) continue;
                String date = result.path("releaseDate").asText();
                String releaseDate = date.matches("\\d{4}-\\d{2}-\\d{2}.*") ? date.substring(0, 10) : "";
                String coverUrl = result.path("artworkUrl100").asText();
                albums.add(new MusicCatalogGateway.Album("", title, artist, releaseDate, coverUrl, List.of(artist),
                        "Album", 0, MusicCatalogGateway.CatalogSource.ITUNES, collectionId, catalogUrl));
            }
            return List.copyOf(albums);
        } catch (JsonProcessingException exception) {
            throw contractError();
        }
    }

    private List<MusicCatalogGateway.Track> parseTracks(String response, String collectionId) {
        try {
            JsonNode results = objectMapper.readTree(response).path("results");
            if (!results.isArray()) throw contractError();
            List<MusicCatalogGateway.Track> tracks = new ArrayList<>();
            LinkedHashSet<String> seenTrackIds = new LinkedHashSet<>();
            for (JsonNode result : results) {
                if (!"track".equals(result.path("wrapperType").asText())
                        || !"song".equals(result.path("kind").asText())
                        || !collectionId.equals(result.path("collectionId").asText())) continue;
                String trackId = result.path("trackId").asText();
                String title = result.path("trackName").asText();
                int position = result.path("trackNumber").asInt(0);
                if (blank(trackId) || blank(title) || position < 1 || !seenTrackIds.add(trackId)) continue;
                tracks.add(new MusicCatalogGateway.Track("itunes:" + trackId, title, position));
            }
            return List.copyOf(tracks);
        } catch (JsonProcessingException exception) {
            throw contractError();
        }
    }

    private synchronized void acquireRequest() {
        long now = System.nanoTime();
        long threshold = now - Duration.ofMinutes(1).toNanos();
        while (!requestNanos.isEmpty() && requestNanos.peekFirst() < threshold) requestNanos.removeFirst();
        if (requestNanos.size() >= MAX_REQUESTS_PER_MINUTE) {
            throw new MusicBrainzClient.CatalogAccessException("ITUNES_RATE_LIMITED", true, null);
        }
        requestNanos.addLast(now);
    }

    private static MusicBrainzClient.CatalogAccessException contractError() {
        return new MusicBrainzClient.CatalogAccessException("ITUNES_RESPONSE_CONTRACT_ERROR", false, null);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String encoded(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record CachedSearch(List<MusicCatalogGateway.Album> albums, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }
}
