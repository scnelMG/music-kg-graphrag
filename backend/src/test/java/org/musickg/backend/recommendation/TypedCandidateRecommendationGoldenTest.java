package org.musickg.backend.recommendation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.musickg.backend.recommendation.RecommendationService.EvidencePath;
import org.musickg.backend.recommendation.RecommendationService.GenerationRoute;

class TypedCandidateRecommendationGoldenTest {
    @Test
    void graphFactChangeChangesGeneratedCandidateAndCausalPath() {
        // Given
        var graphFact = RecommendationFixtureFacts.graphFacts().getFirst();
        var changedFact = new RecommendationCandidateGenerator.GraphFact(
                graphFact.candidate().withIdentity(
                        "release-group:changed", "release-group:changed", "Changed Graph Candidate"),
                graphFact.originNodeId(), graphFact.relationNodeId(), graphFact.relations(),
                "evidence:changed-graph-001", graphFact.sourceIds());

        // When
        var generated = RecommendationCandidateGenerator.generate(List.of(changedFact), List.of());

        // Then
        assertEquals(List.of("release-group:changed"),
                generated.stream().map(RecommendationService.CandidateEvidence::candidateId).toList());
        assertEquals(List.of("review:crumbling-fixture", "genre:folktronica", "release-group:changed"),
                generated.getFirst().evidencePaths().getFirst().nodeIds());
        assertFalse(generated.stream().anyMatch(candidate ->
                candidate.candidateId().equals("release-group:world-of-sleepers")));
    }

    @Test
    void generatorsOwnRouteProvenanceAndRejectRelabeling() {
        // Given
        var graphCandidate = RecommendationCandidateGenerator.generate(
                List.of(RecommendationFixtureFacts.graphFacts().getFirst()), List.of()).getFirst();
        var lexicalCandidate = RecommendationCandidateGenerator.generate(
                List.of(), List.of(RecommendationFixtureFacts.lexicalFacts().getFirst())).getFirst();
        EvidencePath graphPath = graphCandidate.evidencePaths().getFirst();

        // When / Then
        assertEquals(GenerationRoute.GRAPH_PATH, graphPath.route());
        assertEquals(GenerationRoute.LEXICAL_METADATA, lexicalCandidate.evidencePaths().getFirst().route());
        assertTrue(graphPath.edgeIds().stream().allMatch(edge -> edge.startsWith("music:")));
        assertTrue(lexicalCandidate.evidencePaths().getFirst().edgeIds().stream()
                .allMatch(edge -> edge.startsWith("lexical:")));
        assertThrows(IllegalArgumentException.class, () -> new EvidencePath(
                GenerationRoute.LEXICAL_METADATA, graphPath.evidenceId(), graphPath.nodeIds(),
                graphPath.edgeIds(), graphPath.sourceIds(), graphPath.hopCount()));
    }
}
