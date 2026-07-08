package com.hireinsight.auth;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.config.AppConfig;
import com.hireinsight.model.User;
import com.hireinsight.security.RateLimit;
import com.hireinsight.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final DemoAuthSessionService sessionService;
    private final TokenBlacklistService blacklistService;
    private final AppConfig appConfig;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtTokenProvider tokenProvider,
                          DemoAuthSessionService sessionService,
                          TokenBlacklistService blacklistService,
                          AppConfig appConfig) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.sessionService = sessionService;
        this.blacklistService = blacklistService;
        this.appConfig = appConfig;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Map<String, Object>>> register(
            @Valid @RequestBody RegisterRequest req) {
        if (!appConfig.getAuth().isPublicRegistrationEnabled()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error(403, "Public registration disabled"));
        }
        if (userRepository.existsByEmail(req.getEmail())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiResponse.error(409, "Email already registered"));
        }
        User user = User.builder()
                .name(req.getName() != null ? req.getName() : "")
                .email(req.getEmail())
                .role("recruiter")
                .passwordHash(passwordEncoder.encode(req.getPassword()))
                .build();
        user = userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", user.getId(), "email", user.getEmail(), "role", user.getRole())));
    }

    @PostMapping("/login")
    @RateLimit(key = "auth-login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(
            @Valid @RequestBody LoginRequest req) {
        User user = userRepository.findByEmail(req.getEmail())
                .orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(req.getPassword(), user.getPasswordHash())) {
            throw new AuthException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        if (!user.isActive()) {
            throw new AuthException(HttpStatus.FORBIDDEN, "Account deactivated");
        }
        String token = tokenProvider.createToken(user.getId(), user.getRole());
        sessionService.activate(token);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "token", token, "role", user.getRole(), "name", user.getName()
        )));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Map<String, Object>>> logout(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization != null && authorization.startsWith("Bearer ")) {
            String token = authorization.substring(7);
            sessionService.invalidate(token);
            blacklistService.revoke(token);
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of("message", "Logged out")));
    }

    @Data
    public static class RegisterRequest {
        @NotBlank @Email
        private String email;
        @NotBlank
        private String password;
        private String name;
    }

    @Data
    public static class LoginRequest {
        @NotBlank @Email
        private String email;
        @NotBlank
        private String password;
    }
}
