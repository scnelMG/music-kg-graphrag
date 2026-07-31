package org.musickg.backend.persistence;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Testcontainers;

class DockerAvailabilityGuardTest {
    @Test
    void neverSilentlyDisablesPersistenceIntegrationTestsWhenDockerIsUnavailable() {
        assertThat(OutboxIntegrationTestSupport.class.getAnnotation(Testcontainers.class).disabledWithoutDocker())
                .isFalse();
    }

    @Test
    void failsWithAnActionableDiagnosticWhenDockerIsUnavailable() {
        assertThatThrownBy(() -> DockerAvailabilityGuard.requireAvailable(() -> false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Docker is required for persistence integration tests")
                .hasMessageContaining("docker version");
    }

    @Test
    void permitsExecutionWhenDockerIsAvailable() {
        assertThatCode(() -> DockerAvailabilityGuard.requireAvailable(() -> true))
                .doesNotThrowAnyException();
    }
}
