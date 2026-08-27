package org.musickg.backend.catalog;

import java.util.List;

public interface SupplementalCatalogGateway {
    List<MusicCatalogGateway.Album> search(String query);

    MusicCatalogGateway.Album album(String catalogId);

    List<MusicCatalogGateway.Track> tracks(String catalogId);

    static SupplementalCatalogGateway disabled() {
        return Disabled.INSTANCE;
    }

    enum Disabled implements SupplementalCatalogGateway {
        INSTANCE;

        @Override
        public List<MusicCatalogGateway.Album> search(String query) {
            return List.of();
        }

        @Override
        public MusicCatalogGateway.Album album(String catalogId) {
            throw new UnsupportedOperationException("SUPPLEMENTAL_CATALOG_DISABLED");
        }

        @Override
        public List<MusicCatalogGateway.Track> tracks(String catalogId) {
            return List.of();
        }
    }
}
