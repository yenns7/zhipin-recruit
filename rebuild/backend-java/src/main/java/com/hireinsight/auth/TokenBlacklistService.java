package com.hireinsight.auth;

import io.jsonwebtoken.Claims;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * In-memory JWT token blacklist for token revocation.
 * Stores revoked token signatures alongside their expiration time
 * so expired entries can be cleaned up.
 */
@Service
public class TokenBlacklistService {

    private static final Logger log = LoggerFactory.getLogger(TokenBlacklistService.class);

    private final JwtTokenProvider tokenProvider;
    private final ConcurrentMap<String, Long> blacklist = new ConcurrentHashMap<>();

    public TokenBlacklistService(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    /**
     * Revoke a token by adding its signature to the blacklist.
     * The token's expiration time is stored so the entry can be cleaned up later.
     */
    public void revoke(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        try {
            Claims claims = tokenProvider.parseToken(token);
            Date expiration = claims.getExpiration();
            long expiryMs = expiration != null ? expiration.getTime() : Long.MAX_VALUE;
            blacklist.put(token, expiryMs);
            log.debug("Token revoked, expires at {}", expiration);
        } catch (Exception e) {
            // Token is already invalid; nothing to revoke
            log.debug("Attempted to revoke invalid token: {}", e.getMessage());
        }
    }

    /**
     * Check if a token has been revoked.
     */
    public boolean isRevoked(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        Long expiryMs = blacklist.get(token);
        if (expiryMs == null) {
            return false;
        }
        // Remove expired entries
        if (System.currentTimeMillis() > expiryMs) {
            blacklist.remove(token, expiryMs);
            return false;
        }
        return true;
    }

    /**
     * Clean up all expired entries from the blacklist.
     */
    public void cleanup() {
        long now = System.currentTimeMillis();
        blacklist.entrySet().removeIf(entry -> entry.getValue() < now);
    }

    /**
     * Get the current size of the blacklist (for monitoring).
     */
    public int size() {
        return blacklist.size();
    }
}
