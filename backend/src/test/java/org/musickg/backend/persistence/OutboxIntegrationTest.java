package org.musickg.backend.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
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
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OutboxIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = DockerAvailabilityGuard.postgresContainer();

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired CanonicalWriteService writes;
    @Autowired Flyway flyway;

    @BeforeEach
    void resetDatabase() {
        jdbc.execute("TRUNCATE outbox_events, idempotency_keys, review_revisions, reviews, "
                + "external_identifiers, tracks, releases, release_groups, artists, users, "
                + "projection_generations, embedding_metadata, deletion_state CASCADE");
    }

    @Test
    void appliesMigrationsAgainWithoutSchemaChanges() {
        // Given: Spring Boot has already migrated a fresh PostgreSQL database.
        // When: Flyway re-runs the same migration set.
        var result = flyway.migrate();
        // Then: no migration is reapplied.
        assertThat(result.migrationsExecuted).isZero();
    }

    @Test
    void rejectsDuplicateProviderScopedExternalIdentifier() {
        // Given: an external identifier already assigned to a MusicBrainz release.
        UUID release = insertRelease();
        jdbc.update("INSERT INTO external_identifiers(id, provider, entity_kind, external_id, release_id) VALUES (?, 'MUSICBRAINZ', 'RELEASE', 'same-mbid', ?)", UUID.randomUUID(), release);
        // When / Then: a second canonical release claims that same provider identifier.
        UUID otherRelease = insertRelease();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO external_identifiers(id, provider, entity_kind, external_id, release_id) VALUES (?, 'MUSICBRAINZ', 'RELEASE', 'same-mbid', ?)", UUID.randomUUID(), otherRelease))
                .isInstanceOf(Exception.class);
    }

    @Test
    void rejectsReleaseWithoutAReleaseGroup() {
        // Given: no release group exists for an imported release.
        // When / Then: the normalized release cannot be persisted.
        assertThatThrownBy(() -> jdbc.update("INSERT INTO releases(id, release_group_id, title, created_at, updated_at) VALUES (?, ?, 'orphan', now(), now())", UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void savesOneCanonicalMutationAndOneOutboxEventForAnIdempotencyKey() {
        // Given: a canonical review command with a stable idempotency key.
        UUID user = insertUser();
        UUID release = insertRelease();
        var command = new ReviewCommand(user, release, 4, "first review", UUID.randomUUID().toString(), Instant.parse("2026-07-30T00:00:00Z"));
        // When: the same command is submitted twice.
        UUID firstReview = writes.saveReview(command);
        UUID secondReview = writes.saveReview(command);
        // Then: it resolves to one review and one projection event.
        assertThat(secondReview).isEqualTo(firstReview);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Integer.class)).isEqualTo(1);
    }

    @Test
    void marksDependentDerivedWorkStaleBeforeCanonicalDeletion() {
        // Given: a release with generated projection and embedding metadata.
        UUID release = insertRelease();
        jdbc.update("INSERT INTO projection_generations(id, generation, status, created_at) VALUES (?, 1, 'ACTIVE', now())", UUID.randomUUID());
        jdbc.update("INSERT INTO embedding_metadata(id, entity_kind, entity_id, canonical_text_hash, provider, model, model_version, status, created_at) VALUES (?, 'RELEASE', ?, 'hash', 'fixture', 'model', 'v1', 'ACTIVE', now())", UUID.randomUUID(), release);
        // When: the release is deleted through the canonical writer.
        writes.deleteRelease(release, Instant.parse("2026-07-30T00:00:00Z"));
        // Then: derived work is stale and the canonical deletion is recorded.
        assertThat(jdbc.queryForObject("SELECT status FROM embedding_metadata WHERE entity_id = ?", String.class, release)).isEqualTo("STALE");
        assertThat(jdbc.queryForObject("SELECT state FROM deletion_state WHERE entity_id = ?", String.class, release)).isEqualTo("DELETED");
    }

    private UUID insertUser() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id, display_name, created_at, updated_at) VALUES (?, 'fixture', now(), now())", id);
        return id;
    }

    private UUID insertRelease() {
        UUID group = UUID.randomUUID();
        UUID release = UUID.randomUUID();
        jdbc.update("INSERT INTO release_groups(id, title, created_at, updated_at) VALUES (?, 'fixture group', now(), now())", group);
        jdbc.update("INSERT INTO releases(id, release_group_id, title, created_at, updated_at) VALUES (?, ?, 'fixture release', now(), now())", release, group);
        return release;
    }
}
