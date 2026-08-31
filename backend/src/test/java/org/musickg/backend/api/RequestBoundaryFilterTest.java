package org.musickg.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestBoundaryFilterTest {
    @Test
    void rateLimitsConnectedCatalogSearchesAlongsideFixtureSearches() throws Exception {
        ApiProperties properties = new ApiProperties(
                ApiProperties.Mode.FIXTURE,
                "",
                "boundary-secret",
                new ApiProperties.Cors(List.of()),
                4096,
                new ApiProperties.RateLimit(1));
        RequestBoundaryFilter filter = new RequestBoundaryFilter(properties);

        MockHttpServletResponse firstResponse = executeCatalogSearch(filter);
        MockHttpServletResponse secondResponse = executeCatalogSearch(filter);

        assertThat(firstResponse.getStatus()).isEqualTo(200);
        assertThat(secondResponse.getStatus()).isEqualTo(429);
        assertThat(secondResponse.getContentAsString()).contains("RATE_LIMITED");
    }

    @Test
    void rateLimitsPublicCatalogExpansionEndpointsWithTheSameBudget() throws Exception {
        ApiProperties properties = new ApiProperties(
                ApiProperties.Mode.FIXTURE,
                "",
                "boundary-secret",
                new ApiProperties.Cors(List.of()),
                4096,
                new ApiProperties.RateLimit(1));
        RequestBoundaryFilter filter = new RequestBoundaryFilter(properties);

        MockHttpServletResponse firstResponse = execute(filter, "/api/v1/catalog/explore");
        MockHttpServletResponse secondResponse = execute(filter, "/api/v1/catalog/albums/group/editions");

        assertThat(firstResponse.getStatus()).isEqualTo(200);
        assertThat(secondResponse.getStatus()).isEqualTo(429);
    }

    @Test
    void rejectsMutationMethodsWhenConnectedReadOnlyIsEnabled() throws Exception {
        ApiProperties properties = new ApiProperties(
                ApiProperties.Mode.PRODUCTION,
                "bff-shared-secret",
                "boundary-secret",
                new ApiProperties.Cors(List.of()),
                4096,
                new ApiProperties.RateLimit(60));
        RequestBoundaryFilter filter = new RequestBoundaryFilter(properties, true);

        for (String method : List.of("POST", "PUT", "PATCH", "DELETE")) {
            MockHttpServletResponse response = execute(filter, method, "/api/v1/listening-records");

            assertThat(response.getStatus()).isEqualTo(403);
            assertThat(response.getContentAsString()).contains("CONNECTED_READ_ONLY");
        }
    }

    @Test
    void allowsReadMethodsWhenConnectedReadOnlyIsEnabled() throws Exception {
        ApiProperties properties = new ApiProperties(
                ApiProperties.Mode.PRODUCTION,
                "bff-shared-secret",
                "boundary-secret",
                new ApiProperties.Cors(List.of()),
                4096,
                new ApiProperties.RateLimit(60));
        RequestBoundaryFilter filter = new RequestBoundaryFilter(properties, true);

        assertThat(execute(filter, "GET", "/api/v1/listening-records").getStatus()).isEqualTo(200);
        assertThat(execute(filter, "HEAD", "/api/v1/listening-records").getStatus()).isEqualTo(200);
        assertThat(execute(filter, "OPTIONS", "/api/v1/listening-records").getStatus()).isEqualTo(204);
    }

    private static MockHttpServletResponse executeCatalogSearch(RequestBoundaryFilter filter) throws Exception {
        return execute(filter, "/api/v1/catalog/albums");
    }

    private static MockHttpServletResponse execute(RequestBoundaryFilter filter, String path) throws Exception {
        return execute(filter, "GET", path);
    }

    private static MockHttpServletResponse execute(RequestBoundaryFilter filter, String method, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.addHeader(RequestBoundaryFilter.BFF_SECRET_HEADER, "boundary-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
