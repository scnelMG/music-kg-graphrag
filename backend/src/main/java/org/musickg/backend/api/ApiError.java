package org.musickg.backend.api;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "ApiError")
public record ApiError(String code, String requestId) {}
