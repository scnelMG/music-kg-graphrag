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

    default List<Edition> editions(String releaseGroupMbid) {
        throw new UnsupportedOperationException("MUSICBRAINZ_EDITION_LOOKUP_UNSUPPORTED");
    }

    default EditionPage editions(String releaseGroupMbid, String cursor, String selectedReleaseMbid) {
        List<Edition> values = editions(releaseGroupMbid);
        int offset = cursor == null || cursor.isBlank() ? 0 : Integer.parseInt(cursor);
        int end = Math.min(offset + 20, values.size());
        List<Edition> page = offset >= values.size() ? List.of() : values.subList(offset, end);
        return new EditionPage(page, end < values.size() ? Integer.toString(end) : null, end < values.size());
    }

    default boolean editionBelongsToReleaseGroup(String releaseGroupMbid, String releaseMbid) {
        return editions(releaseGroupMbid).stream().anyMatch(edition -> edition.releaseMbid().equals(releaseMbid));
    }

    default List<Track> tracks(String releaseGroupMbid) {
        throw new UnsupportedOperationException("MUSICBRAINZ_TRACK_LOOKUP_UNSUPPORTED");
    }

    default List<Track> tracks(String releaseGroupMbid, String releaseMbid) {
        if (releaseMbid == null || releaseMbid.isBlank()) {
            return tracks(releaseGroupMbid);
        }
        throw new UnsupportedOperationException("MUSICBRAINZ_EXPLICIT_RELEASE_TRACK_LOOKUP_UNSUPPORTED");
    }

    default void verifyReadiness() {
        search("music-kg-readiness-probe");
    }

    enum CatalogSource { MUSICBRAINZ, ITUNES }

    record Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl,
                 List<String> artistCredits, String primaryType, int searchScore, CatalogSource catalogSource,
                 String catalogId, String catalogUrl) {
        public Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl,
                     List<String> artistCredits, String primaryType, int searchScore) {
            this(releaseGroupMbid, title, artist, firstReleaseDate, coverUrl, artistCredits, primaryType, searchScore,
                    CatalogSource.MUSICBRAINZ, releaseGroupMbid, "");
        }

        public Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl,
                     List<String> artistCredits) {
            this(releaseGroupMbid, title, artist, firstReleaseDate, coverUrl, artistCredits, "Album", 0);
        }

        public Album(String releaseGroupMbid, String title, String artist, String firstReleaseDate, String coverUrl) {
            this(releaseGroupMbid, title, artist, firstReleaseDate, coverUrl, List.of(artist), "Album", 0);
        }

        public Album {
            artistCredits = artistCredits == null ? List.of() : List.copyOf(artistCredits);
            primaryType = primaryType == null ? "" : primaryType;
            catalogSource = catalogSource == null ? CatalogSource.MUSICBRAINZ : catalogSource;
            catalogId = catalogId == null ? "" : catalogId.trim();
            catalogUrl = catalogUrl == null ? "" : catalogUrl.trim();
            if (catalogSource == CatalogSource.MUSICBRAINZ && catalogId.isBlank()) catalogId = releaseGroupMbid;
        }
    }

    record Edition(String releaseMbid, String releaseGroupMbid, String title, String releaseDate, String country,
                   String status, String disambiguation, boolean recommended) {}

    record EditionPage(List<Edition> editions, String nextCursor, boolean hasMore) {
        public EditionPage {
            editions = editions == null ? List.of() : List.copyOf(editions);
            if (hasMore != (nextCursor != null && !nextCursor.isBlank())) {
                throw new IllegalArgumentException("MUSICBRAINZ_EDITION_CURSOR_CONTRACT_ERROR");
            }
        }
    }

    record Track(String recordingMbid, String title, int position) {}
}
