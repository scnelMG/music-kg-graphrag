package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

class ConnectedMusicServiceTest {
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
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "애착 앨범", "Track A", true),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "마음에 쏙", "Track B", false)));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var recommendation = service.discover();

        assertThat(recommendation.seedArtist()).isEqualTo("Artist A");
        assertThat(recommendation.evidencePageIds()).containsExactly("page-a", "page-b");
        assertThat(recommendation.albums()).extracting(ConnectedMusicService.AlbumRecommendation::title)
                .containsExactly("Unrecorded Album");
    }

    @Test
    void derivesGraphEvidenceAndRecommendationsFromOneNotionHistorySnapshot() {
        var records = new InMemoryRecords(List.of(
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "Liked", "Track B", false)));
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
                new NotionClient.ExistingRecord("page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true),
                new NotionClient.ExistingRecord("page-b", "Recorded B", "Artist A", "", "Liked", "Track B", false)));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var insights = service.personalInsights();

        assertThat(records.listCalls()).isEqualTo(1);
        assertThat(insights.taste().recordCount()).isEqualTo(2);
        assertThat(insights.graphTaste().evidencePageIds()).containsExactly("page-a", "page-b");
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
    void archivesTheRequestedPersonalRecordInsteadOfLeavingItInTheRecommendationHistory() {
        var records = new InMemoryRecords(List.of(new NotionClient.ExistingRecord(
                "page-a", "Recorded A", "Artist A", "", "Loved", "Track A", true, "recorded-a")));
        var service = new ConnectedMusicService(new InMemoryCatalog(), records);

        var removed = service.remove("page-a");

        assertThat(removed.notionPageId()).isEqualTo("page-a");
        assertThat(records.records()).isEmpty();
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

    private static class InMemoryCatalog implements MusicCatalogGateway {
        @Override
        public List<Album> search(String query) {
            return search(query, query);
        }

        @Override
        public List<Album> search(String albumTitle, String artist) {
            return List.of(new Album("release-group-id", albumTitle, artist, "2024-01-01", "https:" + "//cover.example/album.jpg"));
        }

        @Override
        public List<Album> searchByArtist(String artist) {
            return List.of(
                    new Album("recorded-a", "Recorded A", artist, "2024-01-01", ""),
                    new Album("unrecorded", "Unrecorded Album", artist, "2025-01-01", ""));
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

    private static final class InMemoryRecords implements PersonalMusicRecordGateway {
        private final List<NotionClient.ExistingRecord> values;
        private final List<NotionClient.ExistingRecord> visibleValues;
        private final boolean listReflectsWrites;
        private int listCalls;

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
            values.add(new NotionClient.ExistingRecord(pageId, record.albumTitle(), record.artist(), record.coverUrl(), record.sentiment(), record.favouriteTrack(), record.owned(), record.releaseGroupMbid(), record.artistCredits()));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public NotionClient.SavedRecord update(String pageId, NotionClient.Record record) {
            values.removeIf(value -> value.pageId().equals(pageId));
            values.add(new NotionClient.ExistingRecord(pageId, record.albumTitle(), record.artist(), record.coverUrl(), record.sentiment(), record.favouriteTrack(), record.owned(), record.releaseGroupMbid(), record.artistCredits()));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public NotionClient.SavedRecord archive(String pageId) {
            values.removeIf(value -> value.pageId().equals(pageId));
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00Z"));
        }

        @Override
        public List<NotionClient.ExistingRecord> list() {
            listCalls++;
            return List.copyOf(listReflectsWrites ? values : visibleValues);
        }

        @Override
        public Optional<NotionClient.ExistingRecord> findByReleaseGroupMbid(String releaseGroupMbid) {
            return values.stream().filter(value -> value.releaseGroupMbid().equals(releaseGroupMbid)).findFirst();
        }

        @Override
        public List<String> sentimentOptions() { return List.of("애착 앨범", "마음에 쏙"); }

        private List<NotionClient.ExistingRecord> records() { return List.copyOf(values); }

        private int listCalls() { return listCalls; }
    }
}
