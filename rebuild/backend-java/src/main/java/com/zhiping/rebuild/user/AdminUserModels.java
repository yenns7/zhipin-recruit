package com.zhiping.rebuild.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;

final class AdminUserModels {

    private AdminUserModels() {
    }

    public record CreateAdminUserRequest(
            @NotBlank(message = "name must not be blank")
            String name,
            @NotBlank(message = "email must not be blank")
            @Email(message = "must be a well-formed email address")
            String email,
            @NotBlank(message = "role must not be blank")
            String role,
            @NotBlank(message = "password must not be blank")
            String password,
            Boolean active
    ) {
    }

    public record UpdateAdminUserRequest(
            String name,
            String role,
            Boolean active
    ) {
    }

    public record ResetPasswordRequest(
            @NotBlank(message = "newPassword must not be blank")
            String newPassword
    ) {
    }

    public record AdminUserSummary(
            Long id,
            String name,
            String email,
            String role,
            boolean active,
            Instant createdAt
    ) {
    }

    public record ResetPasswordResult(
            Long id,
            String email,
            boolean passwordReset
    ) {
    }
}
