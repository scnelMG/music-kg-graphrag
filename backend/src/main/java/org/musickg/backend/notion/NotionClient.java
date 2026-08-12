package org.musickg.backend.notion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.concurrent.locks.LockSupport;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

public final class NotionClient implements PersonalMusicRecordGateway {
    private static final String NOTION_VERSION = "2026-03-11";

    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final ConnectedServiceProperties.Notion configuration;
    private volatile CachedRecords cachedRecords;

    public NotionClient(RestClient client, ObjectMapper objectMapper, ConnectedServiceProperties.Notion configuration) {
        this.client = client;
        this.objectMapper = objectMapper;
        this.configuration = configuration;
    }

    public SavedRecord create(Record record) {
        String response = request(() -> client.post()
                .uri("https://api.notion.com/v1/pages")
                .header("Authorization", authorizationHeader())
                .header("Notion-Version", NOTION_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "parent", Map.of("data_source_id", configuration.dataSourceId()),
                        "properties", properties(record)))
                .retrieve()
                .body(String.class));
        SavedRecord saved = parseSavedRecord(response);
        invalidateRecords();
        return saved;
    }

    public SavedRecord update(String pageId, Record record) {
        if (blank(pageId)) throw new IllegalArgumentException("NOTION_PAGE_ID_REQUIRED");
        String response = request(() -> client.patch()
                .uri("https://api.notion.com/v1/pages/{pageId}", pageId)
                .header("Authorization", authorizationHeader())
                .header("Notion-Version", NOTION_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("properties", properties(record)))
                .retrieve()
                .body(String.class));
        SavedRecord saved = parseSavedRecord(response);
        invalidateRecords();
        return saved;
    }

    public SavedRecord archive(String pageId) {
        if (blank(pageId)) throw new IllegalArgumentException("NOTION_PAGE_ID_REQUIRED");
        String response = request(() -> client.patch()
                .uri("https://api.notion.com/v1/pages/{pageId}", pageId)
                .header("Authorization", authorizationHeader())
                .header("Notion-Version", NOTION_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("in_trash", true))
                .retrieve()
                .body(String.class));
        SavedRecord saved = parseSavedRecord(response);
        invalidateRecords();
        return saved;
    }

    public List<ExistingRecord> list() {
        CachedRecords cached = cachedRecords;
        if (cached != null && !cached.expired()) return cached.records();
        List<ExistingRecord> records = new ArrayList<>();
        String cursor = null;
        do {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("page_size", 100);
            if (cursor != null) request.put("start_cursor", cursor);
            String response = request(() -> client.post()
                    .uri("https://api.notion.com/v1/data_sources/" + configuration.dataSourceId() + "/query")
                    .header("Authorization", authorizationHeader())
                    .header("Notion-Version", NOTION_VERSION)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class));
            Page page = parsePage(response);
            records.addAll(page.records());
            cursor = page.nextCursor();
        } while (cursor != null);
        List<ExistingRecord> snapshot = List.copyOf(records);
        cachedRecords = new CachedRecords(snapshot, System.nanoTime() + Duration.ofSeconds(30).toNanos());
        return snapshot;
    }

    @Override
    public Optional<ExistingRecord> findByReleaseGroupMbid(String releaseGroupMbid) {
        if (blank(releaseGroupMbid) || blank(configuration.fields().releaseGroupMbid())) return Optional.empty();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("page_size", 1);
        request.put("filter", Map.of(
                "property", configuration.fields().releaseGroupMbid(),
                "rich_text", Map.of("equals", releaseGroupMbid)));
        String response = request(() -> client.post()
                .uri("https://api.notion.com/v1/data_sources/" + configuration.dataSourceId() + "/query")
                .header("Authorization", authorizationHeader())
                .header("Notion-Version", NOTION_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(String.class));
        Optional<ExistingRecord> parsedRecord = parsePage(response).records().stream().findFirst();
        if (parsedRecord.isPresent()) return parsedRecord;
        return pageId(response).map(pageId -> new ExistingRecord(
                pageId, "", "", "", "", "", false, releaseGroupMbid, List.of(), Instant.EPOCH));
    }

    public List<String> sentimentOptions() {
        String response = request(() -> client.get()
                .uri("https://api.notion.com/v1/data_sources/{dataSourceId}", configuration.dataSourceId())
                .header("Authorization", authorizationHeader())
                .header("Notion-Version", NOTION_VERSION)
                .retrieve()
                .body(String.class));
        try {
            JsonNode options = objectMapper.readTree(response)
                    .path("properties").path(configuration.fields().sentiment()).path("select").path("options");
            if (!options.isArray()) throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR");
            List<String> values = new ArrayList<>();
            for (JsonNode option : options) {
                String name = option.path("name").asText();
                if (!blank(name)) values.add(name);
            }
            return List.copyOf(values);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private SavedRecord parseSavedRecord(String response) {
        try {
            JsonNode body = objectMapper.readTree(response);
            String pageId = canonicalPageId(body.path("id").asText());
            String lastEdited = body.path("last_edited_time").asText();
            if (pageId.isBlank() || lastEdited.isBlank()) throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR");
            return new SavedRecord(pageId, Instant.parse(lastEdited));
        } catch (JsonProcessingException | java.time.format.DateTimeParseException exception) {
            throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private <T> T request(Supplier<T> operation) {
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return operation.get();
            } catch (HttpClientErrorException.TooManyRequests exception) {
                throw new AccessException("NOTION_RATE_LIMITED");
            } catch (HttpClientErrorException.NotFound exception) {
                throw new AccessException("NOTION_CONNECTION_NOT_SHARED");
            } catch (HttpClientErrorException.Unauthorized | HttpClientErrorException.Forbidden exception) {
                throw new AccessException("NOTION_CONNECTION_UNAUTHORIZED");
            } catch (HttpClientErrorException exception) {
                throw new AccessException("NOTION_REQUEST_REJECTED");
            } catch (HttpServerErrorException | ResourceAccessException exception) {
                if (attempt == 3) throw new AccessException("NOTION_UNAVAILABLE");
                LockSupport.parkNanos(Duration.ofMillis(200L * attempt).toNanos());
            }
        }
        throw new AccessException("NOTION_UNAVAILABLE");
    }

    private Page parsePage(String response) {
        try {
            JsonNode body = objectMapper.readTree(response);
            JsonNode resultNodes = body.path("results");
            if (!resultNodes.isArray()) throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR");
            List<ExistingRecord> records = new ArrayList<>();
            for (JsonNode result : resultNodes) {
                JsonNode properties = result.path("properties");
            String pageId = canonicalPageId(result.path("id").asText());
                var fields = configuration.fields();
                String albumTitle = firstText(properties.path(fields.albumTitle()).path("title"));
                List<String> artistCredits = names(properties.path(fields.artist()).path("multi_select"));
                String artist = artistCredits.isEmpty() ? "" : artistCredits.getFirst();
                String sentiment = properties.path(fields.sentiment()).path("select").path("name").asText();
                String favouriteTrack = firstText(properties.path(fields.favouriteTrack()).path("rich_text"));
                boolean owned = properties.path(fields.owned()).path("checkbox").asBoolean(false);
                String releaseGroupMbid = firstText(properties.path(fields.releaseGroupMbid()).path("rich_text"));
                if (blank(pageId) || blank(albumTitle) || blank(artist)) continue;
                String coverUrl = firstCoverUrl(properties.path(fields.cover()).path("files"));
                Instant lastEditedAt = parseInstant(result.path("last_edited_time").asText());
                records.add(new ExistingRecord(
                        pageId, albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, releaseGroupMbid, artistCredits, lastEditedAt));
            }
            String cursor = body.path("has_more").asBoolean(false) ? body.path("next_cursor").asText() : null;
            if (cursor != null && cursor.isBlank()) throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR");
            return new Page(List.copyOf(records), cursor);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private Optional<String> pageId(String response) {
        try {
            JsonNode results = objectMapper.readTree(response).path("results");
            if (!results.isArray() || results.isEmpty()) return Optional.empty();
            String pageId = canonicalPageId(results.get(0).path("id").asText());
            return blank(pageId) ? Optional.empty() : Optional.of(pageId);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private static String firstText(JsonNode values) {
        return values.isArray() && !values.isEmpty() ? values.get(0).path("plain_text").asText() : "";
    }

    private static String canonicalPageId(String value) {
        String compact = value.replace("-", "");
        return compact.matches("(?i)[0-9a-f]{32}") ? compact.toLowerCase(Locale.ROOT) : value;
    }

    private static Instant parseInstant(String value) {
        if (blank(value)) return Instant.EPOCH;
        try {
            return Instant.parse(value);
        } catch (java.time.format.DateTimeParseException exception) {
            throw new IllegalStateException("NOTION_RESPONSE_CONTRACT_ERROR", exception);
        }
    }

    private static List<String> names(JsonNode values) {
        if (!values.isArray()) return List.of();
        List<String> names = new ArrayList<>();
        for (JsonNode value : values) {
            String name = value.path("name").asText();
            if (!blank(name)) names.add(name);
        }
        return List.copyOf(names);
    }

    private static String firstCoverUrl(JsonNode files) {
        if (!files.isArray() || files.isEmpty()) return "";
        JsonNode file = files.get(0);
        String external = file.path("external").path("url").asText();
        return external.isBlank() ? file.path("file").path("url").asText() : external;
    }

    private Map<String, Object> properties(Record record) {
        var fields = configuration.fields();
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put(fields.albumTitle(), Map.of("title", List.of(Map.of("text", Map.of("content", record.albumTitle())))));
        properties.put(fields.artist(), Map.of("multi_select", record.artistCredits().stream()
                .map(artist -> Map.of("name", artist)).toList()));
        properties.put(fields.cover(), Map.of("files", record.coverUrl().isBlank()
                ? List.of()
                : List.of(Map.of("name", "cover", "type", "external", "external", Map.of("url", record.coverUrl())))));
        properties.put(fields.sentiment(), Map.of("select", Map.of("name", record.sentiment())));
        properties.put(fields.favouriteTrack(), Map.of("rich_text", List.of(Map.of("text", Map.of("content", record.favouriteTrack())))));
        properties.put(fields.owned(), Map.of("checkbox", record.owned()));
        if (!blank(fields.releaseGroupMbid()) && !blank(record.releaseGroupMbid())) {
            properties.put(fields.releaseGroupMbid(), Map.of(
                    "rich_text", List.of(Map.of("text", Map.of("content", record.releaseGroupMbid())))));
        }
        return Map.copyOf(properties);
    }

    public record Record(String albumTitle, String artist, String coverUrl, String sentiment, String favouriteTrack,
                         boolean owned, String releaseGroupMbid, List<String> artistCredits) {
        public Record(String albumTitle, String artist, String coverUrl, String sentiment, String favouriteTrack,
                      boolean owned, String releaseGroupMbid) {
            this(albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, releaseGroupMbid, List.of(artist));
        }

        public Record(String albumTitle, String artist, String coverUrl, String sentiment, String favouriteTrack, boolean owned) {
            this(albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, "", List.of(artist));
        }

        public Record {
            if (blank(albumTitle) || blank(artist) || blank(sentiment) || blank(favouriteTrack)) {
                throw new IllegalArgumentException("NOTION_RECORD_FIELDS_REQUIRED");
            }
            coverUrl = coverUrl == null ? "" : coverUrl;
            releaseGroupMbid = releaseGroupMbid == null ? "" : releaseGroupMbid;
            artistCredits = artistCredits == null || artistCredits.isEmpty() ? List.of(artist) : List.copyOf(artistCredits);
        }
    }

    public record SavedRecord(String pageId, Instant lastEditedAt) {}

    public record ExistingRecord(String pageId, String albumTitle, String artist, String coverUrl, String sentiment,
                                 String favouriteTrack, boolean owned, String releaseGroupMbid, List<String> artistCredits,
                                 Instant lastEditedAt) {
        public ExistingRecord(String pageId, String albumTitle, String artist, String coverUrl, String sentiment,
                              String favouriteTrack, boolean owned, String releaseGroupMbid) {
            this(pageId, albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, releaseGroupMbid, List.of(artist), Instant.EPOCH);
        }

        public ExistingRecord(String pageId, String albumTitle, String artist, String coverUrl, String sentiment,
                              String favouriteTrack, boolean owned) {
            this(pageId, albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, "", List.of(artist), Instant.EPOCH);
        }

        public ExistingRecord(String pageId, String albumTitle, String artist, String coverUrl, String sentiment,
                              String favouriteTrack, boolean owned, String releaseGroupMbid, List<String> artistCredits) {
            this(pageId, albumTitle, artist, coverUrl, sentiment, favouriteTrack, owned, releaseGroupMbid, artistCredits, Instant.EPOCH);
        }

        public ExistingRecord {
            artistCredits = artistCredits == null || artistCredits.isEmpty() ? List.of(artist) : List.copyOf(artistCredits);
            lastEditedAt = lastEditedAt == null ? Instant.EPOCH : lastEditedAt;
        }
    }

    public static final class AccessException extends RuntimeException {
        public AccessException(String code) {
            super(code);
        }
    }

    private record Page(List<ExistingRecord> records, String nextCursor) {}

    private record CachedRecords(List<ExistingRecord> records, long expiresAtNanos) {
        private boolean expired() { return System.nanoTime() >= expiresAtNanos; }
    }

    private void invalidateRecords() {
        cachedRecords = null;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private String authorizationHeader() {
        return "Bearer " + configuration.apiKey().trim();
    }
}
