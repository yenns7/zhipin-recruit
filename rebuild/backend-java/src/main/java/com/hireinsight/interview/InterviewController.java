package com.hireinsight.interview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.InterviewAssignment;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.model.InterviewSession;
import com.hireinsight.model.Job;
import com.hireinsight.model.User;
import com.hireinsight.repository.InterviewAssignmentRepository;
import com.hireinsight.repository.InterviewFeedbackRepository;
import com.hireinsight.repository.InterviewSessionRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.UserRepository;
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

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/interviews")
public class InterviewController {

    private final InterviewFeedbackRepository feedbackRepository;
    private final InterviewSessionRepository sessionRepository;
    private final InterviewAssignmentRepository assignmentRepository;
    private final InterviewAIService aiService;
    private final JobRepository jobRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public InterviewController(InterviewFeedbackRepository feedbackRepository,
                               InterviewSessionRepository sessionRepository,
                               InterviewAssignmentRepository assignmentRepository,
                               InterviewAIService aiService,
                               JobRepository jobRepository,
                               UserRepository userRepository,
                               ObjectMapper objectMapper) {
        this.feedbackRepository = feedbackRepository;
        this.sessionRepository = sessionRepository;
        this.assignmentRepository = assignmentRepository;
        this.aiService = aiService;
        this.jobRepository = jobRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    // ---- Existing endpoints ----

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

    // ---- New AI Interview endpoints ----

    @PostMapping("/start")
    @PreAuthorize("hasAnyRole('RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> startAiInterview(
            @Valid @RequestBody StartInterviewRequest req) {
        Job job = jobRepository.findById(req.getJobId())
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + req.getJobId()));

        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions(job.getJdText(), 6);

        String questionsJson;
        try {
            questionsJson = objectMapper.writeValueAsString(questions);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize questions", e);
        }

