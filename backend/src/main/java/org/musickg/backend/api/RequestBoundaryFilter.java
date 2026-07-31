package org.musickg.backend.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class RequestBoundaryFilter extends OncePerRequestFilter {
    static final String REQUEST_ID = "musicKgRequestId";
    private final ApiProperties properties;
    private final SearchRateLimiter rateLimiter = new SearchRateLimiter();

    RequestBoundaryFilter(ApiProperties properties) { this.properties = properties; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        request.setAttribute(REQUEST_ID, requestId);
        response.setHeader("X-Request-Id", requestId);
        String origin = request.getHeader("Origin");
        if (origin != null && !properties.cors().allowedOrigins().contains(origin)) {
            reject(response, requestId, HttpStatus.FORBIDDEN, "ORIGIN_NOT_ALLOWED");
            return;
        }
        if (origin != null) response.setHeader("Access-Control-Allow-Origin", origin);
        if ("OPTIONS".equals(request.getMethod())) {
            response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            response.setStatus(HttpStatus.NO_CONTENT.value());
            return;
        }
        if (request.getContentLengthLong() > properties.maxPayloadBytes()) {
            reject(response, requestId, HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE");
            return;
        }
        if (request.getRequestURI().equals("/api/v1/candidates") && !rateLimiter.allow(properties.rateLimit().searchPerMinute())) {
            reject(response, requestId, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED");
            return;
        }
        try {
            chain.doFilter(new PayloadLimitRequestWrapper(request, properties.maxPayloadBytes()), response);
        } catch (PayloadTooLargeException exception) {
            if (!response.isCommitted()) reject(response, requestId, HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE");
        }
    }

    private void reject(HttpServletResponse response, String requestId, HttpStatus status, String code) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\",\"requestId\":\"" + requestId + "\"}");
    }
}
