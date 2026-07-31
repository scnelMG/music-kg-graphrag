package org.musickg.backend.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class OutboxFailureRecoveryTest extends OutboxIntegrationTestSupport {
    @Autowired CanonicalWriteService writes;
    @Autowired JdbcTemplate jdbc;

    @Test
    void schedulesOneRetryAndReplaysTerminalFailureWithoutDuplicateEffects() {
        // Given: one pending event for a canonical review.
        UUID event = insertOutboxEvent();
        Instant retryAt = Instant.parse("2026-07-30T00:01:00Z");
        // When: it first fails retryably, then terminally, and an operator replays it.
        writes.markRetryableFailure(event, retryAt, "UPSTREAM_TIMEOUT");
        writes.markTerminalFailure(event, "SCHEMA_REJECTED");
        writes.replayTerminalFailure(event, Instant.parse("2026-07-30T00:02:00Z"));
        // Then: one event remains, retaining audit attempts and becoming replayable pending work.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT attempts FROM outbox_events WHERE id = ?", Integer.class, event)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT state FROM outbox_events WHERE id = ?", String.class, event)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT next_attempt_at FROM outbox_events WHERE id = ?", Instant.class, event)).isEqualTo(Instant.parse("2026-07-30T00:02:00Z"));
    }
}
