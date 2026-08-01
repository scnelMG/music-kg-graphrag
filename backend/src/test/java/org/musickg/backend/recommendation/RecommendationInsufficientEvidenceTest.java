package org.musickg.backend.recommendation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RecommendationInsufficientEvidenceTest {
    @Test
    void refusesWhenNoTypedCandidateHasCausalEvidence() {
        // Given
        var service = new RecommendationService(List.of());
        var request = new RecommendationService.Request("PERSONAL_DISCOVERY", Set.of());

        // When
        var result = service.recommend(request);

        // Then
        assertEquals(RecommendationService.Status.INSUFFICIENT_EVIDENCE, result.status());
        assertTrue(result.recommendations().isEmpty());
        assertEquals("NO_SUPPORTED_CANDIDATE_EVIDENCE", result.refusalReason());
    }
}
