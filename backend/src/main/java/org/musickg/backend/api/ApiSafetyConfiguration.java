package org.musickg.backend.api;

import jakarta.annotation.PostConstruct;
import org.musickg.backend.config.ConnectedServiceProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({ApiProperties.class, ConnectedServiceProperties.class})
class ApiSafetyConfiguration {
    private final ApiProperties properties;
    private final ConnectedServiceProperties connectedProperties;

    ApiSafetyConfiguration(ApiProperties properties, ConnectedServiceProperties connectedProperties) {
        this.properties = properties;
        this.connectedProperties = connectedProperties;
    }

    @PostConstruct
    void validateProductionBoundary() {
        connectedProperties.validate();
        if (properties.mode() != ApiProperties.Mode.PRODUCTION) return;
        if (properties.authConfiguration() == null || properties.authConfiguration().isBlank()) {
            throw new IllegalStateException("PRODUCTION_AUTH_CONFIGURATION_REQUIRED");
        }
        if (properties.bffSharedSecret() == null || properties.bffSharedSecret().isBlank()) {
            throw new IllegalStateException("PRODUCTION_BFF_SHARED_SECRET_REQUIRED");
        }
        if (properties.cors().allowedOrigins().isEmpty() || properties.cors().allowedOrigins().contains("*")) {
            throw new IllegalStateException("PRODUCTION_ALLOWED_ORIGIN_REQUIRED");
        }
    }
}
