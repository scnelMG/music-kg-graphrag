package org.musickg.backend.notion;

import java.util.List;

public interface PersonalMusicRecordGateway {
    NotionClient.SavedRecord create(NotionClient.Record record);

    NotionClient.SavedRecord update(String pageId, NotionClient.Record record);

    NotionClient.SavedRecord archive(String pageId);

    List<NotionClient.ExistingRecord> list();

    List<String> sentimentOptions();
}
