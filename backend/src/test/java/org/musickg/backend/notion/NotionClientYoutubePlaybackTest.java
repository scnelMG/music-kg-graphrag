package org.musickg.backend.notion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class NotionClientYoutubePlaybackTest {
    @Test
    void writesTheExplicitlyConfirmedYouTubeMappingAlongsideTheMusicBrainzRecording() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var fields = new ConnectedServiceProperties.Notion.Fields(
                "Album", "Artist", "Cover", "Sentiment", "Favourite", "Owned", "Release group", "Release",
                "YouTube Recording MBID", "YouTube Video ID", "YouTube Video Title", "YouTube Channel");
        var client = new NotionClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.Notion("secret-token", "data-source-id", fields));

        server.expect(requestTo("https://api.notion.com/v1/pages"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"properties":{"YouTube Recording MBID":{"rich_text":[{"text":{"content":"recording-id"}}]},"YouTube Video ID":{"rich_text":[{"text":{"content":"dQw4w9WgXcQ"}}]},"YouTube Video Title":{"rich_text":[{"text":{"content":"Artist - Track (Official Audio)"}}]},"YouTube Channel":{"rich_text":[{"text":{"content":"Artist Official"}}]}}}
                        """, false))
                .andRespond(withSuccess("{\"id\":\"page-id\",\"last_edited_time\":\"2026-08-16T00:00:00.000Z\"}", MediaType.APPLICATION_JSON));

        var saved = client.create(new NotionClient.Record(
                "Album", "Artist", "", "Loved", "Track", false, "release-group-id", "release-id", List.of("Artist"),
                "recording-id", "dQw4w9WgXcQ", "Artist - Track (Official Audio)", "Artist Official"));

        assertThat(saved.pageId()).isEqualTo("page-id");
        server.verify();
    }
}
