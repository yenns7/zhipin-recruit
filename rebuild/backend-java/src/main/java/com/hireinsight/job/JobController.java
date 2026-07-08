package com.hireinsight.job;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.Job;
import com.hireinsight.repository.JobRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/jobs")
public class JobController {

    private final JobRepository jobRepository;

    public JobController(JobRepository jobRepository) {
        this.jobRepository = jobRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Job>>> listJobs(
            Authentication auth,
            @RequestParam(required = false) String status) {
        Long userId = (Long) auth.getDetails();
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ROLE_MANAGER"));
        List<Job> jobs = isAdmin ? jobRepository.findAll() : jobRepository.findByOwnerHrId(userId);
        if (status != null && !status.isBlank()) {
            jobs = jobs.stream()
                    .filter(job -> status.equals(job.getStatus()))
                    .toList();
        }
        return ResponseEntity.ok(ApiResponse.ok(jobs));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Job>> getJob(@PathVariable Long id) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + id));
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> createJob(
            @Valid @RequestBody CreateJobRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        Job job = Job.builder()
                .title(req.getTitle())
                .jdText(req.getJdText())
                .ownerHrId(userId)
                .status("active")
                .build();
        job = jobRepository.save(job);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", job.getId())));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Job>> updateJob(
            @PathVariable Long id,
            @Valid @RequestBody UpdateJobRequest req) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + id));
        if (req.getTitle() != null) job.setTitle(req.getTitle());
        if (req.getJdText() != null) job.setJdText(req.getJdText());
        job = jobRepository.save(job);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<ApiResponse<Job>> closeJob(@PathVariable Long id) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + id));
        job.setStatus("closed");
        job = jobRepository.save(job);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<ApiResponse<Job>> restoreJob(@PathVariable Long id) {
        Job job = jobRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + id));
        job.setStatus("active");
        job = jobRepository.save(job);
        return ResponseEntity.ok(ApiResponse.ok(job));
    }

    @Data
    public static class CreateJobRequest {
        @NotBlank
        private String title;
        @NotBlank
        private String jdText;
    }

    @Data
    public static class UpdateJobRequest {
        private String title;
        private String jdText;
    }
}