        InterviewSession session = InterviewSession.builder()
                .jobId(req.getJobId())
                .candidateId(req.getCandidateId())
                .status("pending")
                .questionsJson(questionsJson)
                .build();
        session = sessionRepository.save(session);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sessionId", session.getId());
        result.put("session", session);
        result.put("questions", questions);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(result));
    }

    @PostMapping("/submit")
    @PreAuthorize("hasAnyRole('INTERVIEWER','RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitAnswers(
            @Valid @RequestBody SubmitAnswersRequest req,
            Authentication auth) {
        Long userId = (Long) auth.getDetails();

        InterviewSession session = sessionRepository.findById(req.getSessionId())
                .orElseThrow(() -> new IllegalArgumentException("Interview session not found: " + req.getSessionId()));

        if (!"pending".equals(session.getStatus()) && !"in_progress".equals(session.getStatus())) {
            throw new IllegalArgumentException("Session is not in a submittable state: " + session.getStatus());
        }

        String answersJson;
        try {
            answersJson = objectMapper.writeValueAsString(req.getAnswers());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize answers", e);
        }

        List<InterviewAIService.QA> qaList = req.getAnswers().stream()
                .map(a -> new InterviewAIService.QA(a.getQuestionId(), a.getQuestion(), a.getAnswer()))
                .collect(Collectors.toList());
        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(qaList);

        // Build report — use the score from evaluation (1-5 scale)
        String report = aiService.buildReport(qaList, evaluation.getScore());

        session.setAnswersJson(answersJson);
        session.setScore(evaluation.getScore());
        session.setAiReport(report);
        session.setInterviewerId(userId);
        session.setStatus("completed");
        session = sessionRepository.save(session);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sessionId", session.getId());
        result.put("score", evaluation.getScore());
        result.put("summary", evaluation.getSummary());
        result.put("strengths", evaluation.getStrengths());
        result.put("weaknesses", evaluation.getWeaknesses());
        result.put("passRecommended", evaluation.isPassRecommended());
        result.put("aiReport", report);

        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/guide")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getInterviewGuide() {
        Map<String, Object> guide = new LinkedHashMap<>();
        guide.put("title", "面试官操作指南");
        guide.put("version", "2.0");
        guide.put("rounds", List.of(
                Map.of(
                        "round", "screening",
                        "name", "初筛面试",
                        "focusAreas", List.of("基础知识考察", "项目经验核实", "沟通表达能力"),
                        "sampleQuestions", List.of(
                                "请做一个简短的自我介绍",
                                "请介绍你最近参与的一个项目",
                                "你为什么对这个岗位感兴趣？"
                        ),
                        "riskFactors", List.of("经验不符", "沟通障碍", "薪资期望过高")
                ),
                Map.of(
                        "round", "technical",
                        "name", "技术面试",
                        "focusAreas", List.of("技术深度", "架构设计能力", "问题解决能力", "编码能力"),
                        "sampleQuestions", List.of(
                                "请描述一个你解决过的复杂技术问题",
                                "你是如何进行系统架构设计的？",
                                "请谈谈你在性能优化方面的经验"
                        ),
                        "riskFactors", List.of("技术栈不匹配", "缺乏深度", "理论脱离实践")
                ),
                Map.of(
                        "round", "behavioral",
                        "name", "行为面试",
                        "focusAreas", List.of("团队协作", "冲突处理", "领导力", "抗压能力"),
                        "sampleQuestions", List.of(
                                "请分享一个你在团队中解决冲突的经历",
                                "描述一次你主动承担额外责任的经历",
                                "你是如何在截止日期压力下工作的？"
                        ),
                        "riskFactors", List.of("团队融入困难", "沟通协作问题", "抗压能力不足")
                ),
                Map.of(
                        "round", "final",
                        "name", "终面",
                        "focusAreas", List.of("综合能力评估", "文化匹配度", "发展潜力", "薪资谈判"),
                        "sampleQuestions", List.of(
                                "你的职业规划是什么？",
                                "你如何看待我们公司的文化？",
                                "你有什么问题想问我们？"
                        ),
                        "riskFactors", List.of("文化不匹配", "发展期望不一致", "薪资无法达成一致")
                )
        ));
        return ResponseEntity.ok(ApiResponse.ok(guide));
    }

    @GetMapping("/interviewers")
    @PreAuthorize("hasAnyRole('RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listInterviewers(
            @RequestParam(required = false) String name) {
        List<User> interviewers;
        if (name != null && !name.isBlank()) {
            interviewers = userRepository.findByRoleAndNameContainingIgnoreCase("interviewer", name);
        } else {
            interviewers = userRepository.findByRole("interviewer");
        }
        List<Map<String, Object>> result = interviewers.stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("name", u.getName());
            m.put("email", u.getEmail());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/assignments")
    @PreAuthorize("hasAnyRole('INTERVIEWER','RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<InterviewSession>>> listAssignments(Authentication auth) {
        Long userId = (Long) auth.getDetails();
        boolean isInterviewer = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_INTERVIEWER"));
        List<InterviewSession> sessions;
        if (isInterviewer) {
            sessions = sessionRepository.findByInterviewerId(userId);
        } else {
            sessions = sessionRepository.findAll();
        }
        return ResponseEntity.ok(ApiResponse.ok(sessions));
    }

    // ---- InterviewAssignment endpoints ----

    @PostMapping("/assignments")
    @PreAuthorize("hasAnyRole('RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createAssignment(
            @Valid @RequestBody CreateAssignmentRequest req) {
        // Validate interviewer exists
        userRepository.findById(req.getInterviewerId())
                .orElseThrow(() -> new IllegalArgumentException("Interviewer not found: " + req.getInterviewerId()));

        // Look up interviewer name
        String interviewerName = req.getInterviewerName();
        if (interviewerName == null || interviewerName.isBlank()) {
            interviewerName = userRepository.findById(req.getInterviewerId())
                    .map(User::getName)
                    .orElse("");
        }

        InterviewAssignment assignment = InterviewAssignment.builder()
                .interviewId(req.getInterviewId())
                .round(req.getRound())
                .interviewerId(req.getInterviewerId())
                .interviewerName(interviewerName)
                .scheduledAt(req.getScheduledAt())
                .location(req.getLocation())
                .status("SCHEDULED")
                .notes(req.getNotes())
                .build();
        assignment = assignmentRepository.save(assignment);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", assignment.getId())));
    }

    @PutMapping("/assignments/{id}/status")
    @PreAuthorize("hasAnyRole('INTERVIEWER','RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateAssignmentStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateAssignmentStatusRequest req) {
        InterviewAssignment assignment = assignmentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Assignment not found: " + id));

        assignment.setStatus(req.getStatus());
        if (req.getNotes() != null) {
            assignment.setNotes(req.getNotes());
        }
        assignment = assignmentRepository.save(assignment);

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", assignment.getId(),
                "status", assignment.getStatus()
        )));
    }

    @GetMapping("/assignments/by-interview/{interviewId}")
    @PreAuthorize("hasAnyRole('INTERVIEWER','RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<InterviewAssignment>>> getAssignmentsByInterview(
            @PathVariable Long interviewId) {
        List<InterviewAssignment> assignments = assignmentRepository.findByInterviewId(interviewId);
        return ResponseEntity.ok(ApiResponse.ok(assignments));
    }

    @GetMapping("/assignments/my")
    @PreAuthorize("hasAnyRole('INTERVIEWER','RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<InterviewAssignment>>> getMyAssignments(Authentication auth) {
        Long userId = (Long) auth.getDetails();
        List<InterviewAssignment> assignments = assignmentRepository.findByInterviewerId(userId);
        return ResponseEntity.ok(ApiResponse.ok(assignments));
    }

    // ---- Request DTOs ----

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

    @Data
    public static class StartInterviewRequest {
        @NotNull
        private Long jobId;
        @NotNull
        private Long candidateId;
    }

    @Data
    public static class SubmitAnswersRequest {
        @NotNull
        private Long sessionId;
        @NotNull
        private List<AnswerItem> answers;
    }

    @Data
    public static class AnswerItem {
        private String questionId;
        private String question;
        private String answer;
    }

    @Data
    public static class CreateAssignmentRequest {
        @NotNull
        private Long interviewId;
        @NotNull
        private Integer round;
        @NotNull
        private Long interviewerId;
        private String interviewerName;
        private LocalDateTime scheduledAt;
        private String location;
        private String notes;
    }

    @Data
    public static class UpdateAssignmentStatusRequest {
        @NotNull
        private String status;
        private String notes;
    }
}
