package org.musickg.backend.connected;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.musickg.backend.notion.NotionClient;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class GraphDbPersonalGraphProjectionGateway implements PersonalGraphProjectionGateway {
    private static final String GRAPH = "urn:music-kg:personal";
    private static final String SYNC_GRAPH = "urn:music-kg:personal-sync";
    private static final String PREFIX = "PREFIX m: <https://w3id.org/music-kg-graphrag/personal#> ";
    private final RestClient client;
    private final ObjectMapper objectMapper;
    private final URI queryEndpoint;

    public GraphDbPersonalGraphProjectionGateway(RestClient client, ObjectMapper objectMapper, String queryEndpoint) {
        this.client = client;
        this.objectMapper = objectMapper;
        this.queryEndpoint = URI.create(queryEndpoint);
    }

    @Override
    public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) {
        bootstrapRecords(history);
        return retrieveEvidence();
    }

    @Override
    public String retrievalMethod() {
        return "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL";
    }

    @Override
    public void replaceRecords(List<NotionClient.ExistingRecord> records) {
        for (NotionClient.ExistingRecord record : records) update(replace(record));
    }

    @Override
    public void bootstrapRecords(List<NotionClient.ExistingRecord> records) {
        update(bootstrap(records));
    }

    @Override
    public void removeRecord(String pageId) {
        if (pageId == null || pageId.isBlank()) throw new IllegalArgumentException("PERSONAL_GRAPH_PAGE_ID_REQUIRED");
        update(remove(pageId));
    }

    @Override
    public SyncSnapshot syncSnapshot() {
        try {
            String payload = client.post().uri(queryEndpoint)
                    .contentType(MediaType.valueOf("application/sparql-query"))
                    .accept(MediaType.APPLICATION_JSON)
                    .body(PREFIX + "SELECT ?checkpoint WHERE { GRAPH <" + SYNC_GRAPH
                            + "> { <urn:music-kg:personal-sync-state> m:checkpoint ?checkpoint . } } LIMIT 1")
                    .retrieve().body(String.class);
            JsonNode bindings = objectMapper.readTree(payload == null ? "" : payload).path("results").path("bindings");
            if (!bindings.isArray()) throw new GraphAccessException("GRAPHDB_RESULT_INVALID");
            if (bindings.isEmpty()) return new SyncSnapshot(Optional.empty());
            String checkpoint = value(bindings.get(0), "checkpoint");
            return new SyncSnapshot(Optional.of(Instant.parse(checkpoint)));
        } catch (RestClientResponseException exception) {
            throw new GraphAccessException("GRAPHDB_QUERY_REJECTED", exception);
        } catch (ResourceAccessException exception) {
            throw new GraphAccessException("GRAPHDB_UNAVAILABLE", exception);
        } catch (JsonProcessingException | java.time.format.DateTimeParseException exception) {
            throw new GraphAccessException("GRAPHDB_RESULT_INVALID", exception);
        }
    }

    @Override
    public void markSynchronized(Instant checkpoint) {
        if (checkpoint == null) throw new IllegalArgumentException("PERSONAL_GRAPH_CHECKPOINT_REQUIRED");
        update(PREFIX + "DELETE WHERE { GRAPH <" + SYNC_GRAPH
                + "> { <urn:music-kg:personal-sync-state> ?predicate ?object . } }; INSERT DATA { GRAPH <"
                + SYNC_GRAPH + "> { <urn:music-kg:personal-sync-state> m:checkpoint "
                + literal(checkpoint.toString()) + " . } }");
    }

    @Override
    public List<NotionClient.ExistingRecord> retrieveRecords() {
        try {
            String payload = client.post().uri(queryEndpoint)
                    .contentType(MediaType.valueOf("application/sparql-query"))
                    .accept(MediaType.APPLICATION_JSON)
                    .body(PREFIX + """
                            SELECT ?pageId ?albumTitle ?artist ?coverUrl ?sentiment ?favouriteTrack ?owned ?releaseGroupMbid ?lastEditedAt
                            (GROUP_CONCAT(DISTINCT ?artistCredit;separator="|") AS ?artistCredits)
                            WHERE { GRAPH <urn:music-kg:personal> {
                              ?record m:pageId ?pageId ; m:albumTitle ?albumTitle ; m:primaryArtist ?artist ;
                                m:coverUrl ?coverUrl ; m:sentiment ?sentiment ; m:favouriteTrack ?favouriteTrack ;
                                m:owned ?owned ; m:releaseGroupMbid ?releaseGroupMbid ; m:lastEditedAt ?lastEditedAt ;
                                m:artistCredit ?artistCredit .
                            }} GROUP BY ?pageId ?albumTitle ?artist ?coverUrl ?sentiment ?favouriteTrack ?owned ?releaseGroupMbid ?lastEditedAt
                            ORDER BY DESC(?lastEditedAt) ASC(STR(?pageId))
                            """)
                    .retrieve().body(String.class);
            return parseRecords(payload == null ? "" : payload);
        } catch (RestClientResponseException exception) {
            throw new GraphAccessException("GRAPHDB_QUERY_REJECTED", exception);
        } catch (ResourceAccessException exception) {
            throw new GraphAccessException("GRAPHDB_UNAVAILABLE", exception);
        }
    }

    @Override
    public List<ArtistEvidence> retrieveEvidence() {
        return query();
    }

    @Override
    public void verifyReadiness() {
        try {
            client.post().uri(queryEndpoint)
                    .contentType(MediaType.valueOf("application/sparql-query"))
                    .accept(MediaType.APPLICATION_JSON)
                    .body("ASK {}")
                    .retrieve().toBodilessEntity();
        } catch (RestClientResponseException exception) {
            throw new GraphAccessException("GRAPHDB_QUERY_REJECTED", exception);
        } catch (ResourceAccessException exception) {
            throw new GraphAccessException("GRAPHDB_UNAVAILABLE", exception);
        }
    }

    private void update(String update) {
        try {
            client.post().uri("statements")
                    .contentType(MediaType.valueOf("application/sparql-update"))
                    .body(update).retrieve().toBodilessEntity();
        } catch (RestClientResponseException exception) {
            throw new GraphAccessException("GRAPHDB_PROJECTION_REJECTED", exception);
        } catch (ResourceAccessException exception) {
            throw new GraphAccessException("GRAPHDB_UNAVAILABLE", exception);
        }
    }

    private List<ArtistEvidence> query() {
        try {
            String payload = client.post().uri(queryEndpoint)
                    .contentType(MediaType.valueOf("application/sparql-query"))
                    .accept(MediaType.APPLICATION_JSON)
                    .body(PREFIX + """
                            SELECT ?artist (SUM(?weight) AS ?score)
                            (GROUP_CONCAT(DISTINCT ?pageId;separator="|") AS ?recordPageIds)
                            WHERE { GRAPH <urn:music-kg:personal> {
                              ?record m:artist ?artist ; m:weight ?weight ; m:pageId ?pageId .
                              FILTER(?weight > 0)
                            }}
                            GROUP BY ?artist ORDER BY DESC(?score) ASC(STR(?artist)) LIMIT 3
                            """).retrieve().body(String.class);
            return parse(payload == null ? "" : payload);
        } catch (RestClientResponseException exception) {
            throw new GraphAccessException("GRAPHDB_QUERY_REJECTED", exception);
        } catch (ResourceAccessException exception) {
            throw new GraphAccessException("GRAPHDB_UNAVAILABLE", exception);
        }
    }

    private List<ArtistEvidence> parse(String payload) {
        try {
            JsonNode bindings = objectMapper.readTree(payload).path("results").path("bindings");
            if (!bindings.isArray()) throw new GraphAccessException("GRAPHDB_RESULT_INVALID");
            List<ArtistEvidence> values = new ArrayList<>();
            for (JsonNode binding : bindings) {
                String artist = value(binding, "artist");
                String score = value(binding, "score");
                String pageIds = value(binding, "recordPageIds");
                values.add(new ArtistEvidence(artist, Long.parseLong(score), List.of(pageIds.split("\\|"))));
            }
            return List.copyOf(values);
        } catch (JsonProcessingException | NumberFormatException exception) {
            throw new GraphAccessException("GRAPHDB_RESULT_INVALID", exception);
        }
    }

    private List<NotionClient.ExistingRecord> parseRecords(String payload) {
        try {
            JsonNode bindings = objectMapper.readTree(payload).path("results").path("bindings");
            if (!bindings.isArray()) throw new GraphAccessException("GRAPHDB_RESULT_INVALID");
            List<NotionClient.ExistingRecord> records = new ArrayList<>();
            for (JsonNode binding : bindings) {
                String artist = value(binding, "artist");
                String credits = value(binding, "artistCredits");
                records.add(new NotionClient.ExistingRecord(
                        value(binding, "pageId"), value(binding, "albumTitle"), artist, optionalValue(binding, "coverUrl"),
                        optionalValue(binding, "sentiment"), optionalValue(binding, "favouriteTrack"),
                        Boolean.parseBoolean(optionalValue(binding, "owned")), optionalValue(binding, "releaseGroupMbid"),
                        List.of(credits.split("\\|")), Instant.parse(value(binding, "lastEditedAt"))));
            }
            return List.copyOf(records);
        } catch (JsonProcessingException | java.time.format.DateTimeParseException exception) {
            throw new GraphAccessException("GRAPHDB_RESULT_INVALID", exception);
        }
    }

    private static String value(JsonNode binding, String name) {
        String value = binding.path(name).path("value").asText();
        if (value.isBlank()) throw new GraphAccessException("GRAPHDB_RESULT_INVALID");
        return value;
    }

    private static String optionalValue(JsonNode binding, String name) {
        return binding.path(name).path("value").asText();
    }

    private static String bootstrap(List<NotionClient.ExistingRecord> history) {
        StringBuilder triples = new StringBuilder();
        for (NotionClient.ExistingRecord record : history) {
            triples.append(recordTriples(record));
        }
        return PREFIX + "CLEAR GRAPH <" + GRAPH + ">; CLEAR GRAPH <" + SYNC_GRAPH
                + ">; INSERT DATA { GRAPH <" + GRAPH + "> { " + triples + " } }";
    }

    private static String replace(NotionClient.ExistingRecord record) {
        return remove(record.pageId()) + " INSERT DATA { GRAPH <" + GRAPH + "> { " + recordTriples(record)
                + " } GRAPH <" + SYNC_GRAPH + "> { " + recordIri(record.pageId()) + " m:pageId "
                + literal(record.pageId()) + " ; m:lastEditedAt " + literal(record.lastEditedAt().toString()) + " . } }";
    }

    private static String remove(String pageId) {
        return PREFIX + "DELETE WHERE { GRAPH <" + GRAPH + "> { ?record m:pageId " + literal(pageId)
                + " ; ?predicate ?object . } }; DELETE WHERE { GRAPH <" + SYNC_GRAPH + "> { ?record m:pageId "
                + literal(pageId) + " ; ?predicate ?object . } };";
    }

    private static String recordTriples(NotionClient.ExistingRecord record) {
        StringBuilder triples = new StringBuilder();
        triples.append(recordIri(record.pageId())).append(" m:pageId ").append(literal(record.pageId()))
                .append(" ; m:albumTitle ").append(literal(record.albumTitle()))
                .append(" ; m:primaryArtist ").append(literal(record.artist()))
                .append(" ; m:coverUrl ").append(literal(record.coverUrl()))
                .append(" ; m:sentiment ").append(literal(record.sentiment()))
                .append(" ; m:favouriteTrack ").append(literal(record.favouriteTrack()))
                .append(" ; m:owned ").append(literal(Boolean.toString(record.owned())))
                .append(" ; m:releaseGroupMbid ").append(literal(record.releaseGroupMbid()))
                .append(" ; m:lastEditedAt ").append(literal(record.lastEditedAt().toString())).append(" . ");
        for (String artist : record.artistCredits().stream().distinct().toList()) {
            triples.append(recordIri(record.pageId())).append(" m:artistCredit ").append(literal(artist))
                    .append(" ; m:artist ").append(literal(artist))
                    .append(" ; m:weight ").append(weight(record))
                    .append(" . ");
        }
        return triples.toString();
    }

    private static String recordIri(String pageId) {
        return "<urn:music-kg:record:" + escapeIri(pageId) + ">";
    }

    private static long weight(NotionClient.ExistingRecord record) {
        return PersonalTasteWeights.weight(record);
    }

    private static String literal(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private static String escapeIri(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    public static final class GraphAccessException extends RuntimeException {
        public GraphAccessException(String code) {
            super(code);
        }

        public GraphAccessException(String code, Throwable cause) {
            super(code, cause);
        }
    }
}
