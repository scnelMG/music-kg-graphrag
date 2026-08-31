package org.musickg.backend.catalog;

import java.time.Duration;
import java.util.concurrent.locks.LockSupport;

final class MusicBrainzRateLimiter {
    private static final long MAX_QUEUE_NANOS = Duration.ofSeconds(2).toNanos();
    private long nextRequestAtNanos;

    synchronized void awaitRequest(int requestsPerSecond) {
        long interval = 1_000_000_000L / requestsPerSecond;
        long now = System.nanoTime();
        long scheduled = Math.max(now, nextRequestAtNanos);
        if (scheduled - now > MAX_QUEUE_NANOS) {
            throw new MusicBrainzClient.CatalogAccessException("MUSICBRAINZ_RATE_LIMITED", true, null);
        }
        nextRequestAtNanos = scheduled + interval;
        if (scheduled > now) LockSupport.parkNanos(scheduled - now);
    }
}
