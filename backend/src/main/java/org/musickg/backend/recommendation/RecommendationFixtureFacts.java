package org.musickg.backend.recommendation;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.musickg.backend.recommendation.RecommendationCandidateGenerator.CandidateFact;
import org.musickg.backend.recommendation.RecommendationCandidateGenerator.GraphFact;
import org.musickg.backend.recommendation.RecommendationCandidateGenerator.GraphRelation;
import org.musickg.backend.recommendation.RecommendationCandidateGenerator.LexicalFact;
import org.musickg.backend.recommendation.RecommendationCandidateGenerator.LexicalRelation;
import org.musickg.backend.recommendation.RecommendationService.QuestionClass;

final class RecommendationFixtureFacts {
    private static final List<String> SOURCES =
            List.of("source:fixture-owner-reviewed", "graph-snapshot:fixture-v1");

    private RecommendationFixtureFacts() {}

    static List<GraphFact> graphFacts() {
        return List.of(
                graph(candidate("release-group:world-of-sleepers", "release-group:world-of-sleepers", "World of Sleepers",
                                "artist:carbon-based-lifeforms", false, "0.95", "0.92", "0.88", "0.80", "0.75"),
                        "genre:folktronica", "evidence:preference-path-001"),
                graph(candidate("release-group:dive", "release-group:dive", "Dive", "artist:tycho", false,
                                "0.84", "0.81", "0.90", "0.72", "0.85"),
                        "context:late-night", "evidence:dive-graph-001"),
                graph(candidate("release:crumbling-kr", "release-group:crumbling", "Crumbling", "artist:mid-air-thief", true,
                                "1.00", "1.00", "1.00", "0.10", "0.10"),
                        "identity:crumbling", "evidence:already-reviewed-001"),
                graph(candidate("release:excluded-candidate", "release-group:excluded", "Excluded Fixture", "artist:excluded",
                                false, "0.90", "0.90", "0.70", "0.70", "0.70"),
                        "artist:excluded", "evidence:excluded-001"));
    }

    static List<LexicalFact> lexicalFacts() {
        return List.of(
                lexical(candidate("release:world-of-sleepers-deluxe", "release-group:world-of-sleepers",
                                "World of Sleepers Deluxe", "artist:carbon-based-lifeforms", false,
                                "0.70", "0.65", "0.75", "0.60", "0.60"),
                        "tag:folktronica", "evidence:similar-candidate-001"),
                lexical(candidate("release-group:immunity", "release-group:immunity", "Immunity", "artist:jon-hopkins", false,
                                "0.78", "0.70", "0.86", "0.88", "0.92"),
                        "tag:electronic", "evidence:immunity-lexical-001"));
    }

    private static GraphFact graph(CandidateFact candidate, String relationNodeId, String evidenceId) {
        return new GraphFact(candidate, "review:crumbling-fixture", relationNodeId,
                List.of(GraphRelation.USER_PREFERENCE, GraphRelation.MATCHES_ENTITY), evidenceId, SOURCES);
    }

    private static LexicalFact lexical(CandidateFact candidate, String termNodeId, String evidenceId) {
        return new LexicalFact(candidate, "review:crumbling-fixture", termNodeId,
                List.of(LexicalRelation.REVIEW_TERM, LexicalRelation.METADATA_MATCH), evidenceId, SOURCES);
    }

    private static CandidateFact candidate(String candidateId, String releaseGroupId, String title, String identityId,
                                           boolean reviewed, String personal, String strength, String metadata,
                                           String novelty, String diversity) {
        return new CandidateFact(candidateId, releaseGroupId, title, Set.of(identityId), reviewed,
                Set.of(QuestionClass.PERSONAL_DISCOVERY), decimal(personal), decimal(strength), decimal(metadata),
                decimal(novelty), decimal(diversity));
    }

    private static BigDecimal decimal(String value) { return new BigDecimal(value); }
}
