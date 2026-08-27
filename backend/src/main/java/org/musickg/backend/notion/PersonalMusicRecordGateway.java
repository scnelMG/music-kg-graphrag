package org.musickg.backend.notion;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PersonalMusicRecordGateway {
    NotionClient.SavedRecord create(NotionClient.Record record);

    NotionClient.SavedRecord update(String pageId, NotionClient.Record record);

    NotionClient.SavedRecord archive(String pageId);

    NotionClient.SavedRecord restore(String pageId);

    List<NotionClient.ExistingRecord> list();

    default List<NotionClient.ExistingRecord> changedSince(Instant after) {
        return list().stream()
                .filter(record -> record.lastEditedAt().isAfter(after))
                .toList();
    }

    default NotionClient.RecordPage listPage(int pageSize, String cursor) {
        if (cursor != null && !cursor.isBlank()) return new NotionClient.RecordPage(List.of(), null);
        List<NotionClient.ExistingRecord> records = list();
        return new NotionClient.RecordPage(records.subList(0, Math.min(Math.max(pageSize, 1), records.size())), null);
    }

    default Optional<NotionClient.ExistingRecord> findByReleaseGroupMbid(String releaseGroupMbid) {
        return Optional.empty();
    }

    default Optional<NotionClient.ExistingRecord> findByCatalogIdentity(String catalogSource, String catalogId) {
        if ("MUSICBRAINZ".equals(catalogSource)) return findByReleaseGroupMbid(catalogId);
        return Optional.empty();
    }

    List<String> sentimentOptions();

    default void verifyReadiness() {
        sentimentOptions();
    }
}
