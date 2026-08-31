package org.musickg.backend.notion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class NotionCatalogIdentityTest {
    @Test
    void storesITunesIdentityOutsideTheMusicBrainzProperties() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var fields = new ConnectedServiceProperties.Notion.Fields(
                "앨범명", "가수", "앨범커버", "개인 감상평", "개인 최애곡", "앨범 보유",
                "MusicBrainz MBID", "MusicBrainz Release MBID", "", "", "", "", "Catalog Source", "Catalog ID");
        var client = new NotionClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.Notion("secret-token", "data-source-id", fields));
        server.expect(requestTo("https://api.notion.com/v1/pages"))
                .andExpect(content().json("""
                        {"parent":{"data_source_id":"data-source-id"},"properties":{
                          "Catalog Source":{"rich_text":[{"text":{"content":"ITUNES"}}]},
                          "Catalog ID":{"rich_text":[{"text":{"content":"123456789"}}]}
                        }}
                        """, false))
                .andRespond(withSuccess("{\"id\":\"page-id\",\"last_edited_time\":\"2026-08-10T00:00:00.000Z\"}", MediaType.APPLICATION_JSON));

        var saved = client.create(new NotionClient.Record("새 음반", "극동아시아타이거즈", "", "Loved", "첫 곡", false,
                "", "", List.of("극동아시아타이거즈"), "", "", "", "", "ITUNES", "123456789"));

        assertThat(saved.pageId()).isEqualTo("page-id");
        server.verify();
    }

    @Test
    void findsAnExistingITunesRecordBySourceAndCollectionIdWithoutReadingTheArchive() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var fields = new ConnectedServiceProperties.Notion.Fields(
                "앨범명", "가수", "앨범커버", "개인 감상평", "개인 최애곡", "앨범 보유",
                "MusicBrainz MBID", "MusicBrainz Release MBID", "", "", "", "", "Catalog Source", "Catalog ID");
        var client = new NotionClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.Notion("secret-token", "data-source-id", fields));
        server.expect(requestTo("https://api.notion.com/v1/data_sources/data-source-id/query"))
                .andExpect(content().json("""
                        {"page_size":1,"filter":{"and":[
                          {"property":"Catalog Source","rich_text":{"equals":"ITUNES"}},
                          {"property":"Catalog ID","rich_text":{"equals":"123456789"}}
                        ]}}
                        """))
                .andRespond(withSuccess("""
                        {"results":[{"id":"page-id","last_edited_time":"2026-08-10T00:00:00.000Z","properties":{
                          "앨범명":{"title":[{"plain_text":"새 음반"}]},"가수":{"multi_select":[{"name":"극동아시아타이거즈"}]},
                          "앨범커버":{"files":[]},"개인 감상평":{"select":{"name":"Loved"}},"개인 최애곡":{"rich_text":[{"plain_text":"첫 곡"}]},"앨범 보유":{"checkbox":false},
                          "Catalog Source":{"rich_text":[{"plain_text":"ITUNES"}]},"Catalog ID":{"rich_text":[{"plain_text":"123456789"}]}
                        }}],"has_more":false}
                        """, MediaType.APPLICATION_JSON));

        var record = client.findByCatalogIdentity("ITUNES", "123456789");

        assertThat(record).hasValueSatisfying(value -> {
            assertThat(value.catalogSource()).isEqualTo("ITUNES");
            assertThat(value.catalogId()).isEqualTo("123456789");
        });
        server.verify();
    }
}
