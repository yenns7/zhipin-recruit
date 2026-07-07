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
import org.springframework.security.access.prepost.PreAuthorize;
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

    @PostMapping("/schedule")
    @PreAuthorize("hasAnyRole('RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> scheduleInterview(
            @Valid @RequestBody ScheduleRequest req) {
        InterviewFeedback feedback = InterviewFeedback.builder()
                .candidateId(req.getCandidateId())
                .jobId(req.getJobId())
                .interviewerId(req.getInterviewerId())
                .qaJson("[]")
                .aiReport("{}")
                .build();
        feedback = feedbackRepository.save(feedback);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of(
                        "id", feedback.getId(),
                        "status", "draft"
                )));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<InterviewFeedback>>> listFeedback(
            @RequestParam(required = false) Long candidateId,
            @RequestParam(required = false) Long jobId,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean interviewer = auth.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_INTERVIEWER"));
        List<InterviewFeedback> feedbacks;
        if (candidateId != null) {
            feedbacks = feedbackRepository.findByCandidateId(candidateId);
        } else if (jobId != null) {
            feedbacks = feedbackRepository.findByJobId(jobId);
        } else if (interviewer) {
            feedbacks = feedbackRepository.findByInterviewerId(userId);
        } else {
            feedbacks = feedbackRepository.findAll();
        }
        if (interviewer && (candidateId != null || jobId != null)) {
            feedbacks = feedbacks.stream()
                    .filter(feedback -> userId.equals(feedback.getInterviewerId()))
                    .toList();
        }
        return ResponseEntity.ok(ApiResponse.ok(feedbacks));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<InterviewFeedback>> getFeedback(@PathVariable Long id) {
        InterviewFeedback feedback = feedbackRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Interview feedback not found: " + id));
        return ResponseEntity.ok(ApiResponse.ok(feedback));
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

    @Data
    public static class ScheduleRequest {
        @NotNull
        private Long candidateId;
        @NotNull
        private Long jobId;
        @NotNull
        private Long interviewerId;
    }
}
