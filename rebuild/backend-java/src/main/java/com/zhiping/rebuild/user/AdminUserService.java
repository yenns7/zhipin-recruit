package com.zhiping.rebuild.user;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.auth.AuthException;
import com.hireinsight.model.Event;
import com.hireinsight.model.User;
import com.hireinsight.repository.EventRepository;
import com.hireinsight.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
class AdminUserService {

    private static final Set<String> SUPPORTED_ROLES = Set.of("admin", "manager", "recruiter");

    private final UserRepository userRepository;
    private final EventRepository eventRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    AdminUserService(UserRepository userRepository,
                     EventRepository eventRepository,
                     PasswordEncoder passwordEncoder,
                     ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
    }

    @Transactional
    AdminUserModels.AdminUserSummary createUser(Long actorId, AdminUserModels.CreateAdminUserRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmail(email)) {
            throw new AuthException(HttpStatus.CONFLICT, "Email already registered");
        }

        String role = normalizeRole(request.role());
        User user = User.builder()
                .name(request.name().trim())
                .email(email)
                .role(role)
                .passwordHash(passwordEncoder.encode(request.password()))
                .isActive(request.active() == null || request.active())
                .build();
        user = userRepository.save(user);

        recordAudit(actorId, "admin_user_created", user, Map.of(
                "email", user.getEmail(),
                "role", user.getRole(),
                "active", user.isActive()
        ));
        return toSummary(user);
    }

    @Transactional
    AdminUserModels.AdminUserSummary updateUser(Long actorId, Long userId, AdminUserModels.UpdateAdminUserRequest request) {
        User user = getUser(userId);
        boolean changed = false;

        if (request.name() != null) {
            if (!StringUtils.hasText(request.name())) {
                throw new IllegalArgumentException("name must not be blank");
            }
            user.setName(request.name().trim());
            changed = true;
        }
        if (request.role() != null) {
            user.setRole(normalizeRole(request.role()));
            changed = true;
        }
        if (request.active() != null) {
            user.setActive(request.active());
            changed = true;
        }
        if (!changed) {
            throw new IllegalArgumentException("At least one field must be provided");
        }

        user = userRepository.save(user);
        recordAudit(actorId, "admin_user_updated", user, Map.of(
                "name", user.getName(),
                "role", user.getRole(),
                "active", user.isActive()
        ));
        return toSummary(user);
    }

    @Transactional
    AdminUserModels.ResetPasswordResult resetPassword(Long actorId, Long userId, String newPassword) {
        User user = getUser(userId);
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        recordAudit(actorId, "admin_user_password_reset", user, Map.of(
                "email", user.getEmail(),
                "passwordReset", true
        ));
        return new AdminUserModels.ResetPasswordResult(user.getId(), user.getEmail(), true);
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new AuthException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private String normalizeRole(String role) {
        String normalized = role.trim().toLowerCase(Locale.ROOT);
        if (!SUPPORTED_ROLES.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported role: " + role);
        }
        return normalized;
    }

    private AdminUserModels.AdminUserSummary toSummary(User user) {
        return new AdminUserModels.AdminUserSummary(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.isActive(),
                user.getCreatedAt()
        );
    }

    private void recordAudit(Long actorId, String action, User user, Map<String, Object> payload) {
        Map<String, Object> auditPayload = new LinkedHashMap<>(payload);
        auditPayload.put("userId", user.getId());
        eventRepository.save(Event.builder()
                .actorId(actorId)
                .action(action)
                .entityId(user.getId())
                .entityType("USER")
                .payload(toJson(auditPayload))
                .build());
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize audit payload", e);
        }
    }
}
