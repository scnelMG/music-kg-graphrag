package org.musickg.backend.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "music-kg.connected.mode=fixture",
        "music-kg.api.mode=fixture",
        "music-kg.api.bff-shared-secret=boundary-secret",
        "music-kg.api.cors.allowed-origins=https://review.example.test"
})
@AutoConfigureMockMvc
class BffBoundaryTest {
    private static final String BFF_HEADER = "X-Music-Kg-Bff-Secret";

    @Autowired
    private MockMvc mvc;

    @Test
    void rejectsMissingSharedSecretWithTypedUnauthorizedState() throws Exception {
        // Given a fixture API protected by a configured BFF secret
        // When the health route is called directly without that secret
        mvc.perform(get("/api/v1/health"))
                // Then the API exposes only a typed authentication error
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BFF_AUTH_REQUIRED"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());
    }

    @Test
    void rejectsInvalidAndMalformedSharedSecrets() throws Exception {
        // Given invalid single and repeated secret headers
        // When each request crosses the backend boundary
        mvc.perform(get("/api/v1/health").header(BFF_HEADER, "wrong-secret"))
                // Then neither request is authenticated
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BFF_AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/health").header(BFF_HEADER, "boundary-secret", "extra"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BFF_AUTH_REQUIRED"));
    }

    @Test
    void returnsAuthenticatedRedactedHealth() throws Exception {
        // Given a valid BFF credential
        // When the health route is requested
        mvc.perform(get("/api/v1/health").header(BFF_HEADER, "boundary-secret"))
                // Then only the fixture-safe aggregate is returned
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.mode").value("fixture"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret"))));
    }

    @Test
    void rejectsDirectGraphDbAndProviderRoutesWithoutProxyingDetails() throws Exception {
        // Given an authenticated caller attempting private dependency routes
        // When the caller requests GraphDB and provider paths
        mvc.perform(get("/graphdb/repositories").header(BFF_HEADER, "boundary-secret"))
                // Then only the typed route boundary is exposed
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROUTE_NOT_FOUND"));
        mvc.perform(get("/provider/openai").header(BFF_HEADER, "boundary-secret"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROUTE_NOT_FOUND"));
    }
}
