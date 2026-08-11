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

    private static MockHttpServletResponse executeCatalogSearch(RequestBoundaryFilter filter) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/catalog/albums");
        request.addHeader(RequestBoundaryFilter.BFF_SECRET_HEADER, "boundary-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
