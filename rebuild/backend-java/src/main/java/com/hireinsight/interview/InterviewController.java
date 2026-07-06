package com.hireinsight.interview;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.repository.InterviewFeedbackRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/interviews")
public class InterviewController {

    private final InterviewFeedbackRepository feedbackRepository;

    public InterviewController(InterviewFeedbackRepository feedbackRepository) {
        this.feedbackRepository = feedbackRepository;
    }

    @PostMapping("/feedback")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitFeedback(
            @Valid @RequestBody FeedbackRequest req, Authentication auth) {
        Long userId = (Long) auth.getDetails();
        InterviewFeedback feedback = InterviewFeedback.builder()
                .candidateId(req.getCandidateId())
                .jobId(req.getJobId())
                .interviewerId(userId)
                .score(req.getScore())
                .passRecommended(req.getPassRecommended())
                .qaJson(req.getQaJson())
                .aiReport(req.getAiReport())
                .build();
        feedback = feedbackRepository.save(feedback);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", feedback.getId())));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<InterviewFeedback>>> listFeedback(
            @RequestParam(required = false) Long candidateId,
            @RequestParam(required = false) Long jobId) {
        if (candidateId != null) {
            return ResponseEntity.ok(ApiResponse.ok(feedbackRepository.findByCandidateId(candidateId)));
        }
        if (jobId != null) {
            return ResponseEntity.ok(ApiResponse.ok(feedbackRepository.findByJobId(jobId)));
        }
        return ResponseEntity.ok(ApiResponse.ok(feedbackRepository.findAll()));
    }

    @Data
    public static class FeedbackRequest {
        @NotNull
        private Long candidateId;
        @NotNull
        private Long jobId;
        @Min(1) @Max(5)
        private Integer score;
        private Boolean passRecommended;
        private String qaJson;
        private String aiReport;
    }
}
