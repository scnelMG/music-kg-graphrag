package org.musickg.backend.connected;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.musickg.backend.notion.NotionClient;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

public final class GraphDbPersonalGraphProjectionGateway implements PersonalGraphProjectionGateway {
    private static final String GRAPH = "urn:music-kg:personal";
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
        update(project(history));
        return query();
    }

    @Override
    public String retrievalMethod() {
        return "PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL";
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

    private static String value(JsonNode binding, String name) {
        String value = binding.path(name).path("value").asText();
        if (value.isBlank()) throw new GraphAccessException("GRAPHDB_RESULT_INVALID");
        return value;
    }

    private static String project(List<NotionClient.ExistingRecord> history) {
        StringBuilder triples = new StringBuilder();
        for (NotionClient.ExistingRecord record : history) {
            triples.append('<').append("urn:music-kg:record:").append(escapeIri(record.pageId())).append("> ")
                    .append("m:pageId ").append(literal(record.pageId())).append(" ; ")
                    .append("m:artist ").append(literal(record.artist())).append(" ; ")
                    .append("m:weight ").append(weight(record)).append(" ; ")
                    .append("m:releaseGroupMbid ").append(literal(record.releaseGroupMbid())).append(" . ");
        }
        return PREFIX + "CLEAR GRAPH <" + GRAPH + ">; INSERT DATA { GRAPH <" + GRAPH + "> { " + triples + " } }";
    }

    private static long weight(NotionClient.ExistingRecord record) {
        return 1L + (record.owned() ? 2L : 0L)
                + (record.favouriteTrack().isBlank() ? 0L : 1L)
                + (record.sentiment().isBlank() ? 0L : 1L);
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
