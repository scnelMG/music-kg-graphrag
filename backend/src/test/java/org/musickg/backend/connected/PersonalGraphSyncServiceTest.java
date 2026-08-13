package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.musickg.backend.notion.NotionClient;
import org.musickg.backend.notion.PersonalMusicRecordGateway;

class PersonalGraphSyncServiceTest {
    private static final Instant NOW = Instant.parse("2026-08-13T00:00:10Z");

    @Test
    void bootstrapsThePrivateGraphFromNotionOnlyWhenNoCheckpointExists() {
        var records = new RecordingRecords(List.of(record("page-a", "2026-08-13T00:00:01Z")), List.of());
        var graph = new RecordingGraph(Optional.empty());
        var sync = new PersonalGraphSyncService(records, graph, Clock.fixed(NOW, ZoneOffset.UTC));

        var state = sync.synchronize();

        assertThat(records.listCalls).isEqualTo(1);
        assertThat(records.changedSinceCalls).isEmpty();
        assertThat(graph.bootstrapped).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-a");
        assertThat(graph.replaced).isEmpty();
        assertThat(graph.checkpoint).contains(NOW);
        assertThat(state.status()).isEqualTo(PersonalGraphSyncService.Status.CURRENT);
        assertThat(state.changedRecordCount()).isEqualTo(1);
    }

    @Test
    void readsOnlyEditedNotionRecordsAfterTheStoredCheckpoint() {
        Instant checkpoint = Instant.parse("2026-08-13T00:00:05Z");
        var records = new RecordingRecords(List.of(record("page-a", "2026-08-13T00:00:01Z")),
                List.of(record("page-b", "2026-08-13T00:00:07Z")));
        var graph = new RecordingGraph(Optional.of(checkpoint));
        var sync = new PersonalGraphSyncService(records, graph, Clock.fixed(NOW, ZoneOffset.UTC));

        var state = sync.synchronize();

        assertThat(records.listCalls).isZero();
        assertThat(records.changedSinceCalls).containsExactly(checkpoint.minusSeconds(2));
        assertThat(graph.replaced).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-b");
        assertThat(graph.checkpoint).contains(NOW);
        assertThat(state.changedRecordCount()).isEqualTo(1);
    }

    @Test
    void reportsTheTypedNotionFailureWhenThePrivateGraphHasNeverBeenBootstrapped() {
        var records = new RecordingRecords(List.of(), List.of()).failingListWith(new NotionClient.AccessException("NOTION_UNAVAILABLE"));
        var graph = new RecordingGraph(Optional.empty());
        var sync = new PersonalGraphSyncService(records, graph, Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatThrownBy(sync::synchronize)
                .isInstanceOf(NotionClient.AccessException.class)
                .hasMessage("NOTION_UNAVAILABLE");
        assertThat(graph.checkpoint).isEmpty();
    }

    @Test
    void reconcilesThePrivateGraphOnlyWhenAnExplicitFullComparisonIsRequested() {
        Instant checkpoint = Instant.parse("2026-08-13T00:00:05Z");
        var records = new RecordingRecords(List.of(record("page-current", "2026-08-13T00:00:07Z")), List.of());
        var graph = new RecordingGraph(Optional.of(checkpoint));
        var sync = new PersonalGraphSyncService(records, graph, Clock.fixed(NOW, ZoneOffset.UTC));

        var state = sync.reconcile();

        assertThat(records.listCalls).isEqualTo(1);
        assertThat(records.changedSinceCalls).isEmpty();
        assertThat(graph.bootstrapped).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-current");
        assertThat(state.status()).isEqualTo(PersonalGraphSyncService.Status.CURRENT);
    }

    @Test
    void keepsNegativeRecordsInThePrivateGraphForTasteAnalysis() {
        var disliked = new NotionClient.ExistingRecord("page-disliked", "Album", "Artist", "", "Not for me", "Track", false,
                "release-disliked", List.of("Artist"), Instant.parse("2026-08-13T00:00:01Z"));
        var records = new RecordingRecords(List.of(disliked), List.of());
        var graph = new RecordingGraph(Optional.empty());
        var sync = new PersonalGraphSyncService(records, graph, Clock.fixed(NOW, ZoneOffset.UTC));

        sync.synchronize();

        assertThat(graph.bootstrapped).extracting(NotionClient.ExistingRecord::pageId).containsExactly("page-disliked");
    }

    private static NotionClient.ExistingRecord record(String pageId, String lastEditedAt) {
        return new NotionClient.ExistingRecord(pageId, "Album", "Artist", "", "Loved", "Track", false,
                "release-" + pageId, List.of("Artist"), Instant.parse(lastEditedAt));
    }

    private static final class RecordingRecords implements PersonalMusicRecordGateway {
        private final List<NotionClient.ExistingRecord> all;
        private final List<NotionClient.ExistingRecord> changed;
        private final List<Instant> changedSinceCalls = new ArrayList<>();
        private int listCalls;
        private RuntimeException listFailure;

        private RecordingRecords(List<NotionClient.ExistingRecord> all, List<NotionClient.ExistingRecord> changed) {
            this.all = all;
            this.changed = changed;
        }

        @Override public NotionClient.SavedRecord create(NotionClient.Record record) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord update(String pageId, NotionClient.Record record) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord archive(String pageId) { throw new UnsupportedOperationException(); }
        @Override public NotionClient.SavedRecord restore(String pageId) { throw new UnsupportedOperationException(); }
        @Override public List<NotionClient.ExistingRecord> list() {
            listCalls++;
            if (listFailure != null) throw listFailure;
            return all;
        }
        @Override public List<NotionClient.ExistingRecord> changedSince(Instant after) { changedSinceCalls.add(after); return changed; }
        @Override public List<String> sentimentOptions() { return List.of("Loved"); }

        private RecordingRecords failingListWith(RuntimeException exception) {
            listFailure = exception;
            return this;
        }
    }

    private static final class RecordingGraph implements PersonalGraphProjectionGateway {
        private final List<NotionClient.ExistingRecord> bootstrapped = new ArrayList<>();
        private final List<NotionClient.ExistingRecord> replaced = new ArrayList<>();
        private Optional<Instant> checkpoint;

        private RecordingGraph(Optional<Instant> checkpoint) {
            this.checkpoint = checkpoint;
        }

        @Override public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) { return List.of(); }
        @Override public void bootstrapRecords(List<NotionClient.ExistingRecord> records) { bootstrapped.addAll(records); }
        @Override public void replaceRecords(List<NotionClient.ExistingRecord> records) { replaced.addAll(records); }
        @Override public SyncSnapshot syncSnapshot() { return new SyncSnapshot(checkpoint); }
        @Override public void markSynchronized(Instant value) { checkpoint = Optional.of(value); }
        @Override public String retrievalMethod() { return "TEST"; }
    }
}
