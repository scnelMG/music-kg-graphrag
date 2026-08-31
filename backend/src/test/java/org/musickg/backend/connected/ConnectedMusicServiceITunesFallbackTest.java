package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.catalog.MusicBrainzClient;
import org.musickg.backend.catalog.SupplementalCatalogGateway;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ConnectedMusicServiceITunesFallbackTest {
    @Test
    void fallsBackToITunesOnlyWhenMusicBrainzHasNoAlbumOrEpResult() {
        var service = new ConnectedMusicService(new EmptyCatalog(), new EmptyRecords(), new ITunesCatalog());

        var albums = service.search("극동");

                assertThat(albums).singleElement().extracting(MusicCatalogGateway.Album::catalogId).isEqualTo("123456789");
    }

    @Test
    void fallsBackToITunesAfterOneMusicBrainzRetry() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.times(2), request -> { })
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        var musicBrainz = new MusicBrainzClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.MusicBrainz(
                        "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2",
                        1_000_000, "https://coverartarchive.org"));
        var service = new ConnectedMusicService(musicBrainz, new EmptyRecords(), new ITunesCatalog());

        var albums = service.search("극동");

        assertThat(albums).singleElement().extracting(MusicCatalogGateway.Album::catalogSource)
                .isEqualTo(MusicCatalogGateway.CatalogSource.ITUNES);
        server.verify();
    }

    @Test
    void returnsAnEmptySearchWhenMusicBrainzIsUnavailableAndITunesHasNoMatch() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.times(2), request -> { })
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        var musicBrainz = new MusicBrainzClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.MusicBrainz(
                        "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2",
                        1_000_000, "https://coverartarchive.org"));
        var service = new ConnectedMusicService(musicBrainz, new EmptyRecords(), SupplementalCatalogGateway.disabled());

        var albums = service.search("qzxv-no-album");

        assertThat(albums).isEmpty();
        server.verify();
    }

    @Test
    void keepsGenreExploreAvailableWhenMusicBrainzIsTemporarilyUnavailable() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.times(2), request -> { })
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        var musicBrainz = new MusicBrainzClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.MusicBrainz(
                        "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2",
                        1_000_000, "https://coverartarchive.org"));
        var service = new ConnectedMusicService(musicBrainz, new EmptyRecords(), new ITunesCatalog());

        var albums = service.searchByTag("dream pop");

        assertThat(albums).singleElement().extracting(MusicCatalogGateway.Album::catalogSource)
                .isEqualTo(MusicCatalogGateway.CatalogSource.ITUNES);
        server.verify();
    }

    @Test
    void keepsPublicDiscoveryAvailableWhenMusicBrainzIsTemporarilyUnavailable() {
        var builder = RestClient.builder().baseUrl("https://musicbrainz.org/ws/2");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(ExpectedCount.times(2), request -> { })
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        var musicBrainz = new MusicBrainzClient(builder.build(), new ObjectMapper(),
                new ConnectedServiceProperties.MusicBrainz(
                        "music-kg/1.0 (https://example.test)", "https://musicbrainz.org/ws/2",
                        1_000_000, "https://coverartarchive.org"));
        var record = new NotionClient.ExistingRecord(
                "page-id", "기록한 앨범", "기록한 가수", "", "Loved", "첫 곡", false, "recorded-release");
        var graph = new InMemoryPersonalGraphProjectionGateway();
        graph.bootstrapRecords(List.of(record));
        var service = new ConnectedMusicService(musicBrainz, new EmptyRecords(), graph);

        var discovery = service.publicDiscovery();

        assertThat(discovery.albums()).isEmpty();
        server.verify();
    }

    @Test
    void includesSupplementalKoreanCatalogResultsWhenMusicBrainzOnlyReturnsAWeakPrefixMatch() {
        var service = new ConnectedMusicService(new WeakPrefixCatalog(), new EmptyRecords(), new ITunesCatalog());

        var albums = service.search("극동");

        assertThat(albums).extracting(MusicCatalogGateway.Album::catalogSource)
                .containsExactly(MusicCatalogGateway.CatalogSource.ITUNES, MusicCatalogGateway.CatalogSource.MUSICBRAINZ);
    }

    @Test
    void canonicalizesITunesOnlyRecordsFromTheProviderBeforeSaving() {
        var records = new CapturingRecords();
        var service = new ConnectedMusicService(new EmptyCatalog(), records, new ITunesCatalog());

        service.save(new ConnectedMusicService.RecordInput("", "", "forged title", "forged artist", "", "Loved",
                "첫 곡", false, List.of("forged artist"), "", "", "", "", "ITUNES", "123456789"));

        assertThat(records.created).isNotNull().satisfies(record -> {
            assertThat(record.albumTitle()).isEqualTo("새 음반");
            assertThat(record.artist()).isEqualTo("극동아시아타이거즈");
            assertThat(record.catalogSource()).isEqualTo("ITUNES");
            assertThat(record.catalogId()).isEqualTo("123456789");
        });
    }

    @Test
    void updatesTheExistingITunesRecordInsteadOfCreatingADuplicate() {
        var records = new CapturingRecords();
        records.existing = new NotionClient.ExistingRecord("existing-page", "새 음반", "극동아시아타이거즈", "", "Loved",
                "첫 곡", false, "", "", List.of("극동아시아타이거즈"), Instant.EPOCH, "", "", "", "",
                "ITUNES", "123456789");
        var service = new ConnectedMusicService(new EmptyCatalog(), records, new ITunesCatalog());

        var result = service.save(new ConnectedMusicService.RecordInput("", "", "forged title", "forged artist", "", "Loved",
                "첫 곡", false, List.of("forged artist"), "", "", "", "", "ITUNES", "123456789"));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        assertThat(records.created).isNull();
        assertThat(records.updatedPageId).isEqualTo("existing-page");
    }

    @Test
    void doesNotMergeDifferentITunesCollectionsJustBecauseTheirDisplayMetadataMatches() {
        var records = new CapturingRecords();
        records.existing = new NotionClient.ExistingRecord("existing-page", "새 음반", "극동아시아타이거즈", "", "Loved",
                "첫 곡", false, "", "", List.of("극동아시아타이거즈"), Instant.EPOCH, "", "", "", "",
                "ITUNES", "987654321");
        var service = new ConnectedMusicService(new EmptyCatalog(), records, new ITunesCatalog());

        var result = service.save(new ConnectedMusicService.RecordInput("", "", "새 음반", "극동아시아타이거즈", "", "Loved",
                "첫 곡", false, List.of("극동아시아타이거즈"), "", "", "", "", "ITUNES", "123456789"));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.CREATED);
        assertThat(records.updatedPageId).isNull();
        assertThat(records.created).isNotNull();
    }

    private static class EmptyCatalog implements MusicCatalogGateway {
        @Override public List<Album> search(String query) { return List.of(); }
        @Override public List<Album> search(String albumTitle, String artist) { return List.of(); }
        @Override public List<Album> searchByArtist(String artist) { return List.of(); }
    }

    private static final class WeakPrefixCatalog extends EmptyCatalog {
        @Override public List<MusicCatalogGateway.Album> search(String query) {
            return List.of(new MusicCatalogGateway.Album("prefix-release-group", "다른 음반", "극동서쪽", "2025-01-01", "",
                    List.of("극동서쪽"), "Album", 1));
        }
    }

    private static final class ITunesCatalog implements SupplementalCatalogGateway {
        @Override public List<MusicCatalogGateway.Album> search(String query) {
            return List.of(new MusicCatalogGateway.Album("", "새 음반", "극동아시아타이거즈", "2025-04-11", "",
                    List.of("극동아시아타이거즈"), "Album", 0, MusicCatalogGateway.CatalogSource.ITUNES,
                    "123456789", "https://music.apple.com/kr/album/new-album/123456789"));
        }
        @Override public MusicCatalogGateway.Album album(String catalogId) { return search("").getFirst(); }
        @Override public List<MusicCatalogGateway.Track> tracks(String catalogId) {
            return List.of(new MusicCatalogGateway.Track("itunes:987654321", "첫 곡", 1));
        }
    }

    private static class EmptyRecords implements PersonalMusicRecordGateway {
        @Override public NotionClient.SavedRecord create(NotionClient.Record record) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord update(String pageId, NotionClient.Record record) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord archive(String pageId) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord restore(String pageId) { throw new UnsupportedOperationException(); }
        @Override public List<NotionClient.ExistingRecord> list() { return List.of(); }
        @Override public List<String> sentimentOptions() { return List.of("Loved"); }
        @Override public NotionClient.RecordPage listPage(int pageSize, String cursor) { return new NotionClient.RecordPage(List.of(), null); }
        @Override public List<NotionClient.ExistingRecord> changedSince(Instant after) { return List.of(); }
    }

    private static final class CapturingRecords extends EmptyRecords {
        private NotionClient.Record created;
        private NotionClient.ExistingRecord existing;
        private String updatedPageId;

        @Override public NotionClient.SavedRecord create(NotionClient.Record record) {
            created = record;
            return new NotionClient.SavedRecord("page-id", Instant.parse("2026-08-10T00:00:00.000Z"));
        }

        @Override public Optional<NotionClient.ExistingRecord> findByCatalogIdentity(String catalogSource, String catalogId) {
            return Optional.ofNullable(existing).filter(record -> record.catalogSource().equals(catalogSource)
                    && record.catalogId().equals(catalogId));
        }

        @Override public List<NotionClient.ExistingRecord> list() {
            return existing == null ? List.of() : List.of(existing);
        }

        @Override public NotionClient.SavedRecord update(String pageId, NotionClient.Record record) {
            updatedPageId = pageId;
            return new NotionClient.SavedRecord(pageId, Instant.parse("2026-08-10T00:00:00.000Z"));
        }
    }
}
