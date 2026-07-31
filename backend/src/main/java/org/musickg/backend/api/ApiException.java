package org.musickg.backend.api;

import org.springframework.http.HttpStatus;

final class ApiException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    ApiException(String code, HttpStatus status) {
        this.code = code;
        this.status = status;
    }

    String code() { return code; }
    HttpStatus status() { return status; }
}
