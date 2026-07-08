package com.hireinsight.security;

import com.hireinsight.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory sliding window rate limiter.
 * <p>
 * Uses a {@link ConcurrentHashMap} keyed by a composite key
 * (e.g., "auth-login:127.0.0.1") with a deque of request timestamps.
 * Expired entries are lazily evicted on each check.
 */
@Service
public class RateLimiterService {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterService.class);

    private final AppConfig appConfig;
    private final ConcurrentHashMap<String, Deque<Long>> windows = new ConcurrentHashMap<>();

    public RateLimiterService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    /**
     * Check if a request for the given key is allowed.
     *
     * @param key the rate limit config key (e.g., "auth-login")
     * @param clientId the client identifier (e.g., IP address or user ID)
     * @return true if the request is allowed, false if rate limit exceeded
     */
    public boolean isAllowed(String key, String clientId) {
        Map<String, AppConfig.RateLimitConfig> limits = appConfig.getRateLimit();
        AppConfig.RateLimitConfig config = limits.get(key);
        if (config == null) {
            // No rate limit configured for this key; allow
            return true;
        }

        int limit = config.getLimit();
        long windowSeconds = config.getWindowSeconds();
        String compositeKey = key + ":" + clientId;
        long now = System.currentTimeMillis();
        long windowStart = now - windowSeconds * 1000L;

        Deque<Long> timestamps = windows.computeIfAbsent(compositeKey, k -> new ArrayDeque<>());

        synchronized (timestamps) {
            // Remove expired timestamps
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }

            if (timestamps.size() >= limit) {
                log.debug("Rate limit exceeded for key: {}", compositeKey);
                return false;
            }

            timestamps.addLast(now);
            return true;
        }
    }

    /**
     * Get the remaining requests allowed for the current window.
     */
    public int getRemaining(String key, String clientId) {
        Map<String, AppConfig.RateLimitConfig> limits = appConfig.getRateLimit();
        AppConfig.RateLimitConfig config = limits.get(key);
        if (config == null) {
            return Integer.MAX_VALUE;
        }
        String compositeKey = key + ":" + clientId;
        Deque<Long> timestamps = windows.get(compositeKey);
        if (timestamps == null) {
            return config.getLimit();
        }
        synchronized (timestamps) {
            return Math.max(0, config.getLimit() - timestamps.size());
        }
    }

    /**
     * Clean up all expired entries across all keys.
     */
    public void cleanup() {
        long now = System.currentTimeMillis();
        windows.forEach((compositeKey, timestamps) -> {
            synchronized (timestamps) {
                String key = compositeKey.substring(0, compositeKey.indexOf(':'));
                Map<String, AppConfig.RateLimitConfig> limits = appConfig.getRateLimit();
                AppConfig.RateLimitConfig config = limits.get(key);
                if (config != null) {
                    long windowStart = now - config.getWindowSeconds() * 1000L;
                    while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                        timestamps.pollFirst();
                    }
                }
            }
        });
    }
}
