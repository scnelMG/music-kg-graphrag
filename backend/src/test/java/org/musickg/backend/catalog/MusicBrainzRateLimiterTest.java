package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import org.junit.jupiter.api.Test;

class MusicBrainzRateLimiterTest {
    @Test
    void rejectsAnOverloadedLocalRateLimitQueueInsteadOfBlockingTheRequestThread() throws Exception {
        var limiter = new MusicBrainzRateLimiter();
        Field nextRequestAtNanos = MusicBrainzRateLimiter.class.getDeclaredField("nextRequestAtNanos");
        nextRequestAtNanos.setAccessible(true);
        nextRequestAtNanos.setLong(limiter, System.nanoTime() + 10_000_000_000L);

        assertThatThrownBy(() -> limiter.awaitRequest(1))
                .isInstanceOf(MusicBrainzClient.CatalogAccessException.class)
                .hasMessage("MUSICBRAINZ_RATE_LIMITED");
    }
}
