package com.hireinsight.bi;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.*;
import com.hireinsight.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDateTime;

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

    @Autowired
    private UploadBatchRepository uploadBatchRepository;

    @Autowired
    private InterviewAssignmentRepository interviewAssignmentRepository;

    @Autowired
    private DemandRepository demandRepository;

    @Autowired
    private OfferRecordRepository offerRecordRepository;

    private Long managerUserId = 99L;
    private Long recruiterUserId = 1L;
    private Long hrStaffId;
    private Long jobId;
    private Long cand1Id;
    private Long cand2Id;
    private Long batchId;
    private Long demandId;

    @BeforeEach
    void setUp() {
        candidateRepository.deleteAll();
        jobRepository.deleteAll();
        pipelineStageRepository.deleteAll();
        interviewFeedbackRepository.deleteAll();
        eventRepository.deleteAll();
        userRepository.deleteAll();
        uploadBatchRepository.deleteAll();
        interviewAssignmentRepository.deleteAll();
        demandRepository.deleteAll();
        offerRecordRepository.deleteAll();

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

        // Upload batch for channel quality
        UploadBatch batch = uploadBatchRepository.save(UploadBatch.builder()
                .ownerHrId(hrStaffId)
                .channel("BOSS直聘")
                .fileCount(5)
                .build());
        batchId = batch.getId();

        // Candidates
        Candidate cand1 = candidateRepository.save(Candidate.builder()
                .ownerHrId(hrStaffId)
                .nameMasked("候选人甲")
                .resumeJson("{}")
                .parseStatus("success")
                .batchId(batchId)
                .build());
        cand1Id = cand1.getId();

        Candidate cand2 = candidateRepository.save(Candidate.builder()
                .ownerHrId(hrStaffId)
                .nameMasked("候选人乙")
                .resumeJson("{}")
                .parseStatus("success")
                .batchId(batchId)
                .build());
        cand2Id = cand2.getId();

        Candidate cand3 = candidateRepository.save(Candidate.builder()
                .ownerHrId(2L)
                .nameMasked("候选人丙")
                .resumeJson("{}")
                .parseStatus("success")
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

        // Events for resume consumption
        eventRepository.save(Event.builder()
                .actorId(hrStaffId).action("resume.downloaded").entityId(cand1Id).entityType("candidate")
                .payload("{}").ts(Instant.now()).build());
        eventRepository.save(Event.builder()
                .actorId(hrStaffId).action("resume.viewed").entityId(cand1Id).entityType("candidate")
                .payload("{}").ts(Instant.now()).build());

        // Interview assignment for accountability
        interviewAssignmentRepository.save(InterviewAssignment.builder()
                .interviewId(1L).interviewerId(hrStaffId).interviewerName("张三")
                .round(1).status("SCHEDULED")
                .scheduledAt(LocalDateTime.now().minusHours(2))
                .build());

        // Demand for demand health
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .ownerHrId(hrStaffId)
                .requestNo("DEM-2026-001")
                .requesterName("需求方")
                .department("技术部")
                .hiringManagerName("经理")
                .headcount(3)
                .status("open")
                .priority("high")
                .requestedAt(Instant.now())
                .build());
        demandId = demand.getId();
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
                .andExpect(jsonPath("$.data.recentActivity.length()").value(4));
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

    // ===================== Funnel Tests =====================

    @Test
    void managerCanAccessFunnel() throws Exception {
        mockMvc.perform(get("/api/v1/bi/funnel?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resume_imported").value(3))
                .andExpect(jsonPath("$.data.job_count").exists())
                .andExpect(jsonPath("$.data.conversion_rate").exists())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessFunnel() throws Exception {
        mockMvc.perform(get("/api/v1/bi/funnel?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resume_imported").value(2))
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void funnelReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/funnel"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void funnelAcceptsDaysParam() throws Exception {
        mockMvc.perform(get("/api/v1/bi/funnel?days=7")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days").value(7));
    }

    // ===================== Channel Quality Tests =====================

    @Test
    void managerCanAccessChannelQuality() throws Exception {
        mockMvc.perform(get("/api/v1/bi/channel-quality?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.channels").isArray())
                .andExpect(jsonPath("$.data.total_candidates").exists())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessChannelQuality() throws Exception {
        mockMvc.perform(get("/api/v1/bi/channel-quality?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_candidates").value(2));
    }

    @Test
    void channelQualityReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/channel-quality"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Interview Accountability Tests =====================

    @Test
    void managerCanAccessInterviewAccountability() throws Exception {
        mockMvc.perform(get("/api/v1/bi/interview-accountability?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_scheduled").exists())
                .andExpect(jsonPath("$.data.feedback_rate").exists())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessInterviewAccountability() throws Exception {
        mockMvc.perform(get("/api/v1/bi/interview-accountability?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_scheduled").exists());
    }

    @Test
    void interviewAccountabilityReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/interview-accountability"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Manager Alerts Tests =====================

    @Test
    void managerCanAccessManagerAlerts() throws Exception {
        mockMvc.perform(get("/api/v1/bi/manager-alerts?days=90")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobs_overdue").exists())
                .andExpect(jsonPath("$.data.demands_unfilled").exists())
                .andExpect(jsonPath("$.data.candidates_stalled").exists())
                .andExpect(jsonPath("$.data.risk_flagged_demands").exists())
                .andExpect(jsonPath("$.data.days").value(90));
    }

    @Test
    void recruiterCanAccessManagerAlerts() throws Exception {
        mockMvc.perform(get("/api/v1/bi/manager-alerts?days=90")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jobs_overdue").exists());
    }

    @Test
    void managerAlertsReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/manager-alerts"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Demand Health Tests =====================

    @Test
    void managerCanAccessDemandHealth() throws Exception {
        mockMvc.perform(get("/api/v1/bi/demand-health?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_headcount").exists())
                .andExpect(jsonPath("$.data.active_demands").exists())
                .andExpect(jsonPath("$.data.fill_rate").exists())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessDemandHealth() throws Exception {
        mockMvc.perform(get("/api/v1/bi/demand-health?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_headcount").exists());
    }

    @Test
    void demandHealthReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/demand-health"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Resume Consumption Tests =====================

    @Test
    void managerCanAccessResumeConsumption() throws Exception {
        mockMvc.perform(get("/api/v1/bi/resume-consumption?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_downloads").exists())
                .andExpect(jsonPath("$.data.total_views").exists())
                .andExpect(jsonPath("$.data.total_matches").exists())
                .andExpect(jsonPath("$.data.by_user").isArray())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessResumeConsumption() throws Exception {
        mockMvc.perform(get("/api/v1/bi/resume-consumption?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_downloads").exists());
    }

    @Test
    void resumeConsumptionReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/resume-consumption"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Data Quality Tests =====================

    @Test
    void managerCanAccessDataQuality() throws Exception {
        mockMvc.perform(get("/api/v1/bi/data-quality?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_candidates").exists())
                .andExpect(jsonPath("$.data.candidates_without_resume").exists())
                .andExpect(jsonPath("$.data.parse_success_rate").exists())
                .andExpect(jsonPath("$.data.field_completion_rate").exists())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void recruiterCanAccessDataQuality() throws Exception {
        mockMvc.perform(get("/api/v1/bi/data-quality?days=30")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(hrStaffId, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total_candidates").value(2));
    }

    @Test
    void dataQualityReturns401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/bi/data-quality"))
                .andExpect(status().isUnauthorized());
    }

    // ===================== Default Days Parameter Tests =====================

    @Test
    void funnelDefaultsTo30Days() throws Exception {
        mockMvc.perform(get("/api/v1/bi/funnel")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days").value(30));
    }

    @Test
    void managerAlertsDefaultsTo90Days() throws Exception {
        mockMvc.perform(get("/api/v1/bi/manager-alerts")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(managerUserId, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days").value(90));
    }
}
