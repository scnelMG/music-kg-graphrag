package org.musickg.backend.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
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

    @Test
    void serializesConcurrentSchedulingAgainstTheSharedProviderBudget() throws Exception {
        int modifiers = MusicBrainzRateLimiter.class.getDeclaredMethod("awaitRequest", int.class).getModifiers();

        assertThat(Modifier.isSynchronized(modifiers)).isTrue();
    }
}
