package org.musickg.backend.connected;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.musickg.backend.notion.NotionClient;

public interface PersonalGraphProjectionGateway {
    List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history);

    default void bootstrapRecords(List<NotionClient.ExistingRecord> records) {
        replaceRecords(records);
    }

    default void replaceRecords(List<NotionClient.ExistingRecord> records) {
        throw new UnsupportedOperationException("PERSONAL_GRAPH_INCREMENTAL_SYNC_UNSUPPORTED");
    }

    default void removeRecord(String pageId) {
        throw new UnsupportedOperationException("PERSONAL_GRAPH_INCREMENTAL_SYNC_UNSUPPORTED");
    }

    default SyncSnapshot syncSnapshot() {
        return new SyncSnapshot(Optional.empty());
    }

    default void markSynchronized(Instant checkpoint) {
        throw new UnsupportedOperationException("PERSONAL_GRAPH_INCREMENTAL_SYNC_UNSUPPORTED");
    }

    default List<NotionClient.ExistingRecord> retrieveRecords() {
        return List.of();
    }

    default List<ArtistEvidence> retrieveEvidence() {
        return List.of();
    }

    String retrievalMethod();

    default void verifyReadiness() {}

    record ArtistEvidence(String artist, long score, List<String> pageIds) {
        public ArtistEvidence {
            pageIds = List.copyOf(pageIds);
        }
    }

    record SyncSnapshot(Optional<Instant> checkpoint) {
        public SyncSnapshot {
            checkpoint = checkpoint == null ? Optional.empty() : checkpoint;
        }
    }
}
