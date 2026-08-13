package org.musickg.backend.config;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("music-kg.connected.llm")
public record GroundedLlmProperties(boolean enabled, String baseUrl, String apiKey, String model) {
    public GroundedLlmProperties {
        baseUrl = baseUrl == null ? "" : baseUrl.trim();
        apiKey = apiKey == null ? "" : apiKey.trim();
        model = model == null ? "" : model.trim();
    }

    public boolean configured() {
        if (!enabled || apiKey.isBlank() || model.isBlank()) return false;
        try {
            String scheme = URI.create(baseUrl).getScheme();
            return "https".equals(scheme) || "http".equals(scheme);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
