package org.musickg.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class GroundedLlmPropertiesTest {
    @Test
    void enablesTheProviderOnlyWhenTheUserOptedInAndAllServerOnlyValuesArePresent() {
        assertThat(new GroundedLlmProperties(false, "https://api.example/v1", "secret", "model").configured()).isFalse();
        assertThat(new GroundedLlmProperties(true, "https://api.example/v1", "", "model").configured()).isFalse();
        assertThat(new GroundedLlmProperties(true, "https://api.example/v1", "secret", "model").configured()).isTrue();
    }
}
