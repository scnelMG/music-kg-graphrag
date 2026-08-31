package org.musickg.backend.catalog;

import java.util.Map;

final class MusicBrainzCache {
    static final int MAX_ENTRIES = 128;

    private MusicBrainzCache() {}

    static <T> void put(Map<String, T> entries, String key, T value) {
        synchronized (entries) {
            if (!entries.containsKey(key) && entries.size() >= MAX_ENTRIES) {
                entries.keySet().stream().findFirst().ifPresent(entries::remove);
            }
            entries.put(key, value);
        }
    }
}
