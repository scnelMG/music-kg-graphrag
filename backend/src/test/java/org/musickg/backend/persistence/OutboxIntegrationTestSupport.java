package org.musickg.backend.persistence;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest(properties = "music-kg.connected.mode=fixture")
@Tag("integration")
@Testcontainers
abstract class OutboxIntegrationTestSupport {
    @Container static final PostgreSQLContainer POSTGRES = DockerAvailabilityGuard.postgresContainer();
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void resetDatabase() {
        jdbc.execute("TRUNCATE outbox_events, idempotency_keys, review_revisions, reviews, external_identifiers, tracks, releases, release_groups, artists, users, projection_generations, embedding_metadata, deletion_state CASCADE");
    }

    UUID insertOutboxEvent() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO outbox_events(id, aggregate_type, aggregate_id, event_type, payload_json, state, attempts, created_at) VALUES (?, 'REVIEW', ?, 'REVIEW_SAVED', '{}', 'PENDING', 0, now())", id, UUID.randomUUID());
        return id;
    }
}
