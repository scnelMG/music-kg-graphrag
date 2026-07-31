package org.musickg.backend.api;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.api.mode=fixture",
        "music-kg.api.cors.allowed-origins=https://review.example.test",
        "music-kg.api.rate-limit.search-per-minute=1"
})
@AutoConfigureMockMvc
class ApiContractTest {
    @Autowired
    private MockMvc mvc;

    @Test
    void exposesFixtureHealthWithARequestId() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(jsonPath("$.mode").value("fixture"));
    }

    @Test
    void rejectsInvalidRatingWithoutPersistence() throws Exception {
        mvc.perform(post("/api/v1/reviews")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":\"fixture-album-001\",\"rating\":6,\"review\":\"fine\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RATING"));
    }

    @Test
    void rejectsFixtureRealWriteIntent() throws Exception {
        mvc.perform(post("/api/v1/reviews")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":\"fixture-album-001\",\"rating\":5,\"review\":\"fine\",\"writeIntent\":\"NOTION\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("REAL_WRITE_FORBIDDEN"));
    }

    @Test
    void rejectsUnconfiguredNotionMapping() throws Exception {
        mvc.perform(post("/api/v1/candidates/fixture-album-001/select")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"destination\":\"NOTION\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTION_MAPPING_UNCONFIGURED"));
    }

    @Test
    void rejectsUnknownEvidenceId() throws Exception {
        mvc.perform(get("/api/v1/evidence/missing-evidence"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVIDENCE_NOT_FOUND"));
    }

    @Test
    void returnsTypedErrorForUnknownApiRouteWithMatchingRequestId() throws Exception {
        mvc.perform(get("/api/v1/not-a-route"))
                .andExpect(status().isNotFound())
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(jsonPath("$.code").value("ROUTE_NOT_FOUND"))
                .andExpect(jsonPath("$.requestId").value(org.hamcrest.Matchers.notNullValue()))
                .andExpect(result -> org.junit.jupiter.api.Assertions.assertEquals(
                        result.getResponse().getHeader("X-Request-Id"),
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsString())
                                .get("requestId").asText()));
    }

    @Test
    void rejectsBlankAndUnknownQuestionClasses() throws Exception {
        mvc.perform(post("/api/v1/graphrag")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionClass\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(post("/api/v1/graphrag")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionClass\":\"FREE_TEXT\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_QUESTION_CLASS"));
    }

    @Test
    void rejectsDisallowedCorsOriginAndRateLimitBreaches() throws Exception {
        mvc.perform(options("/api/v1/candidates").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ORIGIN_NOT_ALLOWED"));
        mvc.perform(get("/api/v1/candidates?q=love"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/candidates?q=love"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void rejectsOversizedPayloadAndOpenApiIsThreePointOne() throws Exception {
        mvc.perform(post("/api/v1/graphrag")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"questionClass\":\"RECOMMENDATION_EXPLANATION\",\"question\":\"" + "x".repeat(4097) + "\"}"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").value("3.1.0"))
                .andExpect(jsonPath("$.paths['/api/v1/graphrag']").exists())
                .andExpect(jsonPath("$.components.schemas.ApiError").exists())
                .andExpect(jsonPath("$.paths['/api/v1/evidence/{evidenceId}'].get.responses['404'].content['application/json'].schema.$ref")
                        .value("#/components/schemas/ApiError"));
    }

}
