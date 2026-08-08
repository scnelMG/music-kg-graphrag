package org.musickg.backend.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.api.mode=fixture",
        "music-kg.api.bff-shared-secret=test-bff-secret",
        "music-kg.api.rate-limit.search-per-minute=60"
})
@AutoConfigureMockMvc
class CandidateQueryContractTest {
    @Autowired
    private MockMvc mvc;

    @Test
    void returnsNoCandidatesWhenQueryDoesNotMatchTheFixture() throws Exception {
        // Given a query that matches neither the fixture title nor artist
        // When the authenticated candidate endpoint searches it
        mvc.perform(get("/api/v1/candidates?q=definitely-not-the-fixture")
                        .header("X-Music-Kg-Bff-Secret", "test-bff-secret"))
                // Then the endpoint preserves search semantics instead of returning an unrelated album
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }
}
