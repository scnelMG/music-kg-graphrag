package org.musickg.backend.connected;

import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
final class ConnectedOperationMetrics {
    private final ConcurrentHashMap<String, MutableMetric> values = new ConcurrentHashMap<>();

    <T> T observe(String operation, Supplier<T> action) {
        long startedAt = System.nanoTime();
        boolean succeeded = false;
        try {
            T result = action.get();
            succeeded = true;
            return result;
        } finally {
            values.computeIfAbsent(operation, ignored -> new MutableMetric())
                    .record(succeeded, System.nanoTime() - startedAt);
        }
    }

    List<OperationMetric> snapshot() {
        return values.entrySet().stream()
                .map(entry -> entry.getValue().snapshot(entry.getKey()))
                .sorted(Comparator.comparing(OperationMetric::operation))
                .toList();
    }

    record OperationMetric(String operation, long successCount, long failureCount, long totalCount,
                           long averageLatencyMillis) {}

    private static final class MutableMetric {
        private long successes;
        private long failures;
        private long totalLatencyNanos;

        synchronized void record(boolean succeeded, long latencyNanos) {
            if (succeeded) successes++; else failures++;
            totalLatencyNanos += latencyNanos;
        }

        synchronized OperationMetric snapshot(String operation) {
            long total = successes + failures;
            long averageLatencyMillis = total == 0 ? 0 : (totalLatencyNanos / total) / 1_000_000L;
            return new OperationMetric(operation, successes, failures, total, averageLatencyMillis);
        }
    }
}
