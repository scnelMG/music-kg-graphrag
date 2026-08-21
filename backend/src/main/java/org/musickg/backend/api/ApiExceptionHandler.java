package org.musickg.backend.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.musickg.backend.connected.ConnectedMusicService;
import org.musickg.backend.connected.GraphDbPersonalGraphProjectionGateway;
import org.musickg.backend.catalog.MusicBrainzClient;
import org.musickg.backend.notion.NotionClient;

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(ConnectedMusicService.InsufficientHistoryException.class)
    ResponseEntity<ApiError> insufficientHistory(ConnectedMusicService.InsufficientHistoryException exception,
                                                 HttpServletRequest request) {
        return ResponseEntity.status(409).body(new ApiError("INSUFFICIENT_PERSONAL_HISTORY", requestId(request)));
    }

    @ExceptionHandler(ConnectedMusicService.InvalidYouTubeMappingException.class)
    ResponseEntity<ApiError> invalidYoutubeMapping(ConnectedMusicService.InvalidYouTubeMappingException exception,
                                                    HttpServletRequest request) {
        return ResponseEntity.badRequest().body(new ApiError("YOUTUBE_MAPPING_INVALID", requestId(request)));
    }

    @ExceptionHandler(NotionClient.AccessException.class)
    ResponseEntity<ApiError> notionAccess(NotionClient.AccessException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.getMessage()) {
            case "NOTION_RATE_LIMITED" -> HttpStatus.TOO_MANY_REQUESTS;
            case "NOTION_UNAVAILABLE" -> HttpStatus.SERVICE_UNAVAILABLE;
            case "NOTION_CONNECTION_NOT_SHARED", "NOTION_CONNECTION_UNAUTHORIZED", "YOUTUBE_MAPPING_CONFIGURATION_REQUIRED" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_GATEWAY;
        };
        return ResponseEntity.status(status).body(new ApiError(exception.getMessage(), requestId(request)));
    }

    @ExceptionHandler(MusicBrainzClient.CatalogAccessException.class)
    ResponseEntity<ApiError> musicBrainzAccess(MusicBrainzClient.CatalogAccessException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.code()) {
            case "MUSICBRAINZ_RELEASE_NOT_IN_GROUP", "MUSICBRAINZ_RELEASE_GROUP_NOT_FOUND",
                    "MUSICBRAINZ_TRACK_NOT_IN_RELEASE" -> HttpStatus.UNPROCESSABLE_ENTITY;
            default -> exception.retryable() ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        };
        return ResponseEntity.status(status).body(new ApiError(exception.code(), requestId(request)));
    }

    @ExceptionHandler(GraphDbPersonalGraphProjectionGateway.GraphAccessException.class)
    ResponseEntity<ApiError> graphDbAccess(GraphDbPersonalGraphProjectionGateway.GraphAccessException exception,
                                           HttpServletRequest request) {
        HttpStatus status = "GRAPHDB_UNAVAILABLE".equals(exception.getMessage())
                ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        return ResponseEntity.status(status).body(new ApiError(exception.getMessage(), requestId(request)));
    }

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

    @ExceptionHandler({HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    ResponseEntity<ApiError> methodValidation(Exception exception, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(new ApiError("MALFORMED_REQUEST", requestId(request)));
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
