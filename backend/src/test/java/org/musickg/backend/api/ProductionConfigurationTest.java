package org.musickg.backend.api;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.musickg.backend.MusicKgApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;

class ProductionConfigurationTest {
    @Test
    void productionRequiresExplicitAuthenticationAndNonWildcardOrigin() {
        assertThatThrownBy(() -> new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.NONE)
                .properties("spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
                .run("--music-kg.api.mode=production", "--music-kg.api.cors.allowed-origins=*"))
                .hasRootCauseMessage("PRODUCTION_AUTH_CONFIGURATION_REQUIRED");
    }

    @Test
    void productionRejectsWildcardOriginEvenWithAuthenticationConfigured() {
        assertThatThrownBy(() -> new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.NONE)
                .properties("spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
                .run(
                        "--music-kg.api.mode=production",
                        "--music-kg.api.auth-configuration=oauth2",
                        "--music-kg.api.bff-shared-secret=production-secret",
                        "--music-kg.api.cors.allowed-origins=*"))
                .hasRootCauseMessage("PRODUCTION_ALLOWED_ORIGIN_REQUIRED");
    }

    @Test
    void productionRequiresBffAuthenticationSecret() {
        assertThatThrownBy(() -> new SpringApplicationBuilder(MusicKgApplication.class)
                .web(WebApplicationType.NONE)
                .properties("spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration")
                .run(
                        "--music-kg.api.mode=production",
                        "--music-kg.api.auth-configuration=oauth2",
                        "--music-kg.api.cors.allowed-origins=https://review.example.test"))
                .hasRootCauseMessage("PRODUCTION_BFF_SHARED_SECRET_REQUIRED");
    }
}
