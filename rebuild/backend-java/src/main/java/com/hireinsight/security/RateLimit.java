package com.hireinsight.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation to apply rate limiting on controller methods.
 * <p>
 * The {@code key} maps to a configuration entry under {@code app.rate-limit.*}
 * in {@code application.yml}.
 * <p>
 * Example:
 * <pre>{@code
 * @RateLimit(key = "auth-login")
 * @PostMapping("/login")
 * public ResponseEntity<?> login(...) { ... }
 * }</pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    /**
     * The rate limit config key (e.g., "auth-login", "agent-chat", "resume-upload").
     */
    String key();
}
