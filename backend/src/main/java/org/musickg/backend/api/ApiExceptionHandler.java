package org.musickg.backend.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> apiError(ApiException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.status()).body(new ApiError(exception.code(), requestId(request)));
    }

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> malformed(org.springframework.http.converter.HttpMessageNotReadableException exception, HttpServletRequest request) {
        if (hasPayloadTooLargeCause(exception)) {
            return ResponseEntity.status(413).body(new ApiError("PAYLOAD_TOO_LARGE", requestId(request)));
        }
        return ResponseEntity.badRequest().body(new ApiError("MALFORMED_REQUEST", requestId(request)));
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    ResponseEntity<ApiError> routeNotFound(HttpServletRequest request) {
        return ResponseEntity.status(404).body(new ApiError("ROUTE_NOT_FOUND", requestId(request)));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> staticResourceNotFound(HttpServletRequest request) {
        return ResponseEntity.status(404).body(new ApiError("ROUTE_NOT_FOUND", requestId(request)));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        String code = exception.getBindingResult().getFieldErrors().stream()
                .anyMatch(error -> "rating".equals(error.getField())) ? "INVALID_RATING" : "MALFORMED_REQUEST";
        return ResponseEntity.badRequest().body(new ApiError(code, requestId(request)));
    }

    private String requestId(HttpServletRequest request) { return (String) request.getAttribute(RequestBoundaryFilter.REQUEST_ID); }

    private boolean hasPayloadTooLargeCause(Throwable exception) {
        Throwable cause = exception;
        while (cause != null) {
            if (cause instanceof PayloadTooLargeException) return true;
            cause = cause.getCause();
        }
        return false;
    }
}
