package org.musickg.backend.connected;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

public final class PersonalGraphSyncService {
    private static final long OVERLAP_SECONDS = 2;
    private final PersonalMusicRecordGateway records;
    private final PersonalGraphProjectionGateway graph;
    private final Clock clock;
    private volatile SyncState lastState = new SyncState(Status.UNINITIALIZED, null, 0, false);

    public PersonalGraphSyncService(PersonalMusicRecordGateway records, PersonalGraphProjectionGateway graph, Clock clock) {
        this.records = records;
        this.graph = graph;
        this.clock = clock;
    }

    public synchronized SyncState synchronize() {
        PersonalGraphProjectionGateway.SyncSnapshot snapshot = null;
        try {
            snapshot = graph.syncSnapshot();
            boolean bootstrap = snapshot.checkpoint().isEmpty();
            List<NotionClient.ExistingRecord> changed = snapshot.checkpoint()
                    .map(checkpoint -> records.changedSince(checkpoint.minusSeconds(OVERLAP_SECONDS)))
                    .orElseGet(records::list);
            List<NotionClient.ExistingRecord> usable = changed.stream()
                    .filter(PersonalGraphSyncService::isUsableRecord).toList();
            if (bootstrap) graph.bootstrapRecords(usable);
            else {
                changed.stream().filter(record -> !isUsableRecord(record))
                        .map(NotionClient.ExistingRecord::pageId).forEach(graph::removeRecord);
                if (!usable.isEmpty()) graph.replaceRecords(usable);
            }
            Instant synchronizedAt = clock.instant();
            graph.markSynchronized(synchronizedAt);
            SyncState state = new SyncState(Status.CURRENT, synchronizedAt, usable.size(), false);
            lastState = state;
            return state;
        } catch (NotionClient.AccessException exception) {
            if (snapshot == null || snapshot.checkpoint().isEmpty()) throw exception;
            SyncState stale = new SyncState(Status.STALE, snapshot.checkpoint().orElseThrow(), 0, true);
            lastState = stale;
            return stale;
        } catch (RuntimeException exception) {
            SyncState stale = new SyncState(
                    lastState.lastSuccessfulAt() == null ? Status.UNINITIALIZED : Status.STALE,
                    lastState.lastSuccessfulAt(), 0, true);
            lastState = stale;
            return stale;
        }
    }

    public synchronized SyncState synchronizeRecord(NotionClient.ExistingRecord record) {
        try {
            if (isUsableRecord(record)) graph.replaceRecords(List.of(record));
            else graph.removeRecord(record.pageId());
            Instant synchronizedAt = clock.instant();
            graph.markSynchronized(synchronizedAt);
            SyncState state = new SyncState(Status.CURRENT, synchronizedAt, 1, false);
            lastState = state;
            return state;
        } catch (RuntimeException exception) {
            SyncState stale = new SyncState(
                    lastState.lastSuccessfulAt() == null ? Status.UNINITIALIZED : Status.STALE,
                    lastState.lastSuccessfulAt(), 0, true);
            lastState = stale;
            return stale;
        }
    }

    public synchronized SyncState reconcile() {
        try {
            List<NotionClient.ExistingRecord> recordsToProject = records.list().stream()
                    .filter(PersonalGraphSyncService::isUsableRecord)
                    .toList();
            graph.bootstrapRecords(recordsToProject);
            Instant synchronizedAt = clock.instant();
            graph.markSynchronized(synchronizedAt);
            SyncState state = new SyncState(Status.CURRENT, synchronizedAt, recordsToProject.size(), false);
            lastState = state;
            return state;
        } catch (RuntimeException exception) {
            SyncState stale = new SyncState(
                    lastState.lastSuccessfulAt() == null ? Status.UNINITIALIZED : Status.STALE,
                    lastState.lastSuccessfulAt(), 0, true);
            lastState = stale;
            return stale;
        }
    }

    public synchronized SyncState removeRecord(String pageId) {
        try {
            graph.removeRecord(pageId);
            Instant synchronizedAt = clock.instant();
            graph.markSynchronized(synchronizedAt);
            SyncState state = new SyncState(Status.CURRENT, synchronizedAt, 1, false);
            lastState = state;
            return state;
        } catch (RuntimeException exception) {
            SyncState stale = new SyncState(
                    lastState.lastSuccessfulAt() == null ? Status.UNINITIALIZED : Status.STALE,
                    lastState.lastSuccessfulAt(), 0, true);
            lastState = stale;
            return stale;
        }
    }

    public SyncState lastState() {
        return lastState;
    }

    private static boolean isUsableRecord(NotionClient.ExistingRecord record) {
        return record.catalogSource().equals("MUSICBRAINZ")
                && !record.releaseGroupMbid().isBlank()
                && !record.albumTitle().isBlank()
                && !record.artist().isBlank();
    }

    public enum Status { CURRENT, STALE, UNINITIALIZED }

    public record SyncState(Status status, Instant lastSuccessfulAt, int changedRecordCount, boolean stale) {}
}
