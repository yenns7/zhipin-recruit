package com.hireinsight.security;

import com.hireinsight.config.AppConfig;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Adds security headers to all HTTP responses.
 * Gated by {@code app.security.headers-enabled} (default true).
 * <p>
 * Headers added:
 * <ul>
 *   <li>X-Content-Type-Options: nosniff</li>
 *   <li>X-Frame-Options: DENY</li>
 *   <li>Referrer-Policy: strict-origin-when-cross-origin</li>
 *   <li>Permissions-Policy: camera=(), microphone=(), geolocation=()</li>
 *   <li>Content-Security-Policy: restrictive default</li>
 * </ul>
 */
@Component
@Order(0)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    private static final String CSP = "default-src 'self'; "
            + "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            + "style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data: https:; "
            + "font-src 'self' data:; "
            + "connect-src 'self'; "
            + "frame-ancestors 'none'; "
            + "base-uri 'self'; "
            + "form-action 'self'";

    private final AppConfig appConfig;

    public SecurityHeadersFilter(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {
        if (appConfig.getSecurity().isHeadersEnabled()) {
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Frame-Options", "DENY");
            response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
            response.setHeader("Permissions-Policy",
                    "camera=(), microphone=(), geolocation=()");
            response.setHeader("Content-Security-Policy", CSP);
        }
        chain.doFilter(request, response);
    }
}
