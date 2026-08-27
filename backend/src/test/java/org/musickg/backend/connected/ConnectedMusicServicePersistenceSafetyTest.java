package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.musickg.backend.catalog.MusicBrainzClient.CatalogAccessException;
import org.musickg.backend.catalog.MusicCatalogGateway;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

class ConnectedMusicServicePersistenceSafetyTest {
    @Test
    void savesCatalogMetadataInsteadOfBrowserSuppliedAlbumFields() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        MusicCatalogGateway.Album canonical = new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "2015-10-27", "https://cover.test/verified.jpg",
                List.of("Verified artist"), "Album", 100);
        ConnectedMusicService.RecordInput input = input("Forged album", "Forged artist", "https://attacker.test/cover.jpg", "Verified track");
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Forged album", "Forged artist")).willReturn(List.of(canonical));
        given(catalog.tracks("release-group", "release"))
                .willReturn(List.of(new MusicCatalogGateway.Track("track", "Verified track", 1)));
        given(records.findByReleaseGroupMbid("release-group")).willReturn(Optional.empty());
        given(records.list()).willReturn(List.of());
        given(records.create(any())).willReturn(new NotionClient.SavedRecord("created-page", Instant.parse("2026-08-15T00:00:00Z")));

        service.save(input);

        ArgumentCaptor<NotionClient.Record> persisted = ArgumentCaptor.forClass(NotionClient.Record.class);
        verify(records).create(persisted.capture());
        assertThat(persisted.getValue()).extracting(
                NotionClient.Record::albumTitle, NotionClient.Record::artist, NotionClient.Record::coverUrl,
                NotionClient.Record::artistCredits, NotionClient.Record::favouriteTrack)
                .containsExactly("Verified album", "Verified artist", "https://cover.test/verified.jpg",
                        List.of("Verified artist"), "Verified track");
    }

    @Test
    void rejectsFavouriteTrackThatDoesNotBelongToTheSelectedEditionBeforeAnyNotionWrite() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Forged album", "Forged artist")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "2015-10-27", "", List.of("Verified artist"), "Album", 100)));
        given(catalog.tracks("release-group", "release"))
                .willReturn(List.of(new MusicCatalogGateway.Track("track", "Actual track", 1)));

        assertThatThrownBy(() -> service.save(input("Forged album", "Forged artist", "", "Forged track")))
                .isInstanceOf(CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_TRACK_NOT_IN_RELEASE");

        verifyNoInteractions(records);
    }

    @Test
    void rejectsAnAmbiguousFavouriteTrackWithoutTheSelectedRecordingIdentityBeforeAnyNotionWrite() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Verified album", "Verified artist")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "2015-10-27", "", List.of("Verified artist"), "Album", 100)));
        given(catalog.tracks("release-group", "release")).willReturn(List.of(
                new MusicCatalogGateway.Track("recording-a", "Same title", 1),
                new MusicCatalogGateway.Track("recording-b", "Same title", 2)));

        assertThatThrownBy(() -> service.save(new ConnectedMusicService.RecordInput(
                "release-group", "release", "Verified album", "Verified artist", "", "Loved", "Same title", false,
                List.of("Verified artist"))))
                .isInstanceOf(CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_TRACK_NOT_IN_RELEASE");

        verifyNoInteractions(records);
    }

    @Test
    void persistsOnlyAYoutubeMappingBoundToTheSelectedMusicBrainzRecording() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Verified album", "Verified artist")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "", "", List.of("Verified artist"), "Album", 100)));
        given(catalog.tracks("release-group", "release"))
                .willReturn(List.of(new MusicCatalogGateway.Track("recording-id", "Verified track", 1)));
        given(records.findByReleaseGroupMbid("release-group")).willReturn(Optional.empty());
        given(records.list()).willReturn(List.of());
        given(records.create(any())).willReturn(new NotionClient.SavedRecord("created-page", Instant.parse("2026-08-16T00:00:00Z")));

        service.save(new ConnectedMusicService.RecordInput(
                "release-group", "release", "Verified album", "Verified artist", "", "Loved", "Verified track", false,
                List.of("Verified artist"), "recording-id", "dQw4w9WgXcQ", "Verified track official audio", "Verified artist"));

        ArgumentCaptor<NotionClient.Record> persisted = ArgumentCaptor.forClass(NotionClient.Record.class);
        verify(records).create(persisted.capture());
        assertThat(persisted.getValue()).extracting(
                NotionClient.Record::youtubeRecordingMbid, NotionClient.Record::youtubeVideoId,
                NotionClient.Record::youtubeVideoTitle, NotionClient.Record::youtubeChannelTitle)
                .containsExactly("recording-id", "dQw4w9WgXcQ", "Verified track official audio", "Verified artist");
    }

    @Test
    void rejectsAYoutubeMappingForAnotherRecordingBeforeAnyNotionWrite() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Verified album", "Verified artist")).willReturn(List.of(new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "", "", List.of("Verified artist"), "Album", 100)));
        given(catalog.tracks("release-group", "release"))
                .willReturn(List.of(new MusicCatalogGateway.Track("recording-id", "Verified track", 1)));

        assertThatThrownBy(() -> service.save(new ConnectedMusicService.RecordInput(
                "release-group", "release", "Verified album", "Verified artist", "", "Loved", "Verified track", false,
                List.of("Verified artist"), "other-recording-id", "dQw4w9WgXcQ", "Wrong track", "Wrong channel")))
                .isInstanceOf(CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_TRACK_NOT_IN_RELEASE");

        verifyNoInteractions(records);
    }

    @Test
    void reconcilesAConcurrentCreateToTheExistingNotionRecord() {
        MusicCatalogGateway catalog = mock(MusicCatalogGateway.class);
        PersonalMusicRecordGateway records = mock(PersonalMusicRecordGateway.class);
        ConnectedMusicService service = new ConnectedMusicService(catalog, records);
        MusicCatalogGateway.Album canonical = new MusicCatalogGateway.Album(
                "release-group", "Verified album", "Verified artist", "2015-10-27", "", List.of("Verified artist"), "Album", 100);
        NotionClient.ExistingRecord concurrent = new NotionClient.ExistingRecord(
                "concurrent-page", "Verified album", "Verified artist", "", "Loved", "Verified track", false,
                "release-group", "release", List.of("Verified artist"), Instant.parse("2026-08-15T00:00:00Z"));
        given(catalog.editionBelongsToReleaseGroup("release-group", "release")).willReturn(true);
        given(catalog.search("Forged album", "Forged artist")).willReturn(List.of(canonical));
        given(catalog.tracks("release-group", "release"))
                .willReturn(List.of(new MusicCatalogGateway.Track("track", "Verified track", 1)));
        given(records.findByCatalogIdentity("MUSICBRAINZ", "release-group"))
                .willReturn(Optional.empty(), Optional.of(concurrent));
        given(records.list()).willReturn(List.of());
        given(records.create(any())).willReturn(new NotionClient.SavedRecord("created-page", Instant.parse("2026-08-15T00:00:00Z")));
        given(records.archive("created-page")).willReturn(new NotionClient.SavedRecord("created-page", Instant.parse("2026-08-15T00:00:01Z")));
        given(records.update(any(), any())).willReturn(new NotionClient.SavedRecord("concurrent-page", Instant.parse("2026-08-15T00:00:01Z")));

        ConnectedMusicService.SaveResult result = service.save(input("Forged album", "Forged artist", "", "Verified track"));

        assertThat(result.operation()).isEqualTo(ConnectedMusicService.SaveOperation.UPDATED);
        verify(records).archive("created-page");
        verify(records).update(eq("concurrent-page"), any());
    }

    private static ConnectedMusicService.RecordInput input(String title, String artist, String coverUrl, String favouriteTrack) {
        return new ConnectedMusicService.RecordInput(
                "release-group", "release", title, artist, coverUrl, "Loved", favouriteTrack, false, List.of(artist));
    }
}
