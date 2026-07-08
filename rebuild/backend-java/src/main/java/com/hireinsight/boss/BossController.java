package com.hireinsight.boss;

import com.hireinsight.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * BOSS直聘集成控制器。
 * 真实模式下通过 {@link BossService} 调用 boss-cli，demo 模式下回退 {@link BossDemoService}。
 * 所有端点保持 19 个签名不变。
 */
@RestController
@RequestMapping("/api/v1/boss")
public class BossController {

    private final BossService bossService;

    public BossController(BossService bossService) {
        this.bossService = bossService;
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatus(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getStatus(userId)));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossService.getLoginInfo()));
    }

    @PostMapping("/browser-cookie")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importBrowserCookie(
            @RequestBody(required = false) Map<String, Object> request,
            Authentication auth) {
        if (request == null) {
            request = Map.of();
        }
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.importBrowserCookie(request, userId)));
    }

    @GetMapping("/jobs")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getJobs(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getJobs(userId)));
    }

    @GetMapping("/candidates/recommend")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRecommendedCandidates(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getRecommendedCandidates(userId)));
    }

    @GetMapping("/candidates/inbox")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getInboxCandidates(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getInboxCandidates(userId)));
    }

    @GetMapping("/candidates/{id}/resume")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCandidateResume(
            @PathVariable String id,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getCandidateResume(id, userId)));
    }

    @GetMapping("/resume/download")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getResumeDownloadUrl(
            @RequestParam(defaultValue = "bc1") String candidateId,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getResumeDownloadUrl(candidateId, userId)));
    }

    @PostMapping("/batch-import")
    public ResponseEntity<ApiResponse<Map<String, Object>>> batchImport(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.batchImport(request, userId)));
    }

    @PostMapping("/ai-screen")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiScreen(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.aiScreen(request, userId)));
    }

    @GetMapping("/accounts")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAccounts(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.getAccounts(userId)));
    }

    @PostMapping("/accounts/activate")
    public ResponseEntity<ApiResponse<Map<String, Object>>> activateAccount(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.activateAccount(request, userId)));
    }

    @DeleteMapping("/accounts/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteAccount(
            @PathVariable String id,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.deleteAccount(id, userId)));
    }

    @PostMapping("/accounts/verify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyAccount(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.verifyAccount(request, userId)));
    }

    @GetMapping("/labels")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getLabels(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossService.getLabels()));
    }

    @PostMapping("/chat")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendChatMessage(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.sendChatMessage(request, userId)));
    }

    @GetMapping("/export")
    public ResponseEntity<ApiResponse<Map<String, Object>>> exportData(Authentication auth) {
        Long userId = extractUserId(auth);
        return ResponseEntity.ok(ApiResponse.ok(bossService.exportData(userId)));
    }

    @GetMapping("/extension/download")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getExtensionDownloadInfo(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossService.getExtensionDownloadInfo()));
    }

    /**
     * Extract user ID from Authentication principal.
     * The principal is the user ID (Long) as set by JwtAuthenticationFilter.
     */
    private Long extractUserId(Authentication auth) {
        if (auth == null || auth.getPrincipal() == null) {
            return null;
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof Long) {
            return (Long) principal;
        }
        if (principal instanceof Number) {
            return ((Number) principal).longValue();
        }
        try {
            return Long.parseLong(principal.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
