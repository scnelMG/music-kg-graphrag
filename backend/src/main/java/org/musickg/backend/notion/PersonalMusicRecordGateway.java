package org.musickg.backend.notion;

import java.util.List;
import java.util.Optional;

public interface PersonalMusicRecordGateway {
    NotionClient.SavedRecord create(NotionClient.Record record);

    NotionClient.SavedRecord update(String pageId, NotionClient.Record record);

    NotionClient.SavedRecord archive(String pageId);

    List<NotionClient.ExistingRecord> list();

    default Optional<NotionClient.ExistingRecord> findByReleaseGroupMbid(String releaseGroupMbid) {
        return Optional.empty();
    }

    List<String> sentimentOptions();
}
