package org.musickg.backend.recommendation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RecommendationGoldenTest {
    private final RecommendationService service = RecommendationService.fixtureService();

    @Test
    void returnsExpectedCandidateInTopFiveWithCausalEvidence() {
        // Given
        var request = new RecommendationService.Request("PERSONAL_DISCOVERY", Set.of());

        // When
        var result = service.recommend(request);

        // Then
        assertEquals(RecommendationService.Status.RECOMMENDATIONS_AVAILABLE, result.status());
        assertTrue(result.recommendations().stream().limit(5)
                .anyMatch(candidate -> candidate.candidateId().equals("release-group:world-of-sleepers")));
        assertTrue(result.recommendations().stream().allMatch(candidate ->
                !candidate.evidenceIds().isEmpty()
                        && candidate.evidencePaths().stream().allMatch(path ->
                                path.hopCount() > 0 && path.hopCount() <= 3
                                        && path.nodeIds().size() == path.hopCount() + 1
                                        && path.edgeIds().size() == path.hopCount()
                                        && !path.sourceIds().isEmpty())));
    }

    @Test
    void suppressesDuplicateReleaseAndFiltersReviewedAndExcludedIdentities() {
        // Given
        var request = new RecommendationService.Request("PERSONAL_DISCOVERY", Set.of("artist:excluded"));

        // When
        var result = service.recommend(request);

        // Then
        assertEquals(1, result.recommendations().stream()
                .filter(candidate -> candidate.releaseGroupId().equals("release-group:world-of-sleepers"))
                .count());
        assertFalse(result.recommendations().stream()
                .anyMatch(candidate -> candidate.releaseGroupId().equals("release-group:crumbling")));
        assertTrue(result.exclusions().stream().anyMatch(exclusion ->
                exclusion.candidateId().equals("release:world-of-sleepers-deluxe")
                        && exclusion.reason() == RecommendationService.ExclusionReason.DUPLICATE_RELEASE));
        assertTrue(result.exclusions().stream().anyMatch(exclusion ->
                exclusion.candidateId().equals("release:crumbling-kr")
                        && exclusion.reason() == RecommendationService.ExclusionReason.ALREADY_REVIEWED));
        assertTrue(result.exclusions().stream().anyMatch(exclusion ->
                exclusion.candidateId().equals("release:excluded-candidate")
                        && exclusion.reason() == RecommendationService.ExclusionReason.EXCLUDED_IDENTITY));
    }

    @Test
    void returnsDeclaredScoreDecompositionAndDeterministicOrder() {
        // Given
        var request = new RecommendationService.Request("PERSONAL_DISCOVERY", Set.of());

        // When
        var first = service.recommend(request);
        var second = service.recommend(request);

        // Then
        assertEquals("personal-graph-lexical-v1", first.policyVersion());
        assertEquals(first, second);
        assertEquals(
                first.recommendations().stream().map(RecommendationService.RankedCandidate::candidateId).toList(),
                first.recommendations().stream()
                        .sorted((left, right) -> {
                            int score = right.totalScore().compareTo(left.totalScore());
                            return score != 0 ? score : left.candidateId().compareTo(right.candidateId());
                        })
                        .map(RecommendationService.RankedCandidate::candidateId)
                        .toList());
        assertTrue(first.recommendations().stream().allMatch(candidate -> {
            BigDecimal componentSum = candidate.score().personalEvidence()
                    .add(candidate.score().pathStrength())
                    .add(candidate.score().metadataRelevance())
                    .add(candidate.score().novelty())
                    .add(candidate.score().diversity());
            boolean routesAreTyped = candidate.generationRoutes().stream().allMatch(route ->
                    route == RecommendationService.GenerationRoute.GRAPH_PATH
                            || route == RecommendationService.GenerationRoute.LEXICAL_METADATA);
            return candidate.totalScore().compareTo(componentSum) == 0
                    && candidate.totalScore().compareTo(BigDecimal.ZERO) > 0
                    && routesAreTyped;
        }));
    }
}
