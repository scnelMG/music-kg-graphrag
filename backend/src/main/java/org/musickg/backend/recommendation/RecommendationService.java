package org.musickg.backend.recommendation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public final class RecommendationService {
    public static final int TOP_K = 5;
    public static final int MAX_GENERATED_CANDIDATES = 100;
    public static final int MAX_PATH_HOPS = 3;
    private static final Policy POLICY = new Policy(
            "personal-graph-lexical-v1",
            new Weights(new BigDecimal("0.35"), new BigDecimal("0.25"),
                    new BigDecimal("0.20"), new BigDecimal("0.10"), new BigDecimal("0.10")));

    private final List<CandidateEvidence> generatedCandidates;

    public RecommendationService() {
        this(RecommendationCandidateGenerator.generate(
                RecommendationFixtureFacts.graphFacts(), RecommendationFixtureFacts.lexicalFacts()));
    }

    RecommendationService(List<CandidateEvidence> generatedCandidates) {
        this.generatedCandidates = List.copyOf(generatedCandidates);
        if (this.generatedCandidates.size() > MAX_GENERATED_CANDIDATES) {
            throw new IllegalArgumentException("Candidate generation exceeds fixed limit of " + MAX_GENERATED_CANDIDATES);
        }
    }

    public static RecommendationService fixtureService() {
        return new RecommendationService();
    }

    public Result recommend(Request request) {
        QuestionClass questionClass = QuestionClass.parse(request.questionClass());
        Set<String> excludedIdentityIds = Set.copyOf(request.excludedIdentityIds());
        List<Exclusion> exclusions = new ArrayList<>();
        List<ScoredCandidate> scored = new ArrayList<>();

        generatedCandidates.stream()
                .filter(candidate -> candidate.questionClasses().contains(questionClass))
                .sorted(Comparator.comparing(CandidateEvidence::candidateId))
                .forEach(candidate -> {
                    ExclusionReason reason = preRankExclusion(candidate, excludedIdentityIds);
                    if (reason == null) {
                        scored.add(score(candidate));
                    } else {
                        exclusions.add(new Exclusion(candidate.candidateId(), candidate.releaseGroupId(), reason));
                    }
                });

        scored.sort(Comparator.comparing(ScoredCandidate::totalScore).reversed()
                .thenComparing(candidate -> candidate.evidence().candidateId()));
        Set<String> releaseGroups = new HashSet<>();
        List<RankedCandidate> ranked = new ArrayList<>();
        for (ScoredCandidate candidate : scored) {
            CandidateEvidence evidence = candidate.evidence();
            if (!releaseGroups.add(evidence.releaseGroupId())) {
                exclusions.add(new Exclusion(evidence.candidateId(), evidence.releaseGroupId(), ExclusionReason.DUPLICATE_RELEASE));
                continue;
            }
            if (evidence.alreadyReviewed() || !disjoint(evidence.identityIds(), excludedIdentityIds)) {
                exclusions.add(new Exclusion(evidence.candidateId(), evidence.releaseGroupId(),
                        evidence.alreadyReviewed() ? ExclusionReason.ALREADY_REVIEWED : ExclusionReason.EXCLUDED_IDENTITY));
                continue;
            }
            if (ranked.size() < TOP_K) ranked.add(toRanked(candidate));
        }
        exclusions.sort(Comparator.comparing(Exclusion::candidateId).thenComparing(Exclusion::reason));

        if (ranked.isEmpty()) {
            return new Result(Status.INSUFFICIENT_EVIDENCE, questionClass, POLICY.version(), POLICY.weights(),
                    List.of(), List.copyOf(exclusions), "NO_SUPPORTED_CANDIDATE_EVIDENCE");
        }
        return new Result(Status.RECOMMENDATIONS_AVAILABLE, questionClass, POLICY.version(), POLICY.weights(),
                List.copyOf(ranked), List.copyOf(exclusions), null);
    }

    private static ExclusionReason preRankExclusion(CandidateEvidence candidate, Set<String> excludedIdentityIds) {
        if (candidate.alreadyReviewed()) return ExclusionReason.ALREADY_REVIEWED;
        if (!disjoint(candidate.identityIds(), excludedIdentityIds)) return ExclusionReason.EXCLUDED_IDENTITY;
        if (candidate.evidencePaths().isEmpty() || candidate.evidencePaths().stream().anyMatch(path -> !path.isValid())) {
            return ExclusionReason.INVALID_EVIDENCE_PATH;
        }
        return null;
    }

    private static boolean disjoint(Set<String> left, Set<String> right) {
        return left.stream().noneMatch(right::contains);
    }

    private static ScoredCandidate score(CandidateEvidence candidate) {
        Weights weights = POLICY.weights();
        ScoreComponents components = new ScoreComponents(
                weighted(candidate.personalEvidence(), weights.personalEvidence()),
                weighted(candidate.pathStrength(), weights.pathStrength()),
                weighted(candidate.metadataRelevance(), weights.metadataRelevance()),
                weighted(candidate.novelty(), weights.novelty()),
                weighted(candidate.diversity(), weights.diversity()));
        return new ScoredCandidate(candidate, components, components.sum());
    }

    private static BigDecimal weighted(BigDecimal value, BigDecimal weight) {
        return value.multiply(weight).setScale(6, RoundingMode.HALF_UP);
    }

    private static RankedCandidate toRanked(ScoredCandidate candidate) {
        CandidateEvidence evidence = candidate.evidence();
        return new RankedCandidate(evidence.candidateId(), evidence.releaseGroupId(), evidence.title(),
                candidate.components(), candidate.totalScore(), evidence.routes().stream().sorted().toList(),
                evidence.evidencePaths(),
                evidence.evidencePaths().stream().map(EvidencePath::evidenceId).distinct().sorted().toList());
    }

    public enum QuestionClass {
        PERSONAL_DISCOVERY, SIMILAR_TO_REVIEWED;

        static QuestionClass parse(String value) {
            if (value == null || value.isBlank()) throw new UnsupportedQuestionClassException(value);
            try {
                return valueOf(value);
            } catch (IllegalArgumentException exception) {
                throw new UnsupportedQuestionClassException(value);
            }
        }
    }

    public enum GenerationRoute { GRAPH_PATH, LEXICAL_METADATA }
    public enum Status { RECOMMENDATIONS_AVAILABLE, INSUFFICIENT_EVIDENCE }
    public enum ExclusionReason { ALREADY_REVIEWED, DUPLICATE_RELEASE, EXCLUDED_IDENTITY, INVALID_EVIDENCE_PATH }

    public record Request(String questionClass, Set<String> excludedIdentityIds) {
        public Request { excludedIdentityIds = excludedIdentityIds == null ? Set.of() : Set.copyOf(excludedIdentityIds); }
    }

    public record EvidencePath(GenerationRoute route, String evidenceId, List<String> nodeIds, List<String> edgeIds,
                               List<String> sourceIds, int hopCount) {
        public EvidencePath {
            nodeIds = List.copyOf(nodeIds);
            edgeIds = List.copyOf(edgeIds);
            sourceIds = List.copyOf(sourceIds);
            String requiredPrefix = route == GenerationRoute.GRAPH_PATH ? "music:" : "lexical:";
            if (edgeIds.stream().anyMatch(edgeId -> !edgeId.startsWith(requiredPrefix))) {
                throw new IllegalArgumentException("Evidence edges do not match generation route " + route);
            }
        }

        boolean isValid() {
            return evidenceId != null && !evidenceId.isBlank() && hopCount > 0 && hopCount <= MAX_PATH_HOPS
                    && nodeIds.size() == hopCount + 1 && edgeIds.size() == hopCount && !sourceIds.isEmpty()
                    && nodeIds.stream().noneMatch(String::isBlank) && edgeIds.stream().noneMatch(String::isBlank)
                    && sourceIds.stream().noneMatch(String::isBlank);
        }
    }

    public record CandidateEvidence(String candidateId, String releaseGroupId, String title, Set<String> identityIds,
                                    boolean alreadyReviewed, Set<QuestionClass> questionClasses,
                                    List<EvidencePath> evidencePaths,
                                    BigDecimal personalEvidence, BigDecimal pathStrength,
                                    BigDecimal metadataRelevance, BigDecimal novelty, BigDecimal diversity) {
        public CandidateEvidence {
            identityIds = Set.copyOf(identityIds);
            questionClasses = Set.copyOf(questionClasses);
            evidencePaths = List.copyOf(evidencePaths);
        }

        Set<GenerationRoute> routes() {
            return evidencePaths.stream().map(EvidencePath::route)
                    .collect(java.util.stream.Collectors.toUnmodifiableSet());
        }
    }

    public record Weights(BigDecimal personalEvidence, BigDecimal pathStrength, BigDecimal metadataRelevance,
                          BigDecimal novelty, BigDecimal diversity) {}
    public record ScoreComponents(BigDecimal personalEvidence, BigDecimal pathStrength, BigDecimal metadataRelevance,
                                  BigDecimal novelty, BigDecimal diversity) {
        BigDecimal sum() { return personalEvidence.add(pathStrength).add(metadataRelevance).add(novelty).add(diversity); }
    }
    public record RankedCandidate(String candidateId, String releaseGroupId, String title, ScoreComponents score,
                                  BigDecimal totalScore, List<GenerationRoute> generationRoutes,
                                  List<EvidencePath> evidencePaths, List<String> evidenceIds) {}
    public record Exclusion(String candidateId, String releaseGroupId, ExclusionReason reason) {}
    public record Result(Status status, QuestionClass questionClass, String policyVersion, Weights weights,
                         List<RankedCandidate> recommendations, List<Exclusion> exclusions, String refusalReason) {}
    private record Policy(String version, Weights weights) {}
    private record ScoredCandidate(CandidateEvidence evidence, ScoreComponents components, BigDecimal totalScore) {}

    public static final class UnsupportedQuestionClassException extends IllegalArgumentException {
        public UnsupportedQuestionClassException(String value) { super("Unsupported recommendation question class: " + value); }
    }
}
