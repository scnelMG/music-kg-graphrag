package org.musickg.backend.connected;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.musickg.backend.api.ApiProperties;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.musickg.backend.notion.NotionClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(properties = {"music-kg.connected.mode=connected", "music-kg.api.bff-shared-secret=connected-test-secret"}, controllers = ConnectedMusicApiController.class)
@Import(ConnectedMusicApiControllerTest.PropertiesConfiguration.class)
class ConnectedMusicApiControllerTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ConnectedMusicService service;

    @Test
    void returnsOnlyRealCatalogFieldsForAnAlbumSearch() throws Exception {
        given(service.search("Kind of Blue")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group-id", "Kind of Blue", "Miles Davis", "1959-08-17", "https:" + "//cover.example/kind-of-blue.jpg")));

        mvc.perform(get("/api/v1/catalog/albums").header("X-Music-Kg-Bff-Secret", "connected-test-secret").param("q", "Kind of Blue"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].releaseGroupMbid").value("release-group-id"))
                .andExpect(jsonPath("$[0].title").value("Kind of Blue"))
                .andExpect(jsonPath("$[0].coverUrl").value("https:" + "//cover.example/kind-of-blue.jpg"));
    }

    @Test
    void exposesConfiguredNotionSentimentsInsteadOfAClientSideFixtureList() throws Exception {
        given(service.sentimentOptions()).willReturn(List.of("애착 앨범", "마음에 쏙"));

        mvc.perform(get("/api/v1/listening-records/form-options").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentiments[0]").value("애착 앨범"))
                .andExpect(jsonPath("$.sentiments[1]").value("마음에 쏙"));
    }

    @Test
    void returnsATypedActionableErrorWhenTheNotionDataSourceIsNotShared() throws Exception {
        given(service.sentimentOptions()).willThrow(new NotionClient.AccessException("NOTION_CONNECTION_NOT_SHARED"));

        mvc.perform(get("/api/v1/listening-records/form-options").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTION_CONNECTION_NOT_SHARED"));
    }

    @Test
    void returnsARetryableTypedErrorWhenNotionRateLimitsThePersonalDataRequest() throws Exception {
        given(service.sentimentOptions()).willThrow(new NotionClient.AccessException("NOTION_RATE_LIMITED"));

        mvc.perform(get("/api/v1/listening-records/form-options").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("NOTION_RATE_LIMITED"));
    }

    @Test
    void returnsARecoverable503WhenTheNotionProviderIsTemporarilyUnavailable() throws Exception {
        given(service.sentimentOptions()).willThrow(new NotionClient.AccessException("NOTION_UNAVAILABLE"));

        mvc.perform(get("/api/v1/listening-records/form-options").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("NOTION_UNAVAILABLE"));
    }

    @Test
    void exposesTasteAndRecommendationFromOnePersonalInsightsContract() throws Exception {
        var taste = new ConnectedMusicService.TasteProfile(1,
                List.of(new ConnectedMusicService.Count("Artist", 1)),
                List.of(new ConnectedMusicService.Count("Loved", 1)),
                List.of(new ConnectedMusicService.Count("Track", 1)));
        var graphTaste = new ConnectedMusicService.GraphTaste(1, "Artist", List.of("page-1"), List.of());
        given(service.personalInsights()).willReturn(new ConnectedMusicService.PersonalInsights(taste, graphTaste));

        mvc.perform(get("/api/v1/personal-insights").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taste.recordCount").value(1))
                .andExpect(jsonPath("$.graphTaste.seedArtist").value("Artist"))
                .andExpect(jsonPath("$.graphTaste.evidencePageIds[0]").value("page-1"));
    }

    @Test
    void exposesTheActualPersonalGraphRetrievalMethodInsteadOfAFixtureLabel() throws Exception {
        var graphTaste = new ConnectedMusicService.GraphTaste(1, "Artist", List.of("page-1"), List.of());
        given(service.graphTaste()).willReturn(graphTaste);

        mvc.perform(get("/api/v1/graphrag/taste").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.retrievalMethod").value("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"))
                .andExpect(jsonPath("$.generatedByLlm").value(false));
    }

    @TestConfiguration
    @EnableConfigurationProperties({ApiProperties.class, ConnectedServiceProperties.class})
    static class PropertiesConfiguration {}
}
