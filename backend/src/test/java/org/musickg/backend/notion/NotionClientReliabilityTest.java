package org.musickg.backend.notion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.web.client.RestClient;

class NotionClientReliabilityTest {
    private static final ConnectedServiceProperties.Notion.Fields FIELDS = new ConnectedServiceProperties.Notion.Fields(
            "Album", "Artists", "Cover", "Sentiment", "Favourite track", "Owned", "Release group MBID");

    @Test
    void cachesAReadSnapshotAndInvalidatesItAfterArchivingTheRecord() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("test-token", "source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/source-id/query"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(recordsResponse("page-1"), MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.notion.com/v1/pages/page-1"))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(content().json("{\"in_trash\":true}"))
                .andRespond(withSuccess("{\"id\":\"page-1\",\"last_edited_time\":\"2026-08-11T00:00:00Z\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.notion.com/v1/data_sources/source-id/query"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"results\":[],\"has_more\":false}", MediaType.APPLICATION_JSON));

        assertThat(client.list()).hasSize(1);
        assertThat(client.list()).hasSize(1);
        client.archive("page-1");

        assertThat(client.list()).isEmpty();
        server.verify();
    }

    @Test
    void retainsEveryConfiguredNotionArtistInsteadOfSilentlyKeepingOnlyTheFirst() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("test-token", "source-id", FIELDS));
        String response = """
                {"results":[{"id":"page-1","properties":{"Album":{"title":[{"plain_text":"Collaboration"}]},"Artists":{"multi_select":[{"name":"Artist A"},{"name":"Artist B"}]},"Cover":{"files":[]},"Sentiment":{"select":{"name":"Loved"}},"Favourite track":{"rich_text":[{"plain_text":"Track"}]},"Owned":{"checkbox":false},"Release group MBID":{"rich_text":[{"plain_text":"release-group-id"}]}}}],"has_more":false}
                """;
        server.expect(requestTo("https://api.notion.com/v1/data_sources/source-id/query"))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        var record = client.list().getFirst();

        assertThat(record.artistCredits()).containsExactly("Artist A", "Artist B");
        server.verify();
    }

    @Test
    void mapsAnUnavailableNotionProviderToATypedRetryableFailure() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("test-token", "source-id", FIELDS));
        server.expect(ExpectedCount.times(3), requestTo("https://api.notion.com/v1/data_sources/source-id"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(client::sentimentOptions)
                .isInstanceOf(NotionClient.AccessException.class)
                .hasMessage("NOTION_UNAVAILABLE");
        server.verify();
    }

    private static String recordsResponse(String pageId) {
        return """
                {"results":[{"id":"%s","properties":{"Album":{"title":[{"plain_text":"Kind of Blue"}]},"Artists":{"multi_select":[{"name":"Miles Davis"}]},"Cover":{"files":[]},"Sentiment":{"select":{"name":"Loved"}},"Favourite track":{"rich_text":[{"plain_text":"So What"}]},"Owned":{"checkbox":true},"Release group MBID":{"rich_text":[{"plain_text":"release-group-id"}]}}}],"has_more":false}
                """.formatted(pageId);
    }
}
