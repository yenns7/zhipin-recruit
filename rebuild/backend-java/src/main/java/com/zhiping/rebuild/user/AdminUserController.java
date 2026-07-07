package com.zhiping.rebuild.user;

import com.hireinsight.common.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AdminUserModels.AdminUserSummary>> createUser(
            Authentication authentication,
            @Valid @RequestBody AdminUserModels.CreateAdminUserRequest request) {
        return ResponseEntity.status(201)
                .body(ApiResponse.created(adminUserService.createUser(actorId(authentication), request)));
    }

    @PatchMapping("/{userId}")
    public ResponseEntity<ApiResponse<AdminUserModels.AdminUserSummary>> updateUser(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestBody AdminUserModels.UpdateAdminUserRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(adminUserService.updateUser(actorId(authentication), userId, request)));
    }

    @PostMapping("/{userId}/reset-password")
    public ResponseEntity<ApiResponse<AdminUserModels.ResetPasswordResult>> resetPassword(
            Authentication authentication,
            @PathVariable Long userId,
            @Valid @RequestBody AdminUserModels.ResetPasswordRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                adminUserService.resetPassword(actorId(authentication), userId, request.newPassword())));
    }

    private Long actorId(Authentication authentication) {
        return (Long) authentication.getDetails();
    }
}
