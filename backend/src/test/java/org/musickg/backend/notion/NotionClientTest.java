package org.musickg.backend.notion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;

class NotionClientTest {
    private static final ConnectedServiceProperties.Notion.Fields FIELDS = new ConnectedServiceProperties.Notion.Fields(
            "앨범명", "가수", "앨범커버", "개인 감상평", "개인 최애곡", "앨범 보유", "MusicBrainz MBID");

    @Test
    void createsRecordUsingOnlyTheConfiguredDataSourceAndKoreanUserFields() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/pages"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andExpect(header("Notion-Version", "2026-03-11"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {"parent":{"data_source_id":"data-source-id"},"properties":{"앨범명":{"title":[{"text":{"content":"Kind of Blue"}}]},"가수":{"multi_select":[{"name":"Miles Davis"}]},"앨범커버":{"files":[{"name":"cover","type":"external","external":{"url":"https:\\/\\/cover.example/kind-of-blue.jpg"}}]},"개인 감상평":{"select":{"name":"애착 앨범"}},"개인 최애곡":{"rich_text":[{"text":{"content":"So What"}}]},"앨범 보유":{"checkbox":true}}}
                        """))
                .andRespond(withSuccess("{\"id\":\"page-id\",\"last_edited_time\":\"2026-08-10T00:00:00.000Z\"}", MediaType.APPLICATION_JSON));

        var saved = client.create(new NotionClient.Record("Kind of Blue", "Miles Davis", "https:" + "//cover.example/kind-of-blue.jpg", "애착 앨범", "So What", true));

        assertThat(saved.pageId()).isEqualTo("page-id");
        server.verify();
    }

    @Test
    void trimsSecretManagerTrailingWhitespaceBeforeConstructingTheNotionAuthorizationHeader() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token\n", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andRespond(withSuccess("""
                        {"properties":{"개인 감상평":{"select":{"options":[{"name":"Loved"}]}}}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.sentimentOptions()).containsExactly("Loved");
        server.verify();
    }

    @Test
    void writesTheSelectedMusicBrainzReleaseGroupIdToTheConfiguredProperty() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var fields = new ConnectedServiceProperties.Notion.Fields(
                "앨범명", "가수", "앨범커버", "개인 감상평", "개인 최애곡", "앨범 보유", "MusicBrainz MBID");
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", fields));

        server.expect(requestTo("https://api.notion.com/v1/pages"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"parent":{"data_source_id":"data-source-id"},"properties":{"MusicBrainz MBID":{"rich_text":[{"text":{"content":"release-group-id"}}]}}}
                        """, false))
                .andRespond(withSuccess("{\"id\":\"page-id\",\"last_edited_time\":\"2026-08-10T00:00:00.000Z\"}", MediaType.APPLICATION_JSON));

        client.create(new NotionClient.Record(
                "Kind of Blue", "Miles Davis", "", "애착 앨범", "So What", true, "release-group-id"));

        server.verify();
    }

    @Test
    void readsExistingMusicRecordsFromTheConfiguredDataSource() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id/query"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andExpect(content().json("{\"page_size\":100}"))
                .andRespond(withSuccess("""
                        {"results":[{"id":"page-id","last_edited_time":"2026-08-10T00:00:00.000Z","properties":{"앨범명":{"title":[{"plain_text":"Kind of Blue"}]},"가수":{"multi_select":[{"name":"Miles Davis"}]},"앨범커버":{"files":[{"type":"external","external":{"url":"https:\\/\\/cover.example/kind-of-blue.jpg"}}]},"개인 감상평":{"select":{"name":"애착 앨범"}},"개인 최애곡":{"rich_text":[{"plain_text":"So What"}]},"앨범 보유":{"checkbox":true}}}],"has_more":false,"next_cursor":null}
                        """, MediaType.APPLICATION_JSON));

        var records = client.list();

        assertThat(records).containsExactly(new NotionClient.ExistingRecord("page-id", "Kind of Blue", "Miles Davis", "https:" + "//cover.example/kind-of-blue.jpg", "애착 앨범", "So What", true, "", List.of("Miles Davis"), Instant.parse("2026-08-10T00:00:00.000Z")));
        server.verify();
    }

    @Test
    void findsOneExistingRecordByItsMusicBrainzReleaseGroupWithoutReadingTheWholeHistory() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id/query"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"page_size":1,"filter":{"property":"MusicBrainz MBID","rich_text":{"equals":"release-group-id"}}}
                        """))
                .andRespond(withSuccess("""
                        {"results":[{"id":"page-id","last_edited_time":"2026-08-10T00:00:00.000Z","properties":{"?⑤쾾紐?":{"title":[{"plain_text":"Kind of Blue"}]},"媛??":{"multi_select":[{"name":"Miles Davis"}]},"?⑤쾾而ㅻ쾭":{"files":[]},"媛쒖씤 媛먯긽??":{"select":{"name":"Loved"}},"媛쒖씤 理쒖븷怨?":{"rich_text":[{"plain_text":"So What"}]},"?⑤쾾 蹂댁쑀":{"checkbox":true},"MusicBrainz MBID":{"rich_text":[{"plain_text":"release-group-id"}]}}}],"has_more":false}
                        """, MediaType.APPLICATION_JSON));

        var record = client.findByReleaseGroupMbid("release-group-id");

        assertThat(record).hasValueSatisfying(value -> assertThat(value.pageId()).isEqualTo("page-id"));
        server.verify();
    }

    @Test
    void ignoresIncompleteNotionPagesInsteadOfFailingEveryPersonalInsight() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        String response = new ObjectMapper().writeValueAsString(Map.of(
                "results", List.of(
                        Map.of("id", "unfinished-page", "properties", Map.of(
                                FIELDS.albumTitle(), Map.of("title", List.of()),
                                FIELDS.artist(), Map.of("multi_select", List.of()))),
                        Map.of("id", "page-id", "properties", Map.of(
                                FIELDS.albumTitle(), Map.of("title", List.of(Map.of("plain_text", "Kind of Blue"))),
                                FIELDS.artist(), Map.of("multi_select", List.of(Map.of("name", "Miles Davis"))),
                                FIELDS.cover(), Map.of("files", List.of()),
                                FIELDS.sentiment(), Map.of("select", Map.of("name", "Loved")),
                                FIELDS.favouriteTrack(), Map.of("rich_text", List.of(Map.of("plain_text", "So What"))),
                                FIELDS.owned(), Map.of("checkbox", true)))),
                "has_more", false));
        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id/query"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        var records = client.list();

        assertThat(records).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-id");
        server.verify();
    }

    @Test
    void updatesTheExistingNotionPageInsteadOfCreatingAnotherRecord() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/pages/page-id"))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andExpect(content().json("""
                        {"properties":{"앨범명":{"title":[{"text":{"content":"Kind of Blue"}}]},"가수":{"multi_select":[{"name":"Miles Davis"}]},"앨범커버":{"files":[]},"개인 감상평":{"select":{"name":"애착 앨범"}},"개인 최애곡":{"rich_text":[{"text":{"content":"Freddie Freeloader"}}]},"앨범 보유":{"checkbox":false}}}
                        """))
                .andRespond(withSuccess("{\"id\":\"page-id\",\"last_edited_time\":\"2026-08-10T00:00:00.000Z\"}", MediaType.APPLICATION_JSON));

        var saved = client.update("page-id", new NotionClient.Record("Kind of Blue", "Miles Davis", "", "애착 앨범", "Freddie Freeloader", false));

        assertThat(saved.pageId()).isEqualTo("page-id");
        server.verify();
    }

    @Test
    void readsTheActualSentimentOptionsFromTheConfiguredDataSource() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andRespond(withSuccess("""
                        {"properties":{"개인 감상평":{"select":{"options":[{"name":"애착 앨범"},{"name":"마음에 쏙"}]}}}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.sentimentOptions()).containsExactly("애착 앨범", "마음에 쏙");
        server.verify();
    }

    @Test
    void mapsAnUnsharedDataSourceToANonLeakingConnectionError() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{\"code\":\"object_not_found\"}").contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(client::sentimentOptions)
                .isInstanceOf(NotionClient.AccessException.class)
                .hasMessage("NOTION_CONNECTION_NOT_SHARED");
        server.verify();
    }

    @Test
    void mapsProviderRateLimitsToARetryableDomainError() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new NotionClient(builder.build(), new ObjectMapper(), new ConnectedServiceProperties.Notion("secret-token", "data-source-id", FIELDS));

        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("{\"code\":\"rate_limited\"}").contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(client::sentimentOptions)
                .isInstanceOf(NotionClient.AccessException.class)
                .hasMessage("NOTION_RATE_LIMITED");
        server.verify();
    }
}
