package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.musickg.backend.notion.NotionClient;

class PersonalTasteWeightsTest {
    @Test
    void excludesExplicitlyDislikedRecordsFromRecommendationEvidence() {
        var record = new NotionClient.ExistingRecord("page-id", "Album", "Artist", "", "내 취향 아님..", "Favourite", true, "release-group-id");

        assertThat(PersonalTasteWeights.supportsRecommendation(record)).isFalse();
        assertThat(PersonalTasteWeights.weight(record)).isZero();
    }

    @Test
    void givesAttachmentMoreEvidenceThanAnUnspecifiedRecord() {
        var attached = new NotionClient.ExistingRecord("page-a", "Album", "Artist", "", "애착 앨범", "Favourite", true, "release-group-id");
        var unspecified = new NotionClient.ExistingRecord("page-b", "Album", "Artist", "", "", "", false, "release-group-id");

        assertThat(PersonalTasteWeights.weight(attached)).isGreaterThan(PersonalTasteWeights.weight(unspecified));
    }
}
