package org.musickg.backend.persistence;

import java.time.Instant;
import java.util.UUID;

public record ReviewCommand(
        UUID userId,
        UUID releaseId,
        int rating,
        String body,
        String idempotencyKey,
        Instant occurredAt) {}
