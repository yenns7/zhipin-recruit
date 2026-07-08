package com.hireinsight.match;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.match.JobMatcher.MatchResult;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Job;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.PipelineStageRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/match")
public class MatchController {

    private final JobMatcher jobMatcher;
    private final JobRepository jobRepository;
    private final CandidateRepository candidateRepository;
    private final PipelineStageRepository pipelineStageRepository;

    public MatchController(JobMatcher jobMatcher, JobRepository jobRepository,
                           CandidateRepository candidateRepository,
                           PipelineStageRepository pipelineStageRepository) {
        this.jobMatcher = jobMatcher;
        this.jobRepository = jobRepository;
        this.candidateRepository = candidateRepository;
        this.pipelineStageRepository = pipelineStageRepository;
    }

    /**
     * POST /api/v1/match
     * General matching: match given candidates against a job.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<List<MatchResponse>>> match(
            @Valid @RequestBody BatchMatchRequest req,
            Authentication auth) {
        Job job = jobRepository.findById(req.getJobId())
                .orElse(null);
        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Job not found: " + req.getJobId()));
        }

        List<Candidate> candidates = candidateRepository.findAllById(req.getCandidateIds());
        if (candidates.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.ok(List.of()));
        }

        // Build candidate id -> name map
        Map<Long, String> candidateNames = candidates.stream()
                .collect(Collectors.toMap(Candidate::getId, c -> c.getNameMasked() != null ? c.getNameMasked() : "候选人 " + c.getId()));

        List<MatchResponse> results = candidates.stream()
                .map(c -> {
                    MatchResult mr = jobMatcher.match(job.getJdText(), c.getResumeJson());
                    return new MatchResponse(c.getId(), candidateNames.get(c.getId()), mr);
                })
                .sorted(Comparator.comparingDouble(MatchResponse::getScore).reversed())
                .toList();

        return ResponseEntity.ok(ApiResponse.ok(results));
    }

    /**
     * GET /api/v1/match/jobs/{jobId}/preview
     * Preview match scores for all candidates against a job, sorted by score descending.
     */
    @GetMapping("/jobs/{jobId}/preview")
    public ResponseEntity<ApiResponse<List<MatchResponse>>> preview(
            @PathVariable Long jobId,
            Authentication auth) {
        Job job = jobRepository.findById(jobId)
                .orElse(null);
        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Job not found: " + jobId));
        }

        List<Candidate> candidates = candidateRepository.findAll();

        Map<Long, String> candidateNames = candidates.stream()
                .collect(Collectors.toMap(Candidate::getId, c -> c.getNameMasked() != null ? c.getNameMasked() : "候选人 " + c.getId()));

        List<MatchResponse> results = candidates.stream()
                .map(c -> {
                    MatchResult mr = jobMatcher.match(job.getJdText(), c.getResumeJson());
                    return new MatchResponse(c.getId(), candidateNames.get(c.getId()), mr);
                })
                .sorted(Comparator.comparingDouble(MatchResponse::getScore).reversed())
                .toList();

        return ResponseEntity.ok(ApiResponse.ok(results));
    }

    /**
     * POST /api/v1/match/jobs/{jobId}/match
     * Match candidates and add them to the pipeline (stage: ai_screen).
     */
    @PostMapping("/jobs/{jobId}/match")
    public ResponseEntity<ApiResponse<List<MatchResponse>>> matchAndAddToPipeline(
            @PathVariable Long jobId,
            @Valid @RequestBody MatchToPipelineRequest req,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        Job job = jobRepository.findById(jobId)
                .orElse(null);
        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "Job not found: " + jobId));
        }

        List<Candidate> candidates = candidateRepository.findAllById(req.getCandidateIds());
        if (candidates.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.ok(List.of()));
        }

        Map<Long, String> candidateNames = candidates.stream()
                .collect(Collectors.toMap(Candidate::getId, c -> c.getNameMasked() != null ? c.getNameMasked() : "候选人 " + c.getId()));

        List<MatchResponse> results = new ArrayList<>();
        for (Candidate c : candidates) {
            MatchResult mr = jobMatcher.match(job.getJdText(), c.getResumeJson());

            // Add to pipeline with initial stage "ai_screen"
            PipelineStage stage = PipelineStage.builder()
                    .candidateId(c.getId())
                    .jobId(jobId)
                    .stage("ai_screen")
                    .updatedBy(userId)
                    .build();
            pipelineStageRepository.save(stage);

            results.add(new MatchResponse(c.getId(), candidateNames.get(c.getId()), mr));
        }

        results.sort(Comparator.comparingDouble(MatchResponse::getScore).reversed());
        return ResponseEntity.ok(ApiResponse.ok(results));
    }

    // --- Request DTOs ---

    @Data
    public static class MatchRequest {
        @NotNull
        private Long jobId;
    }

    @Data
    public static class BatchMatchRequest {
        @NotNull
        private Long jobId;
        @NotNull
        private List<Long> candidateIds;
    }

    @Data
    public static class MatchToPipelineRequest {
        @NotNull
        private List<Long> candidateIds;
    }

    // --- Response DTO ---

    @Data
    public static class MatchResponse {
        private final Long candidateId;
        private final String candidateName;
        private final double score;
        private final List<String> matchedRequiredSkills;
        private final List<String> matchedPreferredSkills;
        private final List<String> missingRequiredSkills;
        private final int yearsOfExperience;
        private final String summary;

        public MatchResponse(Long candidateId, String candidateName, MatchResult mr) {
            this.candidateId = candidateId;
            this.candidateName = candidateName;
            this.score = mr.score;
            this.matchedRequiredSkills = new ArrayList<>(mr.matchedRequiredSkills);
            this.matchedPreferredSkills = new ArrayList<>(mr.matchedPreferredSkills);
            this.missingRequiredSkills = new ArrayList<>(mr.missingRequiredSkills);
            this.yearsOfExperience = mr.yearsOfExperience;
            this.summary = mr.summary;
        }
    }
}
