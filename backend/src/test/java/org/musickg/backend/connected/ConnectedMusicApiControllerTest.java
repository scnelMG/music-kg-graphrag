package org.musickg.backend.connected;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.api.ApiProperties;
import org.musickg.backend.catalog.MusicBrainzClient;
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
@Import({ConnectedMusicApiControllerTest.PropertiesConfiguration.class, ConnectedOperationMetrics.class})
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
    void exploresOnlyTheDeclaredPublicGenreThroughTheRealCatalog() throws Exception {
        given(service.searchByTag("dream pop")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group-id", "Dream Album", "Dream Artist", "2024-01-01", "")));

        mvc.perform(get("/api/v1/catalog/explore").header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .param("genre", "dream-pop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Dream Album"));

        verify(service).searchByTag("dream pop");
    }

    @Test
    void rejectsAnUndeclaredPublicGenreBeforeContactingTheCatalog() throws Exception {
        mvc.perform(get("/api/v1/catalog/explore").header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .param("genre", "made-up-genre"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        verifyNoInteractions(service);
    }

    @Test
    void returnsABoundedPublicEditionPageForTheSelectedAlbum() throws Exception {
        given(service.editions("group-id", null, "stored-release")).willReturn(new MusicCatalogGateway.EditionPage(
                List.of(new MusicCatalogGateway.Edition(
                        "release-id", "group-id", "Kind of Blue", "1997-01-01", "US", "Official", "Remaster", true)),
                "20", true));

        mvc.perform(get("/api/v1/catalog/albums/group-id/editions")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("selected", "stored-release"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editions[0].releaseMbid").value("release-id"))
                .andExpect(jsonPath("$.editions[0].recommended").value(true))
                .andExpect(jsonPath("$.nextCursor").value("20"))
                .andExpect(jsonPath("$.hasMore").value(true));

        verify(service).editions("group-id", null, "stored-release");
    }

    @Test
    void forwardsTheEditionCursorWithoutRequestingAnUnboundedCollection() throws Exception {
        given(service.editions("group-id", "20", null)).willReturn(new MusicCatalogGateway.EditionPage(
                List.of(new MusicCatalogGateway.Edition(
                        "release-20", "group-id", "Kind of Blue", "2000-01-01", "JP", "Official", "", false)),
                "40", true));

        mvc.perform(get("/api/v1/catalog/albums/group-id/editions")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("cursor", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editions[0].releaseMbid").value("release-20"))
                .andExpect(jsonPath("$.nextCursor").value("40"));

        verify(service).editions("group-id", "20", null);
    }

    @Test
    void rejectsAnEditionCursorOutsideTheIntegerDomainAsAMalformedRequest() throws Exception {
        mvc.perform(get("/api/v1/catalog/albums/group-id/editions")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("cursor", "999999999999999999999"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verifyNoInteractions(service);
    }

    @Test
    void loadsTracksForTheExplicitSelectedEdition() throws Exception {
        given(service.tracks("group-id", "release-id")).willReturn(List.of(
                new MusicCatalogGateway.Track("recording-id", "Actual Track", 1)));

        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("edition", "release-id"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Actual Track"));

        verify(service).tracks("group-id", "release-id");
    }

    @Test
    void rejectsABlankEditionBeforeCallingTheCatalog() throws Exception {
        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("edition", " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verifyNoInteractions(service);
    }

    @Test
    void rejectsAnOmittedEditionBeforeCallingTheCatalog() throws Exception {
        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verifyNoInteractions(service);
    }

    @Test
    void rejectsSavingARecordWithoutTheChosenReleaseMbid() throws Exception {
        mvc.perform(post("/api/v1/listening-records")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("""
                                {"releaseGroupMbid":"group-id","albumTitle":"Kind of Blue","artist":"Miles Davis","sentiment":"Loved","favouriteTrack":"So What","owned":false}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        verifyNoInteractions(service);
    }

    @Test
    void reportsAForeignEditionAsATypedClientError() throws Exception {
        MusicBrainzClient.CatalogAccessException exception = mock(MusicBrainzClient.CatalogAccessException.class);
        given(exception.code()).willReturn("MUSICBRAINZ_RELEASE_NOT_IN_GROUP");
        given(exception.retryable()).willReturn(false);
        given(service.tracks("group-id", "foreign-release-id")).willThrow(exception);

        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("edition", "foreign-release-id"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("MUSICBRAINZ_RELEASE_NOT_IN_GROUP"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verify(service).tracks("group-id", "foreign-release-id");
    }

    @Test
    void reportsAForeignEditionAsATypedClientErrorWhenSavingARecord() throws Exception {
        MusicBrainzClient.CatalogAccessException exception = mock(MusicBrainzClient.CatalogAccessException.class);
        given(exception.code()).willReturn("MUSICBRAINZ_RELEASE_NOT_IN_GROUP");
        given(exception.retryable()).willReturn(false);
        given(service.save(org.mockito.ArgumentMatchers.any())).willThrow(exception);

        mvc.perform(post("/api/v1/listening-records")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("""
                                {"releaseGroupMbid":"group-id","releaseMbid":"foreign-release-id","albumTitle":"Kind of Blue","artist":"Miles Davis","sentiment":"Loved","favouriteTrack":"So What","owned":false}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("MUSICBRAINZ_RELEASE_NOT_IN_GROUP"));

        verify(service).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void preservesBadGatewayForANonRetryableMusicBrainzProviderError() throws Exception {
        MusicBrainzClient.CatalogAccessException exception = mock(MusicBrainzClient.CatalogAccessException.class);
        given(exception.code()).willReturn("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR");
        given(exception.retryable()).willReturn(false);
        given(service.tracks("group-id", "release-id")).willThrow(exception);

        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("edition", "release-id"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("MUSICBRAINZ_RESPONSE_CONTRACT_ERROR"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verify(service).tracks("group-id", "release-id");
    }

    @Test
    void returnsRecoverableServiceUnavailableForARetryableExplicitEditionTrackFailure() throws Exception {
        MusicBrainzClient.CatalogAccessException exception = mock(MusicBrainzClient.CatalogAccessException.class);
        given(exception.code()).willReturn("MUSICBRAINZ_UNAVAILABLE");
        given(exception.retryable()).willReturn(true);
        given(service.tracks("group-id", "release-id")).willThrow(exception);

        mvc.perform(get("/api/v1/catalog/albums/group-id/tracks")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("edition", "release-id"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("MUSICBRAINZ_UNAVAILABLE"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verify(service).tracks("group-id", "release-id");
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
    void returnsOnlyTheRequestedPageOfPersonalNotionRecords() throws Exception {
        given(service.recordsPage(12, "next-cursor")).willReturn(new NotionClient.RecordPage(List.of(
                new NotionClient.ExistingRecord("page-1", "Kind of Blue", "Miles Davis", "", "Loved", "So What", true)),
                "following-cursor"));

        mvc.perform(get("/api/v1/listening-records/page").header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .param("limit", "12").param("cursor", "next-cursor"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].pageId").value("page-1"))
                .andExpect(jsonPath("$.nextCursor").value("following-cursor"));
    }

    @Test
    void returnsAnAuthoritativeExistingRecordOutsideTheClientsLoadedPage() throws Exception {
        var existing = new NotionClient.ExistingRecord(
                "page-13", "Later record", "Artist", "", "Loved", "Saved favourite", true,
                "release-group-later", "release-later", List.of("Artist"), java.time.Instant.parse("2026-08-10T00:00:00Z"));
        given(service.recordByReleaseGroupMbid("release-group-later")).willReturn(Optional.of(existing));

        mvc.perform(get("/api/v1/listening-records/by-release-group/release-group-later")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageId").value("page-13"))
                .andExpect(jsonPath("$.favouriteTrack").value("Saved favourite"))
                .andExpect(jsonPath("$.releaseMbid").value("release-later"));

        verify(service).recordByReleaseGroupMbid("release-group-later");
    }

    @Test
    void returnsAnAuthoritativeITunesRecordByItsSourceQualifiedIdentity() throws Exception {
        var existing = new NotionClient.ExistingRecord(
                "itunes-page", "새 음반", "극동아시아타이거즈", "", "Loved", "첫 곡", false,
                "", "", List.of("극동아시아타이거즈"), java.time.Instant.parse("2026-08-10T00:00:00Z"),
                "", "", "", "", "ITUNES", "123456789");
        given(service.recordByCatalogIdentity("ITUNES", "123456789")).willReturn(Optional.of(existing));

        mvc.perform(get("/api/v1/listening-records/by-catalog-identity")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .queryParam("source", "ITUNES").queryParam("catalogId", "123456789"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageId").value("itunes-page"))
                .andExpect(jsonPath("$.catalogSource").value("ITUNES"))
                .andExpect(jsonPath("$.catalogId").value("123456789"));

        verify(service).recordByCatalogIdentity("ITUNES", "123456789");
    }

    @Test
    void acceptsAnITunesRecordWithoutPretendingItHasMusicBrainzIds() throws Exception {
        given(service.save(org.mockito.ArgumentMatchers.any())).willReturn(new ConnectedMusicService.SaveResult(
                "itunes-page", "2026-08-10T00:00:00Z", ConnectedMusicService.SaveOperation.CREATED));

        mvc.perform(post("/api/v1/listening-records")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("""
                                {"releaseGroupMbid":"","releaseMbid":"","catalogSource":"ITUNES","catalogId":"123456789","albumTitle":"새 음반","artist":"극동아시아타이거즈","sentiment":"Loved","favouriteTrack":"첫 곡","owned":false}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.operation").value("CREATED"));

        verify(service).save(org.mockito.ArgumentMatchers.argThat(input -> input.catalogSource().equals("ITUNES")
                && input.catalogId().equals("123456789") && input.releaseGroupMbid().isBlank() && input.releaseMbid().isBlank()));
    }

    @Test
    void reports503ReadinessWithTypedDependencyStatusWhenGraphDbCannotBeReached() throws Exception {
        given(service.readiness()).willReturn(new ConnectedMusicService.ServiceReadiness(false, List.of(
                new ConnectedMusicService.DependencyReadiness("notion", true, "READY"),
                new ConnectedMusicService.DependencyReadiness("musicbrainz", true, "READY"),
                new ConnectedMusicService.DependencyReadiness("graphdb", false, "GRAPHDB_UNAVAILABLE"))));

        mvc.perform(get("/api/v1/ready").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.components[2].code").value("GRAPHDB_UNAVAILABLE"));
    }

    @Test
    void restoresOnlyTheRequestedArchivedNotionRecord() throws Exception {
        given(service.restore("page-1")).willReturn(new ConnectedMusicService.SaveResult(
                "page-1", "2026-08-12T00:00:00Z", ConnectedMusicService.SaveOperation.RESTORED));

        mvc.perform(post("/api/v1/listening-records/page-1/restore")
                        .header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notionPageId").value("page-1"))
                .andExpect(jsonPath("$.operation").value("RESTORED"));
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
    void returnsARecoverable503WhenThePrivatePersonalGraphIsUnavailable() throws Exception {
        given(service.personalInsights()).willThrow(
                new GraphDbPersonalGraphProjectionGateway.GraphAccessException("GRAPHDB_UNAVAILABLE"));

        mvc.perform(get("/api/v1/personal-insights").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GRAPHDB_UNAVAILABLE"));
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
                .andExpect(jsonPath("$.graphTaste.evidencePageIds").doesNotExist());
    }

    @Test
    void exposesTheActualPersonalGraphRetrievalMethodInsteadOfAFixtureLabel() throws Exception {
        var graphTaste = new ConnectedMusicService.GraphTaste(1, "Artist", List.of("page-1"), List.of());
        given(service.graphTaste()).willReturn(graphTaste);

        mvc.perform(get("/api/v1/graphrag/taste").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.retrievalMethod").value("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL"))
                .andExpect(jsonPath("$.generatedByLlm").value(false))
                .andExpect(jsonPath("$.evidencePageIds").doesNotExist());
    }

    @Test
    void doesNotExposePrivateNotionPageIdsFromDiscovery() throws Exception {
        var recommendation = new ConnectedMusicService.AlbumRecommendation("release-group", "Album", "Artist",
                "2024-01-01", "", "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL", 1,
                List.of(new ConnectedMusicService.EvidencePath("page-1", "RECORDED_BY", "Artist")));
        given(service.publicDiscovery()).willReturn(new ConnectedMusicService.Discovery("Artist", List.of("page-1"),
                List.of(recommendation)));

        mvc.perform(get("/api/v1/recommendations/discover").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.albums[0].artistCredits[0]").value("Artist"))
                .andExpect(jsonPath("$.albums[0].primaryType").value("Album"))
                .andExpect(jsonPath("$.albums[0].evidencePaths[0].relation").value("RECORDED_BY"))
                .andExpect(jsonPath("$.evidencePageIds").doesNotExist())
                .andExpect(jsonPath("$.albums[0].evidencePaths[0].recordPageId").doesNotExist());
    }

    @Test
    void exposesOnlyPublicCitationsForAnExplicitGroundedExplanation() throws Exception {
        given(service.explainPersonalTaste()).willReturn(new ConnectedMusicService.GraphRagExplanation(
                ConnectedMusicService.ExplanationStatus.GENERATED, "실제 기록을 근거로 한 설명입니다.",
                List.of(new ConnectedMusicService.ExplanationCitation("E1", "Recorded Album", "Artist", "RECORDED_BY"))));

        mvc.perform(post("/api/v1/personal-insights/explanation").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("GENERATED"))
                .andExpect(jsonPath("$.citations[0].label").value("E1"))
                .andExpect(jsonPath("$.citations[0].recordTitle").value("Recorded Album"))
                .andExpect(jsonPath("$").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasKey("pageId"))));
    }

    @Test
    void exposesOnlyAggregatePersonalGraphSynchronizationState() throws Exception {
        var state = new PersonalGraphSyncService.SyncState(
                PersonalGraphSyncService.Status.CURRENT, java.time.Instant.parse("2026-08-13T00:00:00Z"), 3, false);
        given(service.personalGraphSyncState()).willReturn(state);
        given(service.refreshPersonalGraph()).willReturn(state);
        given(service.reconcilePersonalGraph()).willReturn(state);

        mvc.perform(get("/api/v1/personal-sync").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CURRENT"))
                .andExpect(jsonPath("$.changedRecordCount").value(3))
                .andExpect(jsonPath("$.lastSuccessfulAt").value("2026-08-13T00:00:00Z"));
        mvc.perform(post("/api/v1/personal-sync").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stale").value(false));
        mvc.perform(post("/api/v1/personal-sync/reconcile").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changedRecordCount").value(3));
    }

    @Test
    void exposesOnlyAggregatedOperationMetricsAfterAConnectedRequest() throws Exception {
        given(service.search("Kind of Blue")).willReturn(List.of());

        mvc.perform(get("/api/v1/catalog/albums").header("X-Music-Kg-Bff-Secret", "connected-test-secret").param("q", "Kind of Blue"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/operations").header("X-Music-Kg-Bff-Secret", "connected-test-secret"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.operation == 'catalog.search')].successCount").value(1))
                .andExpect(jsonPath("$[?(@.operation == 'catalog.search')].failureCount").value(0));
    }

    @TestConfiguration
    @EnableConfigurationProperties({ApiProperties.class, ConnectedServiceProperties.class})
    static class PropertiesConfiguration {}
}
