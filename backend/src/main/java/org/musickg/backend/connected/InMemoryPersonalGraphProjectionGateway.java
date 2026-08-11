package org.musickg.backend.connected;

import java.util.Comparator;
import java.util.List;
import org.musickg.backend.notion.NotionClient;

final class InMemoryPersonalGraphProjectionGateway implements PersonalGraphProjectionGateway {
    @Override
    public List<ArtistEvidence> projectAndRetrieve(List<NotionClient.ExistingRecord> history) {
        return history.stream()
                .map(NotionClient.ExistingRecord::artist)
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

    private static ArtistEvidence evidence(List<NotionClient.ExistingRecord> history, String artist) {
        List<NotionClient.ExistingRecord> matching = history.stream()
                .filter(record -> record.artist().equalsIgnoreCase(artist))
                .toList();
        long score = matching.stream().mapToLong(InMemoryPersonalGraphProjectionGateway::weight).sum();
        List<String> pageIds = matching.stream().map(NotionClient.ExistingRecord::pageId).sorted().toList();
        return new ArtistEvidence(artist, score, pageIds);
    }

    private static long weight(NotionClient.ExistingRecord record) {
        return 1L + (record.owned() ? 2L : 0L)
                + (record.favouriteTrack().isBlank() ? 0L : 1L)
                + (record.sentiment().isBlank() ? 0L : 1L);
    }
}
