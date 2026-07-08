package com.hireinsight.interview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.model.InterviewSession;
import com.hireinsight.model.Job;
import com.hireinsight.model.User;
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

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/interviews")
public class InterviewController {

    private final InterviewFeedbackRepository feedbackRepository;
    private final InterviewSessionRepository sessionRepository;
    private final InterviewAIService aiService;
    private final JobRepository jobRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public InterviewController(InterviewFeedbackRepository feedbackRepository,
                               InterviewSessionRepository sessionRepository,
                               InterviewAIService aiService,
                               JobRepository jobRepository,
                               UserRepository userRepository,
                               ObjectMapper objectMapper) {
        this.feedbackRepository = feedbackRepository;
        this.sessionRepository = sessionRepository;
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
        // Get job to extract JD text
        Job job = jobRepository.findById(req.getJobId())
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + req.getJobId()));

        // Generate questions from JD
        List<InterviewAIService.InterviewQuestion> questions = aiService.generateQuestions(job.getJdText(), 6);

        // Serialize questions to JSON
        String questionsJson;
        try {
            questionsJson = objectMapper.writeValueAsString(questions);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize questions", e);
        }

        // Create session
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

        // Serialize answers
        String answersJson;
        try {
            answersJson = objectMapper.writeValueAsString(req.getAnswers());
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize answers", e);
        }

        // Evaluate answers
        List<InterviewAIService.QA> qaList = req.getAnswers().stream()
                .map(a -> new InterviewAIService.QA(a.getQuestionId(), a.getQuestion(), a.getAnswer()))
                .collect(Collectors.toList());
        InterviewAIService.InterviewEvaluation evaluation = aiService.evaluateAnswers(qaList);

        // Generate report
        String report = aiService.generateReport(qaList, evaluation.getScore());

        // Update session
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
        result.put("aiReport", report);

        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/guide")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getInterviewGuide() {
        Map<String, Object> guide = new LinkedHashMap<>();
        guide.put("title", "面试官操作指南");
        guide.put("version", "1.0");
        guide.put("sections", List.of(
                Map.of(
                        "title", "面试前准备",
                        "content", "1. 仔细阅读候选人简历，标记关键经历和技能点\n" +
                                   "2. 查看岗位 JD，明确招聘需求和核心能力要求\n" +
                                   "3. 准备面试问题，确保覆盖技术能力、行为能力和综合能力\n" +
                                   "4. 确保面试环境安静、网络稳定"
                ),
                Map.of(
                        "title", "面试进行中",
                        "content", "1. 先做简短介绍，让候选人放松\n" +
                                   "2. 按照准备好的问题有序提问\n" +
                                   "3. 注意倾听，适时追问深入了解\n" +
                                   "4. 记录关键回答要点，作为评分依据\n" +
                                   "5. 控制面试时间，确保覆盖所有评估维度"
                ),
                Map.of(
                        "title", "面试评分",
                        "content", "1. 技术能力（40%）：考察技术深度和广度\n" +
                                   "2. 项目经验（25%）：考察实际项目贡献和解决问题的能力\n" +
                                   "3. 沟通表达（15%）：考察思路清晰度和表达逻辑\n" +
                                   "4. 团队协作（10%）：考察团队合作意识和冲突处理能力\n" +
                                   "5. 学习能力（10%）：考察学习新技术的主动性和方法"
                ),
                Map.of(
                        "title", "面试后反馈",
                        "content", "1. 面试结束后及时填写面试反馈\n" +
                                   "2. 给出客观评分和建议\n" +
                                   "3. 明确是否推荐进入下一轮\n" +
                                   "4. 提供详细的 AI 辅助分析报告"
                )
        ));
        return ResponseEntity.ok(ApiResponse.ok(guide));
    }

    @GetMapping("/interviewers")
    @PreAuthorize("hasAnyRole('RECRUITER','MANAGER','ADMIN')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listInterviewers() {
        List<User> interviewers = userRepository.findByRole("interviewer");
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
}
