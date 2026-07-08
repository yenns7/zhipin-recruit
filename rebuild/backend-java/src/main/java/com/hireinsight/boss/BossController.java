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
 * Demo-stub controller for BOSS直聘 integration.
 * All endpoints return in-memory mock data, not connected to real BOSS直聘.
 * Requires authentication (recruiter/manager/admin).
 */
@RestController
@RequestMapping("/api/v1/boss")
public class BossController {

    private final BossDemoService bossDemoService;

    public BossController(BossDemoService bossDemoService) {
        this.bossDemoService = bossDemoService;
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatus(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getStatus()));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getLoginInfo()));
    }

    @PostMapping("/browser-cookie")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importBrowserCookie(
            @RequestBody(required = false) Map<String, Object> request,
            Authentication auth) {
        if (request == null) {
            request = Map.of();
        }
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.importBrowserCookie(request)));
    }

    @GetMapping("/jobs")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getJobs(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getJobs()));
    }

    @GetMapping("/candidates/recommend")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRecommendedCandidates(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getRecommendedCandidates()));
    }

    @GetMapping("/candidates/inbox")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getInboxCandidates(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getInboxCandidates()));
    }

    @GetMapping("/candidates/{id}/resume")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCandidateResume(
            @PathVariable String id,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getCandidateResume(id)));
    }

    @GetMapping("/resume/download")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getResumeDownloadUrl(
            @RequestParam(defaultValue = "bc1") String candidateId,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getResumeDownloadUrl(candidateId)));
    }

    @PostMapping("/batch-import")
    public ResponseEntity<ApiResponse<Map<String, Object>>> batchImport(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.batchImport(request)));
    }

    @PostMapping("/ai-screen")
    public ResponseEntity<ApiResponse<Map<String, Object>>> aiScreen(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.aiScreen(request)));
    }

    @GetMapping("/accounts")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAccounts(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getAccounts()));
    }

    @PostMapping("/accounts/activate")
    public ResponseEntity<ApiResponse<Map<String, Object>>> activateAccount(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.activateAccount(request)));
    }

    @DeleteMapping("/accounts/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteAccount(
            @PathVariable String id,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.deleteAccount(id)));
    }

    @PostMapping("/accounts/verify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyAccount(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.verifyAccount(request)));
    }

    @GetMapping("/labels")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getLabels(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getLabels()));
    }

    @PostMapping("/chat")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendChatMessage(
            @RequestBody Map<String, Object> request,
            Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.sendChatMessage(request)));
    }

    @GetMapping("/export")
    public ResponseEntity<ApiResponse<Map<String, Object>>> exportData(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.exportData()));
    }

    @GetMapping("/extension/download")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getExtensionDownloadInfo(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.ok(bossDemoService.getExtensionDownloadInfo()));
    }
}
