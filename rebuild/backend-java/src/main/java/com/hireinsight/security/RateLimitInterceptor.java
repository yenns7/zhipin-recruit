package com.hireinsight.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * Interceptor that enforces {@link RateLimit} annotations.
 * Returns 429 Too Many Requests with a JSON error body and Retry-After header
 * when the rate limit is exceeded.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final String ERROR_JSON = "{\"code\":429,\"message\":\"请求过于频繁，请稍后再试\"}";
    private static final int DEFAULT_RETRY_AFTER = 60;

    private final RateLimiterService rateLimiterService;

    public RateLimitInterceptor(RateLimiterService rateLimiterService) {
        this.rateLimiterService = rateLimiterService;
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) throws Exception {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        RateLimit rateLimit = handlerMethod.getMethodAnnotation(RateLimit.class);
        if (rateLimit == null) {
            return true;
        }

        String key = rateLimit.key();
        String clientId = resolveClientId(request);

        if (!rateLimiterService.isAllowed(key, clientId)) {
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(DEFAULT_RETRY_AFTER));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(ERROR_JSON);
            response.getWriter().flush();
            return false;
        }

        return true;
    }

    private String resolveClientId(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr != null ? remoteAddr : "unknown";
    }
}
