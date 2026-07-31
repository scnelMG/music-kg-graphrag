package org.musickg.backend.persistence;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

public class CanonicalWriteService {
    private final JdbcTemplate jdbc;

    public CanonicalWriteService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public UUID saveReview(ReviewCommand command) {
        UUID existing = findIdempotentEntity(command.idempotencyKey());
        if (existing != null) {
            return existing;
        }
        UUID reviewId = UUID.randomUUID();
        Timestamp occurredAt = Timestamp.from(command.occurredAt());
        try {
            jdbc.update("INSERT INTO reviews(id, user_id, release_id, rating, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)", reviewId, command.userId(), command.releaseId(), command.rating(), occurredAt, occurredAt);
            jdbc.update("INSERT INTO review_revisions(id, review_id, revision, body, created_at) VALUES (?, ?, 1, ?, ?)", UUID.randomUUID(), reviewId, command.body(), occurredAt);
            jdbc.update("INSERT INTO idempotency_keys(id, idempotency_key, operation, canonical_entity_id, created_at) VALUES (?, ?, 'SAVE_REVIEW', ?, ?)", UUID.randomUUID(), command.idempotencyKey(), reviewId, occurredAt);
            jdbc.update("INSERT INTO outbox_events(id, aggregate_type, aggregate_id, event_type, payload_json, state, attempts, created_at) VALUES (?, 'REVIEW', ?, 'REVIEW_SAVED', jsonb_build_object('reviewId', ?::text), 'PENDING', 0, ?)", UUID.randomUUID(), reviewId, reviewId.toString(), occurredAt);
            return reviewId;
        } catch (DataIntegrityViolationException exception) {
            UUID concurrentEntity = findIdempotentEntity(command.idempotencyKey());
            if (concurrentEntity != null) {
                return concurrentEntity;
            }
            throw exception;
        }
    }

    @Transactional
    public void deleteRelease(UUID releaseId, Instant occurredAt) {
        Timestamp timestamp = Timestamp.from(occurredAt);
        jdbc.update("UPDATE embedding_metadata SET status = 'STALE' WHERE entity_kind = 'RELEASE' AND entity_id = ? AND status = 'ACTIVE'", releaseId);
        jdbc.update("UPDATE projection_generations SET status = 'STALE' WHERE status = 'ACTIVE'");
        jdbc.update("INSERT INTO deletion_state(id, entity_kind, entity_id, state, requested_at, completed_at) VALUES (?, 'RELEASE', ?, 'DELETED', ?, ?) ON CONFLICT (entity_kind, entity_id) DO UPDATE SET state = EXCLUDED.state, completed_at = EXCLUDED.completed_at", UUID.randomUUID(), releaseId, timestamp, timestamp);
        jdbc.update("UPDATE releases SET updated_at = ? WHERE id = ?", timestamp, releaseId);
        jdbc.update("INSERT INTO outbox_events(id, aggregate_type, aggregate_id, event_type, payload_json, state, attempts, created_at) VALUES (?, 'RELEASE', ?, 'RELEASE_DELETED', jsonb_build_object('releaseId', ?::text), 'PENDING', 0, ?)", UUID.randomUUID(), releaseId, releaseId.toString(), timestamp);
    }

    @Transactional
    public void markRetryableFailure(UUID eventId, Instant retryAt, String redactedErrorCode) {
        jdbc.update("UPDATE outbox_events SET state = 'RETRYABLE_FAILED', attempts = attempts + 1, next_attempt_at = ?, last_redacted_error_code = ? WHERE id = ? AND state IN ('PENDING', 'PROCESSING')", Timestamp.from(retryAt), redactedErrorCode, eventId);
    }

    @Transactional
    public void markTerminalFailure(UUID eventId, String redactedErrorCode) {
        jdbc.update("UPDATE outbox_events SET state = 'TERMINAL_FAILED', attempts = attempts + 1, next_attempt_at = NULL, last_redacted_error_code = ? WHERE id = ? AND state = 'RETRYABLE_FAILED'", redactedErrorCode, eventId);
    }

    @Transactional
    public void replayTerminalFailure(UUID eventId, Instant replayAt) {
        jdbc.queryForObject("SELECT replay_terminal_outbox_event(?, ?)", Boolean.class, eventId, Timestamp.from(replayAt));
    }

    private UUID findIdempotentEntity(String idempotencyKey) {
        var entities = jdbc.query("SELECT canonical_entity_id FROM idempotency_keys WHERE idempotency_key = ?", (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), idempotencyKey);
        return entities.isEmpty() ? null : entities.getFirst();
    }
}
