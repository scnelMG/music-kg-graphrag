package org.musickg.backend.catalog;

import java.util.List;

public interface MusicCatalogGateway {
    List<Album> search(String query);

    List<Album> search(String albumTitle, String artist);

    List<Album> searchByArtist(String artist);

    default List<Album> searchByTag(String tag) {
        return List.of();
    }

    default List<String> tags(String releaseGroupMbid) {
        return List.of();
    }

    default List<Track> tracks(String releaseGroupMbid) {
        throw new UnsupportedOperationException("MUSICBRAINZ_TRACK_LOOKUP_UNSUPPORTED");
    }

    default void verifyReadiness() {
        search("music-kg-readiness-probe");
    }

    record Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl,
                 List<String> artistCredits) {
        public Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl) {
            this(releaseGroupMbid, title, artist, firstReleaseDate, coverUrl, List.of(artist));
        }

        public Album {
            artistCredits = artistCredits == null ? List.of() : List.copyOf(artistCredits);
        }
    }

    record Track(String recordingMbid, String title, int position) {}
}
