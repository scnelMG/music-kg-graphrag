package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.catalog.MusicBrainzClient;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

class ConnectedMusicServiceTest {
    @Test
    void generatesALocalGraphRagExplanationWithOnlyPublicEvidenceLabels() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a")));
        GroundedExplanationGenerator generator = context -> {
            assertThat(context.evidence()).allSatisfy(evidence -> assertThat(evidence.label()).startsWith("E"));
            assertThat(context.evidence().toString()).doesNotContain("page-a");
            return new GroundedExplanationGenerator.Generated("기록의 최애곡과 감상을 근거로 다음 앨범을 골랐습니다.", List.of("E1"));
        };
        var service = new ConnectedMusicService(new InMemoryCatalog(), records,
                new InMemoryPersonalGraphProjectionGateway(), java.time.Clock.systemUTC(), generator);

        var explanation = service.explainPersonalTaste();

        assertThat(explanation.status()).isEqualTo(ConnectedMusicService.ExplanationStatus.GENERATED);
        assertThat(explanation.answer()).contains("최애곡");
        assertThat(explanation.citations()).containsExactly(new ConnectedMusicService.ExplanationCitation(
                "E1", "Recorded A", "Artist A", "RECORDED_BY"));
        assertThat(explanation.toString()).doesNotContain("page-a");
    }

    @Test
    void preservesDeterministicRecommendationsWhenLlmGenerationIsDisabled() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records,
                new InMemoryPersonalGraphProjectionGateway(), java.time.Clock.systemUTC(), GroundedExplanationGenerator.disabled());

        var explanation = service.explainPersonalTaste();

        assertThat(explanation.status()).isEqualTo(ConnectedMusicService.ExplanationStatus.DISABLED);
        assertThat(service.personalInsights().graphTaste().recommendations())
                .extracting(ConnectedMusicService.AlbumRecommendation::title).containsExactly("Unrecorded Album");
    }

    @Test
    void savesAnActualSelectedAlbumToNotionAndUpdatesTheMatchingExistingRecord() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-1", "Existing Album", "Artist", "", "마음에 쏙", "Old track", false)));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var result = service.save(new ConnectedMusicService.RecordInput(
                "release-group-id", "Existing Album", "Artist", "https:" + "//cover.example/album.jpg", "애착 앨범", "New track", true));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        assertThat(result.notionPageId()).isEqualTo("page-1");
        assertThat(records.records()).containsExactly(new NotionClient.ExistingRecord(
                "page-1", "Existing Album", "Artist", "https:" + "//cover.example/album.jpg", "애착 앨범", "New track", true,
                "release-group-id"));
    }

    @Test
    void updatesTheSamePageWhenNotionListHasNotYetObservedTheNewRecord() {
        var records = new InMemoryRecords(List.of(), false);
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);
        var input = new ConnectedMusicService.RecordInput(
                "release-group-id", "Existing Album", "Artist", "", "Loved", "New track", true);

        var created = service.save(input);
        var updated = service.save(input);

        assertThat(created.operation()).isEqualTo(ConnectedMusicService.SaveOperation.CREATED);
        assertThat(updated.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        assertThat(updated.notionPageId()).isEqualTo(created.notionPageId());
        assertThat(records.records()).hasSize(1);
    }

    @Test
    void updatesTheExistingPageByReleaseGroupMbidWhenAFreshServiceCannotUseAnInMemorySaveCache() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-1", "Existing Album", "Artist", "", "Loved", "Old track", false, "release-group-id")), false);
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var result = service.save(new ConnectedMusicService.RecordInput(
                "release-group-id", "Existing Album", "Artist", "", "Loved", "New track", true));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        assertThat(result.notionPageId()).isEqualTo("page-1");
        assertThat(records.records()).hasSize(1);
    }

    @Test
    void updatesTheExistingReleaseGroupRecordWithTheNewlyChosenReleaseEdition() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-1", "Existing Album", "Artist", "", "Loved", "Old track", false,
                "release-group-id", "old-release-id", List.of("Artist"), Instant.EPOCH)));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var result = service.save(new ConnectedMusicService.RecordInput(
                "release-group-id", "selected-release-id", "Existing Album", "Artist", "", "Loved", "New track", true,
                List.of("Artist")));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        assertThat(result.notionPageId()).isEqualTo("page-1");
        assertThat(records.records()).singleElement().extracting(NotionClient.ExistingRecord::releaseMbid)
                .isEqualTo("selected-release-id");
    }

    @Test
    void rejectsAReleaseThatDoesNotBelongToTheSelectedReleaseGroupBeforeWritingToNotion() {
        var records = new InMemoryRecords(List.of());
        MusicCatalogGateway catalog = new InMemoryCatalog() {
            @Override
            public List<MusicCatalogGateway.Edition> editions(String releaseGroupMbid) {
                return List.of(new MusicCatalogGateway.Edition(
                        "allowed-release-id", releaseGroupMbid, "Existing Album", "2024-01-01", "KR", "Official", "", true));
            }
        };
        var service = new ConnectedMusicService(catalog, records);

        assertThatThrownBy(() -> service.save(new ConnectedMusicService.RecordInput(
                "release-group-id", "foreign-release-id", "Existing Album", "Artist", "", "Loved", "New track", true,
                List.of("Artist"))))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RELEASE_NOT_IN_GROUP");

        assertThat(records.records()).isEmpty();
    }

    @Test
    void keepsGraphRecommendationsStableWhenOnlyTheSelectedReleaseEditionChanges() {
        var original = new NotionClient.ExistingRecord(
                "page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true,
                "recorded-a", "original-release", List.of("Artist A"), Instant.EPOCH);
        var remaster = new NotionClient.ExistingRecord(
                "page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true,
                "recorded-a", "remaster-release", List.of("Artist A"), Instant.EPOCH);

        var originalRecommendations = new ConnectedMusicService(new InMemoryCatalog(), new InMemoryRecords(List.of(original)))
                .personalInsights().graphTaste();
        var remasterRecommendations = new ConnectedMusicService(new InMemoryCatalog(), new InMemoryRecords(List.of(remaster)))
                .personalInsights().graphTaste();

        assertThat(remasterRecommendations).isEqualTo(originalRecommendations);
    }

    @Test
    void keepsDifferentMusicBrainzReleaseGroupsSeparateWhenTitlesAndArtistsMatch() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-1", "Same Album", "Same Artist", "", "마음에 쏙", "Old track", false, "first-release-group")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var result = service.save(new ConnectedMusicService.RecordInput(
                "second-release-group", "Same Album", "Same Artist", "", "애착 앨범", "New track", true));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.CREATED);
        assertThat(records.records()).hasSize(2);
    }

    @Test
    void derivesATransparentRecommendationFromOnlyStoredPersonalRecordsAndLiveCatalogResults() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "애착 앨범", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "마음에 쏙", "Track B", false, "recorded-b")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var recommendation = service.discover();

        assertThat(recommendation.seedArtist()).isEqualTo("Artist A");
        assertThat(recommendation.evidencePageIds()).containsExactly("page-a", "page-b");
        assertThat(recommendation.albums()).extracting(ConnectedMusicService.AlbumRecommendation::title)
                .containsExactly("Unrecorded Album");
    }

    @Test
    void readsPublicDiscoveryFromTheExistingGraphProjectionWithoutEnumeratingNotion() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true)));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var discovery = service.publicDiscovery();

        assertThat(records.listCalls()).isZero();
        assertThat(discovery.albums()).isEmpty();
    }

    @Test
    void derivesGraphEvidenceAndRecommendationsFromOneNotionHistorySnapshot() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "Liked", "Track B", false, "recorded-b")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var graphTaste = service.graphTaste();

        assertThat(records.listCalls()).isEqualTo(1);
        assertThat(graphTaste.evidencePageIds()).containsExactly("page-a", "page-b");
        assertThat(graphTaste.recommendations()).extracting(ConnectedMusicService.AlbumRecommendation::title)
                .containsExactly("Unrecorded Album");
    }

    @Test
    void derivesTasteAndGraphRecommendationFromTheSameNotionHistorySnapshot() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "Liked", "Track B", false, "recorded-b")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var insights = service.personalInsights();

        assertThat(records.listCalls()).isEqualTo(1);
        assertThat(insights.taste().recordCount()).isEqualTo(2);
        assertThat(insights.graphTaste().evidencePageIds()).containsExactly("page-a", "page-b");
        assertThat(insights.syncState().status()).isEqualTo(PersonalGraphSyncService.Status.CURRENT);
        assertThat(insights.graphTaste().recommendations()).extracting(ConnectedMusicService.AlbumRecommendation::title)
                .containsExactly("Unrecorded Album");
    }

    @Test
    void derivesRelistenChoicesFromRecordedAlbumsBeforeSuggestingNewArtistNeighbors() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "Liked", "Track B", false, "recorded-b")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var graphTaste = service.personalInsights().graphTaste();

        assertThat(graphTaste.relisten()).extracting(ConnectedMusicService.RelistenRecommendation::title)
                .containsExactly("Recorded A", "Recorded B");
        assertThat(graphTaste.relisten()).extracting(ConnectedMusicService.RelistenRecommendation::evidencePageId)
                .containsExactly("page-a", "page-b");
        assertThat(graphTaste.recommendations()).extracting(ConnectedMusicService.AlbumRecommendation::title)
                .containsExactly("Unrecorded Album");
    }

    @Test
    void ranksRelistenChoicesByActualRecordRecencyBeforeOwnershipTies() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-old", "Older", "Artist A", "", "Loved", "Track A", true,
                        "recorded-old", List.of("Artist A"), Instant.parse("2026-01-01T00:00:00Z")),
                new NotionClient.ExistingRecord("page-new", "Newer", "Artist A", "", "Liked", "Track B", false,
                        "recorded-new", List.of("Artist A"), Instant.parse("2026-08-11T00:00:00Z"))));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var graphTaste = service.personalInsights().graphTaste();

        assertThat(graphTaste.relisten()).extracting(ConnectedMusicService.RelistenRecommendation::title)
                .containsExactly("Newer", "Older");
    }

    @Test
    void traversesSeveralPersonalArtistPathsAndReturnsTheirRecordedPageEvidence() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist B", "", "Liked", "Track B", false, "recorded-b")));
        var service = new ConnectedMusicService(new MultiArtistCatalog(), records);

        var discovery = service.discover();

        assertThat(discovery.retrievalMethod()).isEqualTo("PERSONAL_EVIDENCE_GRAPH_TRAVERSAL");
        assertThat(discovery.albums()).extracting(ConnectedMusicService.AlbumRecommendation::artist)
                .containsExactly("Artist A", "Artist B");
        assertThat(discovery.albums().getFirst().evidencePaths())
                .containsExactly(new ConnectedMusicService.EvidencePath("page-a", "RECORDED_BY", "Artist A"));
        assertThat(discovery.albums().get(1).evidencePaths())
                .containsExactly(new ConnectedMusicService.EvidencePath("page-b", "RECORDED_BY", "Artist B"));
    }

    @Test
    void returnsOnlyCatalogTracksForTheSelectedReleaseGroup() {
        var service = new ConnectedMusicService(new TrackCatalog(), new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"))));

        var tracks = service.tracks("release-group-id");

        assertThat(tracks).containsExactly(new MusicCatalogGateway.Track("recording-1", "Actual Track", 1));
    }

    @Test
    void findsAnExistingRecordByReleaseGroupWithoutDependingOnTheLoadedRecordPage() {
        var hiddenBeyondFirstPage = new NotionClient.ExistingRecord(
                "page-13", "Later record", "Artist", "", "Loved", "Saved favourite", true,
                "release-group-later", "release-later", List.of("Artist"), Instant.parse("2026-08-10T00:00:00Z"));
        var service = new ConnectedMusicService(new InMemoryCatalog(), new InMemoryRecords(List.of(hiddenBeyondFirstPage)));

        var found = service.recordByReleaseGroupMbid("release-group-later");

        assertThat(found).contains(hiddenBeyondFirstPage);
    }

    @Test
    void archivesTheRequestedPersonalRecordInsteadOfLeavingItInTheRecommendationHistory() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var removed = service.remove("page-a");

        assertThat(removed.notionPageId()).isEqualTo("page-a");
        assertThat(records.records()).isEmpty();
    }

    @Test
    void restoresAnArchivedPersonalRecordForTheCurrentListeningSession() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        service.remove("page-a");
        var restored = service.restore("page-a");

        assertThat(restored.operation()).isEqualTo(ConnectedMusicService.SaveOperation.RESTORED);
        assertThat(records.records()).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-a");
    }

    @Test
    void preservesAllSelectedAlbumArtistCreditsWhenWritingTheNotionRecord() {
        var records = new InMemoryRecords(List.of());
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        service.save(new ConnectedMusicService.RecordInput("release-group-id", "Collaboration", "Artist A", "", "Loved", "Track", false,
                List.of("Artist A", "Artist B")));

        assertThat(records.records().getFirst().artistCredits()).containsExactly("Artist A", "Artist B");
    }

    @Test
    void usesEveryStoredCollaborationCreditInTheFallbackPersonalGraph() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Collaboration", "Artist A", "", "Loved", "Track", true, "recorded-a",
                List.of("Artist A", "Artist B"))));
        var service = new ConnectedMusicService(new MultiArtistCatalog(), records);

        var discovery = service.discover();

        assertThat(discovery.albums()).extracting(ConnectedMusicService.AlbumRecommendation::artist)
                .containsExactly("Artist A", "Artist B");
    }

    @Test
    void ranksArtistPathsUsingActualOwnedAndFavouriteTrackSignalsBeforeRawRecordCount() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "A", "Artist A", "", "Loved", "Favourite", true, "a"),
                new NotionClient.ExistingRecord("page-b", "B", "Artist B", "", "", "", false, "b"),
                new NotionClient.ExistingRecord("page-c", "C", "Artist B", "", "", "", false, "c")));
        var service = new ConnectedMusicService(new MultiArtistCatalog(), records);

        var discovery = service.discover();

        assertThat(discovery.seedArtist()).isEqualTo("Artist A");
        assertThat(discovery.albums().getFirst().score()).isGreaterThan(discovery.albums().get(1).score());
    }

    @Test
    void discoversAnotherArtistOnlyThroughMusicBrainzTagsGroundedInARecordedReleaseGroup() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a")));
        var service = new ConnectedMusicService(new TagCatalog(), records);

        var discovery = service.discover();

        assertThat(discovery.albums()).extracting(ConnectedMusicService.AlbumRecommendation::artist)
                .contains("Different artist");
        assertThat(discovery.albums().getFirst().evidencePaths())
                .contains(new ConnectedMusicService.EvidencePath("page-a", "SHARES_MUSICBRAINZ_TAG", "dream pop"));
    }

    @Test
    void limitsNewDiscoveriesToOneAlbumPerArtist() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a")));
        var service = new ConnectedMusicService(new SameArtistCatalog(), records);

        var recommendations = service.discover().albums();

        assertThat(recommendations).extracting(ConnectedMusicService.AlbumRecommendation::artist)
                .containsExactly("A new artist");
    }

    @Test
    void withholdsDiscoveryWhenAllPersonalRecordsAreExplicitlyNegative() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded", "Artist A", "", "Not for me", "Track", false, "recorded-a")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var discovery = service.discover();

        assertThat(discovery.seedArtist()).isEqualTo("긍정적인 감상");
        assertThat(discovery.albums()).isEmpty();
    }

    @Test
    void aggregatesIndependentGraphPathsForTheSameCandidateBeforeRankingIt() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist B", "", "Liked", "Track B", false, "recorded-b")));
        PersonalGraphProjectionGateway graph = new PersonalGraphProjectionGateway() {
            private List<NotionClient.ExistingRecord> snapshot = List.of();

            @Override
            public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) {
                return List.of(new ArtistEvidence("Artist B", 5, List.of("page-b")), new ArtistEvidence("Artist A", 2, List.of("page-a")));
            }

            @Override public void bootstrapRecords(List<NotionClient.ExistingRecord> records) { snapshot = List.copyOf(records); }
            @Override public List<NotionClient.ExistingRecord> retrieveRecords() { return snapshot; }
            @Override public List<ArtistEvidence> retrieveEvidence() { return projectAndRetrieve(snapshot); }
            @Override
            public String retrievalMethod() { return "TEST_GRAPH"; }
        };
        var service = new ConnectedMusicService(new SharedCandidateCatalog(), records, graph);

        var recommendations = service.discover().albums();

        assertThat(recommendations).singleElement().satisfies(recommendation -> {
            assertThat(recommendation.score()).isEqualTo(7);
            assertThat(recommendation.evidencePaths()).containsExactlyInAnyOrder(
                    new ConnectedMusicService.EvidencePath("page-a", "RECORDED_BY", "Artist A"),
                    new ConnectedMusicService.EvidencePath("page-b", "RECORDED_BY", "Artist B"));
        });
    }

    @Test
    void reportsATypedUnavailableReadinessComponentForUnexpectedDependencyFailures() {
        var graph = new PersonalGraphProjectionGateway() {
            @Override
            public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) { return List.of(); }

            @Override
            public String retrievalMethod() { return "TEST_GRAPH"; }

            @Override
            public void verifyReadiness() { throw new IllegalStateException("unexpected provider payload"); }
        };
        var service = new ConnectedMusicService(new InMemoryCatalog(), new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded", "Artist A", "", "Loved", "Track", false, "recorded-a"))), graph);

        assertThat(service.readiness().components())
                .contains(new ConnectedMusicService.DependencyReadiness("graphdb", false, "DEPENDENCY_UNAVAILABLE"));
    }

    @Test
    void reusesAnUnchangedInsightSnapshotWithoutRepeatingGraphOrCatalogWork() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a")));
        var catalog = new CountingCatalog();
        var graph = new CountingGraph();
        var service = new ConnectedMusicService(catalog, records, graph);

        var first = service.personalInsights();
        var second = service.personalInsights();

        assertThat(second).isEqualTo(first);
        assertThat(records.listCalls()).isEqualTo(1);
        assertThat(graph.calls()).isEqualTo(1);
        assertThat(catalog.externalCalls()).isEqualTo(2);
    }

    @Test
    void readsOnlyNotionChangesWhenTheOwnerExplicitlyRefreshesThePrivateGraph() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a")));
        var graph = new InMemoryPersonalGraphProjectionGateway();
        var service = new ConnectedMusicService(new InMemoryCatalog(), records, graph);

        service.discover();
        service.refreshPersonalGraph();
        service.discover();

        assertThat(records.listCalls()).isEqualTo(1);
        assertThat(records.changedSinceCalls()).isEqualTo(1);
    }

    @Test
    void mirrorsConfirmedNotionWritesIntoThePrivateGraphWithoutAFullRefresh() {
        var records = new InMemoryRecords(List.of());
        var graph = new InMemoryPersonalGraphProjectionGateway();
        var service = new ConnectedMusicService(new InMemoryCatalog(), records, graph);

        var saved = service.save(new ConnectedMusicService.RecordInput(
                "release-new", "New album", "Artist A", "", "Loved", "Favourite", true));

        assertThat(graph.retrieveRecords()).extracting(NotionClient.ExistingRecord::pageId).containsExactly(saved.notionPageId());
        service.remove(saved.notionPageId());
        assertThat(graph.retrieveRecords()).isEmpty();
        service.restore(saved.notionPageId());
        assertThat(graph.retrieveRecords()).extracting(NotionClient.ExistingRecord::pageId).containsExactly(saved.notionPageId());
    }

    @Test
    void invalidatesTheInsightSnapshotAfterSavingARecord() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a")));
        var catalog = new CountingCatalog();
        var graph = new CountingGraph();
        var service = new ConnectedMusicService(catalog, records, graph);

        service.personalInsights();
        service.save(new ConnectedMusicService.RecordInput(
                "", "Recorded B", "Artist B", "", "Loved", "Favourite", false));
        service.personalInsights();

        assertThat(graph.calls()).isEqualTo(2);
        assertThat(catalog.externalCalls()).isEqualTo(4);
    }

    @Test
    void reportsAllConnectedDependenciesReadyWhenTheirProbesSucceed() {
        var service = new ConnectedMusicService(new InMemoryCatalog(), new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded", "Artist A", "", "Loved", "Favourite", true, "recorded-a"))));

        var readiness = service.readiness();

        assertThat(readiness.ready()).isTrue();
        assertThat(readiness.components()).extracting(ConnectedMusicService.DependencyReadiness::name)
                .containsExactly("notion", "musicbrainz", "graphdb");
    }

    private static class InMemoryCatalog implements MusicCatalogGateway {
        @Override
        public List<Album> search(String query) {
            return search(query, query);
        }

        @Override
        public List<Album> search(String albumTitle, String artist) {
            return List.of(
                    new Album("release-group-id", albumTitle, artist, "2024-01-01", "https:" + "//cover.example/album.jpg"),
                    new Album("second-release-group", albumTitle, artist, "2024-01-01", "https:" + "//cover.example/album.jpg"),
                    new Album("recorded-a", albumTitle, artist, "2024-01-01", "https:" + "//cover.example/album.jpg"),
                    new Album("release-new", albumTitle, artist, "2024-01-01", "https:" + "//cover.example/album.jpg"));
        }

        @Override
        public List<Album> searchByArtist(String artist) {
            return List.of(
                    new Album("recorded-a", "Recorded A", artist, "2024-01-01", ""),
                    new Album("unrecorded", "Unrecorded Album", artist, "2025-01-01", ""));
        }

        @Override
        public List<MusicCatalogGateway.Edition> editions(String releaseGroupMbid) {
            return List.of(new MusicCatalogGateway.Edition(
                    "selected-release-id", releaseGroupMbid, "Existing Album", "2024-01-01", "KR", "Official", "", true));
        }

        @Override
        public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid, String releaseMbid) {
            return List.of(
                    new MusicCatalogGateway.Track("recording-1", "New track", 1),
                    new MusicCatalogGateway.Track("recording-2", "Favourite", 2));
        }
    }

    private static final class MultiArtistCatalog implements MusicCatalogGateway {
        @Override
        public List<Album> search(String query) { return List.of(); }

        @Override
        public List<Album> search(String albumTitle, String artist) { return List.of(); }

        @Override
        public List<Album> searchByArtist(String artist) {
            return List.of(new Album("new-" + artist, "New " + artist, artist, "2025-01-01", ""));
        }
    }

    private static final class TrackCatalog implements MusicCatalogGateway {
        @Override
        public List<Album> search(String query) { return List.of(); }

        @Override
        public List<Album> search(String albumTitle, String artist) { return List.of(); }

        @Override
        public List<Album> searchByArtist(String artist) { return List.of(); }

        @Override
        public List<MusicCatalogGateway.Track> tracks(String releaseGroupMbid) {
            return List.of(new MusicCatalogGateway.Track("recording-1", "Actual Track", 1));
        }
    }

    private static final class TagCatalog extends InMemoryCatalog {
        @Override
        public List<String> tags(String releaseGroupMbid) {
            return releaseGroupMbid.equals("recorded-a") ? List.of("dream pop") : List.of();
        }

        @Override
        public List<Album> searchByTag(String tag) {
            return tag.equals("dream pop")
                    ? List.of(new Album("different", "Different album", "Different artist", "2025-01-01", ""))
                    : List.of();
        }
    }

    private static final class SharedCandidateCatalog extends InMemoryCatalog {
        @Override
        public List<Album> searchByArtist(String artist) {
            return List.of(new Album("shared", "Shared discovery", "Shared artist", "2025-01-01", ""));
        }
    }

    private static final class SameArtistCatalog extends InMemoryCatalog {
        @Override
        public List<Album> searchByArtist(String artist) {
            return List.of(
                    new Album("new-one", "New one", "A new artist", "2025-01-01", ""),
                    new Album("new-two", "New two", "A new artist", "2025-01-01", ""));
        }
    }

    private static final class CountingCatalog extends InMemoryCatalog {
        private int externalCalls;

        @Override
        public List<String> tags(String releaseGroupMbid) {
            externalCalls++;
            return List.of();
        }

        @Override
        public List<Album> searchByArtist(String artist) {
            externalCalls++;
            return super.searchByArtist(artist);
        }

        private int externalCalls() { return externalCalls; }
    }

    private static final class CountingGraph implements PersonalGraphProjectionGateway {
        private int calls;
        private List<NotionClient.ExistingRecord> snapshot = List.of();

        @Override
        public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) {
            calls++;
            return List.of(new ArtistEvidence("Artist A", 4, List.of("page-a")));
        }

        @Override public void bootstrapRecords(List<NotionClient.ExistingRecord> records) { snapshot = List.copyOf(records); }
        @Override public List<NotionClient.ExistingRecord> retrieveRecords() { return snapshot; }
        @Override public List<ArtistEvidence> retrieveEvidence() { return projectAndRetrieve(snapshot); }

        @Override
        public String retrievalMethod() { return "PERFORMANCE_TEST_GRAPH"; }

        private int calls() { return calls; }
    }

    private static final class InMemoryRecords implements PersonalMusicRecordGateway {
        private final List<NotionClient.ExistingRecord> values;
        private final List<NotionClient.ExistingRecord> visibleValues;
        private final boolean listReflectsWrites;
        private int listCalls;
        private int changedSinceCalls;

        private InMemoryRecords(List<NotionClient.ExistingRecord> values) {
            this(values, true);
        }

        private InMemoryRecords(List<NotionClient.ExistingRecord> values, boolean listReflectsWrites) {
            this.values = new ArrayList<>(values);
            this.visibleValues = new ArrayList<>(listReflectsWrites ? values : List.of());
            this.listReflectsWrites = listReflectsWrites;
        }

        @Override
        public NotionClient.SavedRecord create(NotionClient.Record record) {
            String pageId = "created-page";
            values.add(new NotionClient.ExistingRecord(pageId, record.albumTitle(), record.artist(), record.coverUrl(), record.sentiment(), record.favouriteTrack(), record.owned(), record.releaseGroupMbid(), record.releaseMbid(), record.artistCredits(), Instant.EPOCH));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public NotionClient.SavedRecord update(String pageId, NotionClient.Record record) {
            values.removeIf(value -> value.pageId().equals(pageId));
            values.add(new NotionClient.ExistingRecord(pageId, record.albumTitle(), record.artist(), record.coverUrl(), record.sentiment(), record.favouriteTrack(), record.owned(), record.releaseGroupMbid(), record.releaseMbid(), record.artistCredits(), Instant.EPOCH));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public NotionClient.SavedRecord archive(String pageId) {
            values.removeIf(value -> value.pageId().equals(pageId));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public NotionClient.SavedRecord restore(String pageId) {
            values.add(new NotionClient.ExistingRecord(
                    pageId, "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a"));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public List<NotionClient.ExistingRecord> list() {
            listCalls++;
            return List.copyOf(listReflectsWrites ? values : visibleValues);
        }

        @Override
        public List<NotionClient.ExistingRecord> changedSince(Instant after) {
            changedSinceCalls++;
            return List.of();
        }

        @Override
        public Optional<NotionClient.ExistingRecord> findByReleaseGroupMbid(String releaseGroupMbid) {
            return values.stream().filter(value -> value.releaseGroupMbid().equals(releaseGroupMbid)).findFirst();
        }

        @Override
        public List<String> sentimentOptions() { return List.of("애착 앨범", "마음에 쏙"); }

        private List<NotionClient.ExistingRecord> records() { return List.copyOf(values); }

        private int listCalls() { return listCalls; }

        private int changedSinceCalls() { return changedSinceCalls; }
    }
}
