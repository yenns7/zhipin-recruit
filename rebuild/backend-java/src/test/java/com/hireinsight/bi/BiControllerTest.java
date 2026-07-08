package com.hireinsight.bi;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Event;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.model.Job;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.model.User;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.EventRepository;
import com.hireinsight.repository.InterviewFeedbackRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.PipelineStageRepository;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private CandidateRepository candidateRepository;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private PipelineStageRepository pipelineStageRepository;

    @Autowired
    private InterviewFeedbackRepository interviewFeedbackRepository;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private UserRepository userRepository;

    private Long managerUserId = 99L;
    private Long recruiterUserId = 1L;
    private Long hrStaffId;
    private Long jobId;
    private Long cand1Id;
    private Long cand2Id;

    @BeforeEach
    void setUp() {
        candidateRepository.deleteAll();
        jobRepository.deleteAll();
        pipelineStageRepository.deleteAll();
        interviewFeedbackRepository.deleteAll();
        eventRepository.deleteAll();
        userRepository.deleteAll();

        // Create a user for HR staff lookup
        User staff = userRepository.save(User.builder()
                .name("张三")
                .email("zhangsan@test.com")
                .role("recruiter")
                .passwordHash("dummy")
                .isActive(true)
                .build());
        hrStaffId = staff.getId();

        // Jobs
        Job job1 = jobRepository.save(Job.builder()
                .title("Java 后端工程师")
                .jdText("负责核心业务系统")
                .ownerHrId(hrStaffId)
                .status("active")
                .build());
        jobId = job1.getId();

        jobRepository.save(Job.builder()
                .title("前端工程师")
                .jdText("负责 Vue 前端")
                .ownerHrId(2L)
                .status("active")
                .build());

        // Candidates
        Candidate cand1 = candidateRepository.save(Candidate.builder()
                .ownerHrId(hrStaffId)
                .nameMasked("候选人甲")
                .resumeJson("{}")
                .build());
        cand1Id = cand1.getId();

        Candidate cand2 = candidateRepository.save(Candidate.builder()
                .ownerHrId(hrStaffId)
                .nameMasked("候选人乙")
                .resumeJson("{}")
                .build());
        cand2Id = cand2.getId();

        Candidate cand3 = candidateRepository.save(Candidate.builder()
                .ownerHrId(2L)
                .nameMasked("候选人丙")
                .resumeJson("{}")
                .build());
        Long cand3Id = cand3.getId();

        // Pipeline stages for the job (funnel data)
        pipelineStageRepository.save(PipelineStage.builder()
                .candidateId(cand1Id).jobId(jobId).stage("ai_screen").updatedBy(hrStaffId).ts(Instant.now()).build());
        pipelineStageRepository.save(PipelineStage.builder()
                .candidateId(cand2Id).jobId(jobId).stage("interview").updatedBy(hrStaffId).ts(Instant.now()).build());
        pipelineStageRepository.save(PipelineStage.builder()
                .candidateId(cand3Id).jobId(jobId).stage("pending").updatedBy(2L).ts(Instant.now()).build());

        // Interview feedbacks for the job
        interviewFeedbackRepository.save(InterviewFeedback.builder()
                .candidateId(cand2Id).jobId(jobId).interviewerId(hrStaffId).score(4).passRecommended(true).build());
        interviewFeedbackRepository.save(InterviewFeedback.builder()
                .candidateId(cand1Id).jobId(jobId).interviewerId(hrStaffId).score(3).passRecommended(false).build());

        // Events (recent activity for hrStaffId)
        eventRepository.save(Event.builder()
                .actorId(hrStaffId).action("pipeline_move").entityId(cand1Id).entityType("candidate")
                .payload("{\"fromStage\":\"pending\",\"toStage\":\"ai_screen\"}")
                .ts(Instant.now()).build());
        eventRepository.save(Event.builder()
                .actorId(hrStaffId).action("note_added").entityId(cand1Id).entityType("candidate")
                .payload("{}")
                .ts(Instant.now()).build());
    }

    // ===================== Staff Analytics Tests =====================

    @Test
    void managerCanAccessStaffAnalytics() throws Exception {
        mockMvc.perform(get("/api/v1/bi/staff/" + hrStaffId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.staffId").value(hrStaffId))
                .andExpect(jsonPath("$.data.staffName").value("张三"))
                .andExpect(jsonPath("$.data.staffRole").value("recruiter"))
                .andExpect(jsonPath("$.data.overview.totalCandidates").value(2))
                .andExpect(jsonPath("$.data.overview.activeJobs").value(1))
                .andExpect(jsonPath("$.data.overview.pipelineTotal").value(2))
                .andExpect(jsonPath("$.data.overview.interviewsCompleted").value(2))
                .andExpect(jsonPath("$.data.pipelineBreakdown.ai_screen").exists())
                .andExpect(jsonPath("$.data.conversionRates.screenToInterview").exists())
                .andExpect(jsonPath("$.data.recentActivity").isArray())
                .andExpect(jsonPath("$.data.recentActivity.length()").value(2));
    }

    @Test
    void adminCanAccessStaffAnalytics() throws Exception {
        mockMvc.perform(get("/api/v1/bi/staff/" + hrStaffId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.staffId").value(hrStaffId));
    }

    @Test
    void recruiterCannotAccessStaffAnalytics() throws Exception {
        mockMvc.perform(get("/api/v1/bi/staff/" + hrStaffId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(recruiterUserId, "recruiter")))
                .andExpect(status().isForbidden());
    }

    @Test
    void staffAnalyticsReturns404ForInvalidHrId() throws Exception {
        mockMvc.perform(get("/api/v1/bi/staff/99999")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isNotFound());
    }

    @Test
    void staffAnalyticsReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/staff/" + hrStaffId))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Job Funnel Tests =====================

    @Test
    void managerCanAccessJobFunnel() throws Exception {
        mockMvc.perform(get("/api/v1/bi/job/" + jobId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobId").value(jobId))
                .andExpect(jsonPath("$.data.jobTitle").value("Java 后端工程师"))
                .andExpect(jsonPath("$.data.funnel").exists())
                .andExpect(jsonPath("$.data.conversionRates").exists())
                .andExpect(jsonPath("$.data.interviewStats").exists())
                .andExpect(jsonPath("$.data.interviewStats.total").value(2))
                .andExpect(jsonPath("$.data.interviewStats.avgScore").value(3.5))
                .andExpect(jsonPath("$.data.interviewStats.passRate").value(0.5))
                .andExpect(jsonPath("$.data.sourcingBreakdown").exists());
    }

    @Test
    void adminCanAccessJobFunnel() throws Exception {
        mockMvc.perform(get("/api/v1/bi/job/" + jobId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobId").value(jobId));
    }

    @Test
    void recruiterCannotAccessJobFunnel() throws Exception {
        mockMvc.perform(get("/api/v1/bi/job/" + jobId)
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(recruiterUserId, "recruiter")))
                .andExpect(status().isForbidden());
    }

    @Test
    void jobFunnelReturns404ForInvalidJobId() throws Exception {
        mockMvc.perform(get("/api/v1/bi/job/99999")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isNotFound());
    }

    @Test
    void jobFunnelReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/job/" + jobId))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Existing overview tests =====================

    @Test
    void recruiterOverviewUsesOwnOwnershipScope() throws Exception {
        mockMvc.perform(get("/api/v1/bi/overview")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(recruiterUserId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.adminOrManager").value(false));
    }

    @Test
    void managerOverviewUsesTeamScope() throws Exception {
        mockMvc.perform(get("/api/v1/bi/overview")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.adminOrManager").value(true));
    }
}
