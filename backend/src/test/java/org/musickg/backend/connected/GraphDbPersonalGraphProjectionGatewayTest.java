package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.musickg.backend.notion.NotionClient;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GraphDbPersonalGraphProjectionGatewayTest {
    @Test
    void projectsTheCurrentNotionSnapshotThenRetrievesRankedArtistEvidenceFromGraphDb() {
        // Given a private GraphDB repository and one real personal-record snapshot
        var builder = RestClient.builder().baseUrl("http://graphdb.test/repositories/music-kg-personal/");
        var server = MockRestServiceServer.bindTo(builder).build();
        var graph = new GraphDbPersonalGraphProjectionGateway(
                builder.build(), new ObjectMapper(), "http://graphdb.test/repositories/music-kg-personal");
        List<NotionClient.ExistingRecord> history = List.of(
                new NotionClient.ExistingRecord("page-a", "Album A", "Artist A", "", "애착 앨범", "Track A", true,
                        "release-a", List.of("Artist A"), Instant.parse("2026-08-10T00:00:00Z")),
                new NotionClient.ExistingRecord("page-b", "Album B", "Artist A", "", "", "", false,
                        "release-b", List.of("Artist A"), Instant.parse("2026-08-09T00:00:00Z")));

        server.expect(requestTo("http://graphdb.test/repositories/music-kg-personal/statements"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType("application/sparql-update"))
                .andExpect(content().string(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("PREFIX m: <https://w3id.org/music-kg-graphrag/personal#>"),
                        org.hamcrest.Matchers.containsString("GRAPH <urn:music-kg:personal>"),
                        org.hamcrest.Matchers.containsString("\"Artist A\""),
                        org.hamcrest.Matchers.containsString("<urn:music-kg:record:cGFnZS1h>"))))
                .andRespond(withSuccess());
        server.expect(requestTo("http://graphdb.test/repositories/music-kg-personal"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType("application/sparql-query"))
                .andRespond(withSuccess("""
                        {"head":{"vars":["artist","score","recordPageIds"]},"results":{"bindings":[
                          {"artist":{"type":"literal","value":"Artist A"},"score":{"type":"literal","value":"6"},
                           "recordPageIds":{"type":"literal","value":"page-a|page-b"}}
                        ]}}
                        """, MediaType.APPLICATION_JSON));

        // When the recommendation layer requests graph-backed personal evidence
        List<PersonalGraphProjectionGateway.ArtistEvidence> evidence = graph.projectAndRetrieve(history);

        // Then it receives GraphDB's ranked path evidence, not an in-process approximation
        assertThat(evidence).containsExactly(new PersonalGraphProjectionGateway.ArtistEvidence("Artist A", 6, List.of("page-a", "page-b")));
        assertThat(graph.retrievalMethod()).isEqualTo("PERSISTENT_GRAPHDB_PERSONAL_EVIDENCE_RETRIEVAL");
        server.verify();
    }
}
