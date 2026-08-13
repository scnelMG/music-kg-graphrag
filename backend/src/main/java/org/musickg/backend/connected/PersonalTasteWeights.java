package org.musickg.backend.connected;

import java.util.Locale;
import org.musickg.backend.notion.NotionClient;

final class PersonalTasteWeights {
    private PersonalTasteWeights() {}

    static boolean supportsRecommendation(NotionClient.ExistingRecord record) {
        return sentimentWeight(record.sentiment()) > 0;
    }

    static long weight(NotionClient.ExistingRecord record) {
        int sentiment = sentimentWeight(record.sentiment());
        if (sentiment == 0) return 0;
        return sentiment + (record.owned() ? 2L : 0L) + (record.favouriteTrack().isBlank() ? 0L : 1L);
    }

    private static int sentimentWeight(String sentiment) {
        String normalized = sentiment == null ? "" : sentiment.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
        if (normalized.contains("내취향아님") || normalized.contains("아쉬움") || normalized.contains("싫")
                || normalized.contains("dislike") || normalized.contains("notforme")) return 0;
        if (normalized.contains("애착") || normalized.contains("최애") || normalized.contains("love")) return 5;
        if (normalized.contains("마음에쏙") || normalized.contains("좋") || normalized.contains("like")) return 4;
        if (normalized.contains("꽤괜") || normalized.contains("보통") || normalized.contains("쏘쏘")) return 2;
        return 1;
    }
}
