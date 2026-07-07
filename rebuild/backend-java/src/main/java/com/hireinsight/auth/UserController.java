package com.hireinsight.auth;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping("/users/me")
    public ResponseEntity<ApiResponse<Map<String, Object>>> me(Authentication auth) {
        Long userId = (Long) auth.getDetails();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AuthException(HttpStatus.NOT_FOUND, "User not found"));
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", user.getId(), "name", user.getName(),
                "email", user.getEmail(), "role", user.getRole()
        )));
    }

    @PutMapping("/users/me/password")
    public ResponseEntity<ApiResponse<Map<String, Object>>> changePassword(
            Authentication auth,
            @Valid @RequestBody ChangePasswordRequest request) {
        Long userId = (Long) auth.getDetails();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AuthException(HttpStatus.NOT_FOUND, "User not found"));
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new AuthException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("message", "Password updated for demo user")));
    }

    @GetMapping("/admin/users")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<User>>> listUsers() {
        List<User> users = userRepository.findAll();
        return ResponseEntity.ok(ApiResponse.ok(users));
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank
        private String currentPassword;
        @NotBlank
        private String newPassword;
    }
}
