package com.hireinsight.interview;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.model.InterviewSession;
import com.hireinsight.model.Job;
import com.hireinsight.model.User;
import com.hireinsight.repository.InterviewFeedbackRepository;
import com.hireinsight.repository.InterviewSessionRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InterviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private InterviewFeedbackRepository feedbackRepository;

    @Autowired
    private InterviewSessionRepository sessionRepository;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        feedbackRepository.deleteAll();
        sessionRepository.deleteAll();
        jobRepository.deleteAll();
        userRepository.deleteAll();
    }

    // ---- Existing tests ----

    @Test
    void interviewerOnlySeesOwnInterviews() throws Exception {
        feedbackRepository.save(InterviewFeedback.builder()
                .candidateId(10L)
                .jobId(20L)
                .interviewerId(1L)
                .qaJson("[]")
                .aiReport("{}")
                .build());
        feedbackRepository.save(InterviewFeedback.builder()
                .candidateId(11L)
                .jobId(21L)
                .interviewerId(2L)
                .qaJson("[]")
                .aiReport("{}")
                .build());

        mockMvc.perform(get("/api/v1/interviews")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "interviewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].interviewerId").value(1));
    }

    @Test
    void recruiterCanScheduleInterviewDraft() throws Exception {
        mockMvc.perform(post("/api/v1/interviews/schedule")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":12,\"jobId\":3,\"interviewerId\":7}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.status").value("draft"));
    }

    // ---- New tests ----

    @Test
    void startAiInterview_Success() throws Exception {
        // Given: a job with JD text
        Job job = jobRepository.save(Job.builder()
                .title("Java后端开发工程师")
                .jdText("岗位职责：负责Java后端系统开发，使用Spring Boot框架，熟悉微服务架构和分布式系统。" +
                        "要求精通Java、MySQL、Redis、Kafka等中间件。熟悉Docker和Kubernetes优先。")
                .status("active")
                .build());

        String requestBody = objectMapper.writeValueAsString(Map.of(
                "jobId", job.getId(),
                "candidateId", 100L
        ));

        mockMvc.perform(post("/api/v1/interviews/start")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sessionId").isNumber())
                .andExpect(jsonPath("$.data.questions").isArray())
                .andExpect(jsonPath("$.data.questions.length()").value(6))
                .andExpect(jsonPath("$.data.session.status").value("pending"));
    }

    @Test
    void startAiInterview_MissingParams_Returns400() throws Exception {
        // Missing jobId
        String requestBody = objectMapper.writeValueAsString(Map.of("candidateId", 100L));

        mockMvc.perform(post("/api/v1/interviews/start")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submitAnswers_Success() throws Exception {
        // Given: a job
        Job job = jobRepository.save(Job.builder()
                .title("Java后端开发工程师")
                .jdText("Java后端开发，Spring Boot，微服务，分布式")
                .build());

        // Create a session with questions
        InterviewSession session = sessionRepository.save(InterviewSession.builder()
                .jobId(job.getId())
                .candidateId(100L)
                .status("pending")
                .questionsJson("[{\"id\":\"q-1\",\"question\":\"请谈谈你在Java方面的经验？\",\"type\":\"technical\"}]")
                .build());

        String requestBody = objectMapper.writeValueAsString(Map.of(
                "sessionId", session.getId(),
                "answers", List.of(Map.of(
                        "questionId", "q-1",
                        "question", "请谈谈你在Java方面的经验？",
                        "answer", "我有5年Java开发经验，熟练掌握Spring Boot框架，参与过多个微服务项目的架构设计和开发。" +
                                "在项目中使用了Redis缓存优化性能，Kafka处理异步消息。同时熟悉Docker容器化部署。"
                ))
        ));

        mockMvc.perform(post("/api/v1/interviews/submit")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value(session.getId()))
                .andExpect(jsonPath("$.data.score").isNumber())
                .andExpect(jsonPath("$.data.summary").isString())
                .andExpect(jsonPath("$.data.strengths").isArray())
                .andExpect(jsonPath("$.data.weaknesses").isArray())
                .andExpect(jsonPath("$.data.aiReport").isString());
    }

    @Test
    void getInterviewGuide_Success() throws Exception {
        mockMvc.perform(get("/api/v1/interviews/guide")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("面试官操作指南"))
                .andExpect(jsonPath("$.data.sections").isArray())
                .andExpect(jsonPath("$.data.sections.length()").value(4));
    }

    @Test
    void listInterviewers_Success() throws Exception {
        // Given: interviewer users
        userRepository.save(User.builder()
                .name("张三")
                .email("zhangsan@test.com")
                .role("interviewer")
                .passwordHash("hash")
                .build());
        userRepository.save(User.builder()
                .name("李四")
                .email("lisi@test.com")
                .role("interviewer")
                .passwordHash("hash")
                .build());
        // A non-interviewer who should not appear
        userRepository.save(User.builder()
                .name("管理员")
                .email("admin@test.com")
                .role("admin")
                .passwordHash("hash")
                .build());

        mockMvc.perform(get("/api/v1/interviews/interviewers")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].name").isString());
    }

    @Test
    void listAssignments_Success() throws Exception {
        // Given: some interview sessions
        sessionRepository.save(InterviewSession.builder()
                .jobId(1L)
                .candidateId(100L)
                .interviewerId(1L)
                .status("pending")
                .build());
        sessionRepository.save(InterviewSession.builder()
                .jobId(2L)
                .candidateId(101L)
                .interviewerId(2L)
                .status("completed")
                .build());

        mockMvc.perform(get("/api/v1/interviews/assignments")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void interviewerSeesOnlyOwnAssignments() throws Exception {
        // Given: sessions assigned to different interviewers
        sessionRepository.save(InterviewSession.builder()
                .jobId(1L)
                .candidateId(100L)
                .interviewerId(1L)
                .status("pending")
                .build());
        sessionRepository.save(InterviewSession.builder()
                .jobId(2L)
                .candidateId(101L)
                .interviewerId(2L)
                .status("pending")
                .build());

        mockMvc.perform(get("/api/v1/interviews/assignments")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "interviewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].interviewerId").value(1));
    }

    @Test
    void unauthenticatedRequest_Returns401() throws Exception {
        mockMvc.perform(post("/api/v1/interviews/start")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jobId\":1,\"candidateId\":1}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void recruiterCannotAccessInterviewersWithoutAuth() throws Exception {
        mockMvc.perform(get("/api/v1/interviews/interviewers"))
                .andExpect(status().isUnauthorized());
    }
}
