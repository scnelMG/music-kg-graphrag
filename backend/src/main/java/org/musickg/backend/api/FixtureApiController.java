package org.musickg.backend.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Set;
import org.musickg.backend.recommendation.RecommendationService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Fixture-safe music evidence API")
@ApiResponses({
        @ApiResponse(responseCode = "400", description = "Fixed request error", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")),
        @ApiResponse(responseCode = "403", description = "Fixed boundary error", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")),
        @ApiResponse(responseCode = "404", description = "Fixed not-found error", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")),
        @ApiResponse(responseCode = "409", description = "Fixed conflict error", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")),
        @ApiResponse(responseCode = "413", description = "PAYLOAD_TOO_LARGE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")),
        @ApiResponse(responseCode = "429", description = "RATE_LIMITED", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID"))
})
class FixtureApiController {
    private static final Set<String> QUESTION_CLASSES = Set.of("RECOMMENDATION_EXPLANATION", "EVIDENCE_SUMMARY");
    private final ApiProperties properties;
    private final RecommendationService recommendationService;

    FixtureApiController(ApiProperties properties, RecommendationService recommendationService) {
        this.properties = properties;
        this.recommendationService = recommendationService;
    }

    @GetMapping("/health")
    @Operation(summary = "Fixture-safe service health")
    Health health() { return new Health("ok", properties.mode().name().toLowerCase()); }

    @GetMapping("/candidates")
    @Operation(summary = "Search deterministic fixture candidates")
    List<Candidate> candidates(@RequestParam(defaultValue = "") String q) {
        return List.of(new Candidate("fixture-album-001", "Fixture Album", "Fixture Artist"));
    }

    @PostMapping("/candidates/{candidateId}/select")
    @Operation(summary = "Select a fixture candidate; NOTION_MAPPING_UNCONFIGURED is returned for Notion")
    Selection select(@PathVariable String candidateId, @RequestBody(required = false) SelectRequest request) {
        if (request != null && "NOTION".equals(request.destination())) {
            throw new ApiException("NOTION_MAPPING_UNCONFIGURED", HttpStatus.CONFLICT);
        }
        return new Selection(candidateId, "FIXTURE_SELECTED");
    }

    @PostMapping("/reviews")
    @Operation(summary = "Save a fixture review only")
    ReviewSaved review(@Valid @RequestBody ReviewRequest request) {
        if (request.writeIntent() != null && !request.writeIntent().isBlank()) {
            throw new ApiException("REAL_WRITE_FORBIDDEN", HttpStatus.FORBIDDEN);
        }
        return new ReviewSaved("fixture-review-001", "SAVED_IN_FIXTURE_MODE");
    }

    @GetMapping("/jobs/{jobId}")
    @Operation(summary = "Read a safe job status")
    JobStatus job(@PathVariable String jobId) { return new JobStatus(jobId, "NOT_CONFIGURED"); }

    @PostMapping("/recommendations")
    @Operation(summary = "Request fixed deterministic recommendations")
    RecommendationService.Result recommendation(@RequestBody RecommendationRequest request) {
        try {
            return recommendationService.recommend(
                    new RecommendationService.Request(request.questionClass(), request.excludedIdentityIds()));
        } catch (RecommendationService.UnsupportedQuestionClassException exception) {
            throw new ApiException("UNSUPPORTED_QUESTION_CLASS", HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/evidence/{evidenceId}")
    @Operation(summary = "Retrieve safe evidence; unknown ids return EVIDENCE_NOT_FOUND")
    @ApiResponses(@ApiResponse(responseCode = "404", description = "EVIDENCE_NOT_FOUND", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiError.class)), headers = @Header(name = "X-Request-Id", description = "Request correlation ID")))
    Evidence evidence(@PathVariable String evidenceId) {
        if (!"fixture-evidence-001".equals(evidenceId)) throw new ApiException("EVIDENCE_NOT_FOUND", HttpStatus.NOT_FOUND);
        return new Evidence(evidenceId, "fixture-album-001", "Fixture evidence only");
    }

    @PostMapping("/graphrag")
    @Operation(summary = "Run a fixed question-class evidence request")
    GraphRagAnswer graphRag(@RequestBody GraphRagRequest request) {
        if (request.questionClass() == null || request.questionClass().isBlank()) {
            throw new ApiException("MALFORMED_REQUEST", HttpStatus.BAD_REQUEST);
        }
        if (!QUESTION_CLASSES.contains(request.questionClass())) {
            throw new ApiException("UNSUPPORTED_QUESTION_CLASS", HttpStatus.BAD_REQUEST);
        }
        return new GraphRagAnswer(request.questionClass(), List.of("fixture-evidence-001"), "Fixture evidence answer");
    }

    record Health(String status, String mode) {}
    record Candidate(String id, String title, String artist) {}
    record Selection(String candidateId, String status) {}
    record ReviewSaved(String reviewId, String status) {}
    record JobStatus(String jobId, String status) {}
    record Evidence(String id, String subjectId, String summary) {}
    record GraphRagAnswer(String questionClass, List<String> evidenceIds, String answer) {}
    record SelectRequest(String destination) {}
    record RecommendationRequest(String questionClass, Set<String> excludedIdentityIds) {}
    record GraphRagRequest(String questionClass, String question) {}
    record ReviewRequest(@NotBlank String candidateId, @Min(1) @Max(5) int rating, @NotBlank String review, String writeIntent) {}
}
