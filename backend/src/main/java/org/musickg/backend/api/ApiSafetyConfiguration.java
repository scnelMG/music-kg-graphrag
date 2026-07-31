package org.musickg.backend.api;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ApiProperties.class)
class ApiSafetyConfiguration {
    private final ApiProperties properties;

    ApiSafetyConfiguration(ApiProperties properties) { this.properties = properties; }

    @PostConstruct
    void validateProductionBoundary() {
        if (properties.mode() != ApiProperties.Mode.PRODUCTION) return;
        if (properties.authConfiguration() == null || properties.authConfiguration().isBlank()) {
            throw new IllegalStateException("PRODUCTION_AUTH_CONFIGURATION_REQUIRED");
        }
        if (properties.cors().allowedOrigins().isEmpty() || properties.cors().allowedOrigins().contains("*")) {
            throw new IllegalStateException("PRODUCTION_ALLOWED_ORIGIN_REQUIRED");
        }
    }
}
