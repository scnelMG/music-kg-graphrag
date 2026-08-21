package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class MusicCatalogGatewayTest {
    @Test
    void rejectsExplicitEditionTracksWhenALegacyGatewayOnlySupportsReleaseGroups() {
        MusicCatalogGateway legacyGateway = new MusicCatalogGateway() {
            @Override
            public List<Album> search(String query) {
                return List.of();
            }

            @Override
            public List<Album> search(String albumTitle, String artist) {
                return List.of();
            }

            @Override
            public List<Album> searchByArtist(String artist) {
                return List.of();
            }

            @Override
            public List<Track> tracks(String releaseGroupMbid) {
                return List.of(new Track("default-track", "Default track", 1));
            }
        };

        assertThatThrownBy(() -> legacyGateway.tracks("group-id", "release-id"))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessage("MUSICBRAINZ_EXPLICIT_RELEASE_TRACK_LOOKUP_UNSUPPORTED");
    }
}
