package org.musickg.backend.recommendation;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.musickg.backend.recommendation.RecommendationService.CandidateEvidence;
import org.musickg.backend.recommendation.RecommendationService.EvidencePath;
import org.musickg.backend.recommendation.RecommendationService.GenerationRoute;
import org.musickg.backend.recommendation.RecommendationService.QuestionClass;

final class RecommendationCandidateGenerator {
    private RecommendationCandidateGenerator() {}

    static List<CandidateEvidence> generate(List<GraphFact> graphFacts, List<LexicalFact> lexicalFacts) {
        return Stream.concat(
                        graphFacts.stream().map(GraphCandidateGenerator::generate),
                        lexicalFacts.stream().map(LexicalCandidateGenerator::generate))
                .toList();
    }

    enum GraphRelation {
        USER_PREFERENCE("music:hasPreference"), MATCHES_ENTITY("music:matches");
        private final String edgeId;
        GraphRelation(String edgeId) { this.edgeId = edgeId; }
        String edgeId() { return edgeId; }
    }

    enum LexicalRelation {
        REVIEW_TERM("lexical:reviewTerm"), METADATA_MATCH("lexical:metadataMatch");
        private final String edgeId;
        LexicalRelation(String edgeId) { this.edgeId = edgeId; }
        String edgeId() { return edgeId; }
    }

    record CandidateFact(String candidateId, String releaseGroupId, String title, Set<String> identityIds,
                         boolean alreadyReviewed, Set<QuestionClass> questionClasses,
                         BigDecimal personalEvidence, BigDecimal pathStrength, BigDecimal metadataRelevance,
                         BigDecimal novelty, BigDecimal diversity) {
        CandidateFact {
            identityIds = Set.copyOf(identityIds);
            questionClasses = Set.copyOf(questionClasses);
        }

        CandidateFact withIdentity(String changedCandidateId, String changedReleaseGroupId, String changedTitle) {
            return new CandidateFact(changedCandidateId, changedReleaseGroupId, changedTitle, identityIds,
                    alreadyReviewed, questionClasses, personalEvidence, pathStrength, metadataRelevance,
                    novelty, diversity);
        }

        CandidateEvidence withPath(EvidencePath path) {
            return new CandidateEvidence(candidateId, releaseGroupId, title, identityIds, alreadyReviewed,
                    questionClasses, List.of(path), personalEvidence, pathStrength, metadataRelevance,
                    novelty, diversity);
        }
    }

    record GraphFact(CandidateFact candidate, String originNodeId, String relationNodeId,
                     List<GraphRelation> relations, String evidenceId, List<String> sourceIds) {
        GraphFact {
            relations = List.copyOf(relations);
            sourceIds = List.copyOf(sourceIds);
            if (relations.size() != 2) throw new IllegalArgumentException("Graph fixture paths must have two relations");
        }
    }

    record LexicalFact(CandidateFact candidate, String originNodeId, String termNodeId,
                       List<LexicalRelation> relations, String evidenceId, List<String> sourceIds) {
        LexicalFact {
            relations = List.copyOf(relations);
            sourceIds = List.copyOf(sourceIds);
            if (relations.size() != 2) throw new IllegalArgumentException("Lexical fixture paths must have two relations");
        }
    }
}

final class GraphCandidateGenerator {
    private GraphCandidateGenerator() {}

    static CandidateEvidence generate(RecommendationCandidateGenerator.GraphFact fact) {
        EvidencePath path = new EvidencePath(GenerationRoute.GRAPH_PATH, fact.evidenceId(),
                List.of(fact.originNodeId(), fact.relationNodeId(), fact.candidate().candidateId()),
                fact.relations().stream().map(RecommendationCandidateGenerator.GraphRelation::edgeId).toList(),
                fact.sourceIds(), fact.relations().size());
        return fact.candidate().withPath(path);
    }
}

final class LexicalCandidateGenerator {
    private LexicalCandidateGenerator() {}

    static CandidateEvidence generate(RecommendationCandidateGenerator.LexicalFact fact) {
        EvidencePath path = new EvidencePath(GenerationRoute.LEXICAL_METADATA, fact.evidenceId(),
                List.of(fact.originNodeId(), fact.termNodeId(), fact.candidate().candidateId()),
                fact.relations().stream().map(RecommendationCandidateGenerator.LexicalRelation::edgeId).toList(),
                fact.sourceIds(), fact.relations().size());
        return fact.candidate().withPath(path);
    }
}
