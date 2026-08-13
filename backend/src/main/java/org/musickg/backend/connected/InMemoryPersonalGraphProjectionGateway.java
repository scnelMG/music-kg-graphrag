package org.musickg.backend.connected;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.time.Instant;
import org.musickg.backend.notion.NotionClient;

final class InMemoryPersonalGraphProjectionGateway implements PersonalGraphProjectionGateway {
    private final Map<String, NotionClient.ExistingRecord> recordsByPageId = new LinkedHashMap<>();
    private Optional<Instant> checkpoint = Optional.empty();

    @Override
    public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) {
        return evidence(history);
    }

    @Override
    public void bootstrapRecords(List<NotionClient.ExistingRecord> records) {
        recordsByPageId.clear();
        replaceRecords(records);
    }

    @Override
    public List<ArtistEvidence> retrieveEvidence() {
        return evidence(new ArrayList<>(recordsByPageId.values()));
    }

    private static List<ArtistEvidence> evidence(List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .filter(PersonalTasteWeights::supportsRecommendation)
                .flatMap(record -> record.artistCredits().stream())
                .distinct()
                .map(artist -> evidence(history, artist))
                .sorted(Comparator.comparing(ArtistEvidence::score).reversed().thenComparing(ArtistEvidence::artist))
                .limit(3)
                .toList();
    }

    @Override
    public String retrievalMethod() {
        return "PERSONAL_EVIDENCE_GRAPH_TRAVERSAL";
    }

    @Override
    public void replaceRecords(List<NotionClient.ExistingRecord> records) {
        for (NotionClient.ExistingRecord record : records) recordsByPageId.put(record.pageId(), record);
    }

    @Override
    public void removeRecord(String pageId) {
        recordsByPageId.remove(pageId);
    }

    @Override
    public SyncSnapshot syncSnapshot() {
        return new SyncSnapshot(checkpoint);
    }

    @Override
    public void markSynchronized(Instant checkpoint) {
        this.checkpoint = Optional.of(checkpoint);
    }

    @Override
    public List<NotionClient.ExistingRecord> retrieveRecords() {
        return recordsByPageId.values().stream()
                .sorted(Comparator.comparing(NotionClient.ExistingRecord::lastEditedAt).reversed()
                        .thenComparing(NotionClient.ExistingRecord::pageId))
                .toList();
    }

    private static ArtistEvidence evidence(List<NotionClient.ExistingRecord> history, String artist) {
        List<NotionClient.ExistingRecord> matching = history.stream()
                .filter(record -> record.artistCredits().stream().anyMatch(credit -> credit.equalsIgnoreCase(artist)))
                .toList();
        long score = matching.stream().mapToLong(InMemoryPersonalGraphProjectionGateway::weight).sum();
        List<String> pageIds = matching.stream().map(NotionClient.ExistingRecord::pageId).sorted().toList();
        return new ArtistEvidence(artist, score, pageIds);
    }

    private static long weight(NotionClient.ExistingRecord record) {
        return PersonalTasteWeights.weight(record);
    }
}
