package org.musickg.backend.persistence;

import java.util.function.BooleanSupplier;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;

final class DockerAvailabilityGuard {
    private DockerAvailabilityGuard() {}

    static void requireAvailable() {
        requireAvailable(() -> {
            DockerClientFactory.instance().client().pingCmd().exec();
            return true;
        });
    }

    static void requireAvailable(BooleanSupplier dockerAvailable) {
        try {
            if (dockerAvailable.getAsBoolean()) {
                return;
            }
        } catch (RuntimeException exception) {
            throw unavailable(exception);
        }
        throw unavailable(null);
    }

    static PostgreSQLContainer postgresContainer() {
        requireAvailable();
        return new PostgreSQLContainer("postgres:16-alpine");
    }

    private static IllegalStateException unavailable(Throwable cause) {
        return new IllegalStateException(
                "Docker is required for persistence integration tests. Run `docker version` from this PowerShell session, start Docker Desktop if needed, and ensure this user can access \\\\.\\pipe\\docker_engine.",
                cause);
    }
}
