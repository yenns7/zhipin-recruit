package com.hireinsight.bi;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Job;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.JobRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/v1/bi")
public class BiController {

    private final CandidateRepository candidateRepository;
    private final JobRepository jobRepository;
    private final BiService biService;

    public BiController(CandidateRepository candidateRepository,
                        JobRepository jobRepository,
                        BiService biService) {
        this.candidateRepository = candidateRepository;
        this.jobRepository = jobRepository;
        this.biService = biService;
    }

    private boolean isAdminOrManager(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN")
                        || authority.getAuthority().equals("ROLE_MANAGER"));
    }

    private Long getUserId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    private int resolveDays(Integer days) {
        if (days == null) return 30;
        if (days == 7 || days == 30 || days == 90) return days;
        return 30;
    }

    // ==================== Existing ====================

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> overview(Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        List<Job> scopedJobs = adminOrManager ? jobRepository.findAll() : jobRepository.findByOwnerHrId(userId);
        List<Candidate> scopedCandidates = adminOrManager ? candidateRepository.findAll() : candidateRepository.findByOwnerHrId(userId);

        long activeJobs = scopedJobs.stream()
                .filter(job -> "active".equals(job.getStatus()))
                .count();
        long candidateTotal = scopedCandidates.size();
        long parsedCandidates = scopedCandidates.stream()
                .filter(candidate -> candidate.getResumeJson() != null && !candidate.getResumeJson().isBlank())
                .count();

        Map<String, Object> payload = Map.of(
                "generatedAt", Instant.now().toString(),
                "activeJobs", activeJobs,
                "candidateTotal", candidateTotal,
                "parsedCandidates", parsedCandidates,
                "adminOrManager", adminOrManager,
                "summary", List.of(
                        metric("active_jobs", "进行中岗位", activeJobs),
                        metric("candidate_total", "候选人总数", candidateTotal),
                        metric("parsed_candidates", "已解析候选人", parsedCandidates)
                )
        );
        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    @GetMapping("/staff/{hrId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> staffAnalytics(
            @PathVariable Long hrId, Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        if (!adminOrManager) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error(403, "Forbidden: manager or admin role required"));
        }
        try {
            Map<String, Object> data = biService.staffAnalytics(hrId);
            return ResponseEntity.ok(ApiResponse.ok(data));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, e.getMessage()));
        }
    }

    @GetMapping("/job/{jobId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> jobFunnel(
            @PathVariable Long jobId, Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        if (!adminOrManager) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error(403, "Forbidden: manager or admin role required"));
        }
        try {
            Map<String, Object> data = biService.jobFunnel(jobId);
            return ResponseEntity.ok(ApiResponse.ok(data));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, e.getMessage()));
        }
    }

    // ==================== 1. Funnel ====================

    @GetMapping("/funnel")
    public ResponseEntity<ApiResponse<Map<String, Object>>> funnel(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.funnel(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 2. Channel Quality ====================

    @GetMapping("/channel-quality")
    public ResponseEntity<ApiResponse<Map<String, Object>>> channelQuality(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.channelQuality(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 3. Interview Accountability ====================

    @GetMapping("/interview-accountability")
    public ResponseEntity<ApiResponse<Map<String, Object>>> interviewAccountability(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.interviewAccountability(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 4. Manager Alerts ====================

    @GetMapping("/manager-alerts")
    public ResponseEntity<ApiResponse<Map<String, Object>>> managerAlerts(
            @RequestParam(required = false, defaultValue = "90") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.managerAlerts(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 5. Demand Health ====================

    @GetMapping("/demand-health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> demandHealth(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.demandHealth(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 6. Resume Consumption ====================

    @GetMapping("/resume-consumption")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resumeConsumption(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.resumeConsumption(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ==================== 7. Data Quality ====================

    @GetMapping("/data-quality")
    public ResponseEntity<ApiResponse<Map<String, Object>>> dataQuality(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            Authentication authentication) {
        boolean adminOrManager = isAdminOrManager(authentication);
        Long userId = getUserId(authentication);
        int d = resolveDays(days);
        Map<String, Object> data = biService.dataQuality(d, userId, adminOrManager);
        data.put("days", d);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    private Map<String, Object> metric(String key, String label, long value) {
        return Map.of(
                "key", key,
                "label", label,
                "value", value,
                "trend", "rule-based 聚合",
                "trendDirection", "neutral"
        );
    }
}
