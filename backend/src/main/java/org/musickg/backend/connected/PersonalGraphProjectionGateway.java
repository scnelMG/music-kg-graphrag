package org.musickg.backend.connected;

import java.util.List;
import org.musickg.backend.notion.NotionClient;

public interface PersonalGraphProjectionGateway {
    List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history);

    String retrievalMethod();

    record ArtistEvidence(String artist, long score, List<String> pageIds) {
        public ArtistEvidence {
            pageIds = List.copyOf(pageIds);
        }
    }
}
