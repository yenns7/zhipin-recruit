package com.hireinsight.bi;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Job;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.JobRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/bi")
public class BiController {

    private final CandidateRepository candidateRepository;
    private final JobRepository jobRepository;

    public BiController(CandidateRepository candidateRepository, JobRepository jobRepository) {
        this.candidateRepository = candidateRepository;
        this.jobRepository = jobRepository;
    }

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> overview(Authentication authentication) {
        boolean adminOrManager = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN")
                        || authority.getAuthority().equals("ROLE_MANAGER"));
        Long userId = (Long) authentication.getDetails();
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
