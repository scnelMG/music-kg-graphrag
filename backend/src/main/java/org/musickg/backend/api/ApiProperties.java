package org.musickg.backend.api;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("music-kg.api")
public record ApiProperties(
        Mode mode,
        String authConfiguration,
        Cors cors,
        int maxPayloadBytes,
        RateLimit rateLimit) {
    public ApiProperties {
        mode = mode == null ? Mode.FIXTURE : mode;
        cors = cors == null ? new Cors(List.of()) : cors;
        maxPayloadBytes = maxPayloadBytes == 0 ? 4096 : maxPayloadBytes;
        rateLimit = rateLimit == null ? new RateLimit(60) : rateLimit;
    }

    public enum Mode { FIXTURE, PRODUCTION }

    public record Cors(List<String> allowedOrigins) {
        public Cors { allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins); }
    }

    public record RateLimit(int searchPerMinute) {
        public RateLimit { searchPerMinute = searchPerMinute == 0 ? 60 : searchPerMinute; }
    }
}
