package org.musickg.backend.connected;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ConnectedOperationMetricsTest {
    @Test
    void recordsOutcomeCountsAndLatencyWithoutCapturingRequestData() {
        ConnectedOperationMetrics metrics = new ConnectedOperationMetrics();

        assertThat(metrics.observe("catalog.search", () -> "ok")).isEqualTo("ok");
        assertThatThrownBy(() -> metrics.observe("catalog.search", () -> {
            throw new IllegalStateException("provider failure");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(metrics.snapshot()).singleElement().satisfies(metric -> {
            assertThat(metric.operation()).isEqualTo("catalog.search");
            assertThat(metric.successCount()).isEqualTo(1);
            assertThat(metric.failureCount()).isEqualTo(1);
            assertThat(metric.totalCount()).isEqualTo(2);
            assertThat(metric.averageLatencyMillis()).isGreaterThanOrEqualTo(0);
        });
    }
}
