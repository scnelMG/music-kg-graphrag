package org.musickg.backend.api;

final class SearchRateLimiter {
    private long minute = -1;
    private int count;

    synchronized boolean allow(int limit) {
        long currentMinute = System.currentTimeMillis() / 60_000;
        if (currentMinute != minute) { minute = currentMinute; count = 0; }
        count++;
        return count <= limit;
    }
}
