package org.musickg.backend.connected;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public interface GroundedExplanationGenerator {
    Generated generate(Context context);

    record Context(String question, List<Evidence> evidence) {
        public Context {
            if (question == null || question.isBlank()) throw new IllegalArgumentException("LLM_QUESTION_REQUIRED");
            evidence = List.copyOf(evidence == null ? List.of() : evidence);
            if (evidence.isEmpty()) throw new IllegalArgumentException("LLM_EVIDENCE_REQUIRED");
        }

        public Set<String> labels() {
            return evidence.stream().map(Evidence::label).collect(java.util.stream.Collectors.toUnmodifiableSet());
        }
    }

    record Evidence(String label, String albumTitle, String artist, String relation, String detail) {
        public Evidence {
            if (label == null || !label.matches("E[1-9][0-9]*")) throw new IllegalArgumentException("LLM_EVIDENCE_LABEL_INVALID");
            if (blank(albumTitle) || blank(artist) || blank(relation) || blank(detail)) {
                throw new IllegalArgumentException("LLM_EVIDENCE_INVALID");
            }
        }
    }

    record Generated(String answer, List<String> evidenceLabels) {
        public Generated {
            if (blank(answer) || answer.length() > 600) throw new IllegalArgumentException("LLM_ANSWER_INVALID");
            evidenceLabels = List.copyOf(evidenceLabels == null ? List.of() : evidenceLabels);
            if (evidenceLabels.isEmpty()) throw new IllegalArgumentException("LLM_CITATION_REQUIRED");
            if (new LinkedHashSet<>(evidenceLabels).size() != evidenceLabels.size()) {
                throw new IllegalArgumentException("LLM_CITATION_DUPLICATED");
            }
        }
    }

    static GroundedExplanationGenerator disabled() {
        return context -> { throw new GenerationException("LLM_DISABLED"); };
    }

    static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    final class GenerationException extends RuntimeException {
        public GenerationException(String code) { super(code); }
        public GenerationException(String code, Throwable cause) { super(code, cause); }
    }
}
