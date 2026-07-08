package com.hireinsight.bi;

import com.hireinsight.model.*;
import com.hireinsight.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BiServiceTest {

    @Mock
    private CandidateRepository candidateRepository;
    @Mock
    private JobRepository jobRepository;
    @Mock
    private PipelineStageRepository pipelineStageRepository;
    @Mock
    private InterviewFeedbackRepository interviewFeedbackRepository;
    @Mock
    private EventRepository eventRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private DemandRepository demandRepository;
    @Mock
    private OfferRecordRepository offerRecordRepository;
    @Mock
    private UploadBatchRepository uploadBatchRepository;
    @Mock
    private InterviewAssignmentRepository interviewAssignmentRepository;

    private BiService biService;
    private Long hrId = 1L;

    @BeforeEach
    void setUp() {
        biService = new BiService(
                candidateRepository, jobRepository,
                pipelineStageRepository, interviewFeedbackRepository,
                eventRepository, userRepository,
                demandRepository, offerRecordRepository,
                uploadBatchRepository, interviewAssignmentRepository
        );
    }

    // ==================== Funnel Tests ====================

    @Test
    void funnelReturnsExpectedMetrics() {
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").parseStatus("success").build();
        Candidate c2 = Candidate.builder().id(2L).ownerHrId(hrId).resumeJson("{}").parseStatus("success").build();

        when(candidateRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of(c1, c2));

        PipelineStage ps1 = PipelineStage.builder().candidateId(1L).jobId(10L).stage("interview").ts(Instant.now()).build();
        PipelineStage ps2 = PipelineStage.builder().candidateId(2L).jobId(10L).stage("onboarded").ts(Instant.now()).build();

        when(pipelineStageRepository.findByCandidateIdIn(anyList()))
                .thenReturn(List.of(ps1, ps2));

        Map<String, Object> result = biService.funnel(30, hrId, true);

        assertEquals(2L, result.get("resume_imported"));
        assertEquals(2L, result.get("resume_valid"));
        assertEquals(1L, result.get("hired_count"));
        assertTrue((Double) result.get("conversion_rate") > 0);
    }

    @Test
    void funnelRecruiterScopeFiltersByOwner() {
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").build();

        when(candidateRepository.findByCreatedAtAfterAndOwnerHrId(any(Instant.class), eq(hrId)))
                .thenReturn(List.of(c1));

        when(pipelineStageRepository.findByCandidateIdIn(anyList()))
                .thenReturn(List.of());

        Map<String, Object> result = biService.funnel(30, hrId, false);

        assertEquals(1L, result.get("resume_imported"));
        assertEquals(0L, result.get("hired_count"));
    }

    // ==================== Channel Quality Tests ====================

    @Test
    void channelQualityReturnsChannels() {
        Long batchId = 100L;
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).batchId(batchId).resumeJson("{}").build();

        when(candidateRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of(c1));

        UploadBatch batch = UploadBatch.builder().id(batchId).channel("BOSS直聘").build();
        when(uploadBatchRepository.findAllById(anyList()))
                .thenReturn(List.of(batch));

        when(pipelineStageRepository.findByCandidateIdIn(anyList()))
                .thenReturn(List.of());

        Map<String, Object> result = biService.channelQuality(30, hrId, true);

        assertEquals(1, result.get("total_candidates"));
        List<Map<String, Object>> channels = (List<Map<String, Object>>) result.get("channels");
        assertFalse(channels.isEmpty());
        assertEquals("BOSS直聘", channels.get(0).get("channel"));
    }

    @Test
    void channelQualityAssignsOtherForNullBatch() {
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").build();

        when(candidateRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of(c1));

        when(pipelineStageRepository.findByCandidateIdIn(anyList()))
                .thenReturn(List.of());

        Map<String, Object> result = biService.channelQuality(30, hrId, true);

        assertEquals(1, result.get("total_candidates"));
    }

    // ==================== Interview Accountability Tests ====================

    @Test
    void interviewAccountabilityReturnsMetrics() {
        InterviewAssignment assignment = InterviewAssignment.builder()
                .id(1L).interviewerId(hrId).round(1)
                .scheduledAt(LocalDateTime.now().minusHours(2))
                .status("SCHEDULED")
                .createdAt(Instant.now())
                .build();

        when(interviewAssignmentRepository.findAll())
                .thenReturn(List.of(assignment));

        InterviewFeedback feedback = InterviewFeedback.builder()
                .id(1L).candidateId(1L).jobId(10L)
                .interviewerId(hrId).passRecommended(true)
                .createdAt(Instant.now())
                .build();

        when(interviewFeedbackRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of(feedback));

        Map<String, Object> result = biService.interviewAccountability(30, hrId, true);

        assertTrue((Long) result.get("total_scheduled") >= 1);
        assertTrue((Long) result.get("feedback_submitted") >= 1);
        assertTrue((Double) result.get("feedback_rate") > 0);
        assertTrue((Long) result.get("pass_count") >= 1);
    }

    @Test
    void interviewAccountabilityRecruiterScope() {
        InterviewAssignment assignment = InterviewAssignment.builder()
                .id(1L).interviewerId(hrId).round(1)
                .scheduledAt(LocalDateTime.now().minusHours(2))
                .status("SCHEDULED")
                .createdAt(Instant.now())
                .build();

        when(interviewAssignmentRepository.findAll())
                .thenReturn(List.of(assignment));

        when(interviewFeedbackRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of());

        Map<String, Object> result = biService.interviewAccountability(30, hrId, false);

        assertTrue((Long) result.get("total_scheduled") >= 1);
        assertEquals(0L, result.get("feedback_submitted"));
    }

    // ==================== Manager Alerts Tests ====================

    @Test
    void managerAlertsReturnsSections() {
        Job oldJob = Job.builder().id(10L).title("Old Job").ownerHrId(hrId).status("active")
                .createdAt(Instant.now().minusSeconds(40 * 86400)).build();

        when(jobRepository.findAll()).thenReturn(List.of(oldJob));
        when(demandRepository.findAll()).thenReturn(List.of());

        when(pipelineStageRepository.findByJobIdIn(anyList()))
                .thenReturn(List.of());

        Map<String, Object> result = biService.managerAlerts(90, hrId, true);

        assertNotNull(result.get("jobs_overdue"));
        assertNotNull(result.get("demands_unfilled"));
        assertNotNull(result.get("candidates_stalled"));
        assertNotNull(result.get("risk_flagged_demands"));
    }

    @Test
    void managerAlertsRecruiterScope() {
        Job oldJob = Job.builder().id(10L).title("Old Job").ownerHrId(hrId).status("active")
                .createdAt(Instant.now().minusSeconds(40 * 86400)).build();

        when(jobRepository.findByOwnerHrId(hrId)).thenReturn(List.of(oldJob));
        when(demandRepository.findByOwnerHrId(hrId)).thenReturn(List.of());
        when(pipelineStageRepository.findByJobIdIn(anyList())).thenReturn(List.of());

        Map<String, Object> result = biService.managerAlerts(90, hrId, false);

        assertTrue((Integer) result.get("jobs_overdue_count") >= 0);
    }

    // ==================== Demand Health Tests ====================

    @Test
    void demandHealthReturnsMetrics() {
        RecruitmentDemand d1 = RecruitmentDemand.builder()
                .id(1L).ownerHrId(hrId).requestNo("DEM-001")
                .department("技术部").hiringManagerName("经理")
                .headcount(3).status("open").priority("high")
                .jobId(10L)
                .build();

        when(demandRepository.findAll()).thenReturn(List.of(d1));
        when(pipelineStageRepository.findByJobIdIn(anyList())).thenReturn(List.of());

        Map<String, Object> result = biService.demandHealth(30, hrId, true);

        assertEquals(3, result.get("total_headcount"));
        assertEquals(1L, result.get("active_demands"));
        assertEquals(0L, result.get("closed_demands"));
    }

    @Test
    void demandHealthRecruiterScope() {
        RecruitmentDemand d1 = RecruitmentDemand.builder()
                .id(1L).ownerHrId(hrId).requestNo("DEM-001")
                .department("技术部").hiringManagerName("经理")
                .headcount(1).status("open").priority("medium")
                .build();

        when(demandRepository.findByOwnerHrId(hrId)).thenReturn(List.of(d1));

        Map<String, Object> result = biService.demandHealth(30, hrId, false);

        assertEquals(1, result.get("total_headcount"));
        assertEquals(1L, result.get("active_demands"));
    }

    // ==================== Resume Consumption Tests ====================

    @Test
    void resumeConsumptionReturnsMetrics() {
        Event download = Event.builder().actorId(hrId).action("resume.downloaded").ts(Instant.now()).build();
        Event view = Event.builder().actorId(hrId).action("resume.viewed").ts(Instant.now()).build();

        when(eventRepository.findByActionAndTsAfter(eq("resume.downloaded"), any(Instant.class)))
                .thenReturn(List.of(download));
        when(eventRepository.findByActionAndTsAfter(eq("resume.viewed"), any(Instant.class)))
                .thenReturn(List.of(view));
        when(eventRepository.findByActionAndTsAfter(eq("resume.matched"), any(Instant.class)))
                .thenReturn(List.of());

        when(userRepository.findById(eq(hrId)))
                .thenReturn(Optional.of(User.builder().id(hrId).name("张三").build()));

        Map<String, Object> result = biService.resumeConsumption(30, hrId, true);

        assertEquals(1L, result.get("total_downloads"));
        assertEquals(1L, result.get("total_views"));
        assertEquals(0L, result.get("total_matches"));
        assertFalse(((List<?>) result.get("by_user")).isEmpty());
    }

    @Test
    void resumeConsumptionRecruiterScope() {
        Event download = Event.builder().actorId(hrId).action("resume.downloaded").ts(Instant.now()).build();

        when(eventRepository.findByActionAndTsAfter(eq("resume.downloaded"), any(Instant.class)))
                .thenReturn(List.of(download));
        when(eventRepository.findByActionAndTsAfter(eq("resume.viewed"), any(Instant.class)))
                .thenReturn(List.of());
        when(eventRepository.findByActionAndTsAfter(eq("resume.matched"), any(Instant.class)))
                .thenReturn(List.of());

        Map<String, Object> result = biService.resumeConsumption(30, hrId, false);

        assertEquals(1L, result.get("total_downloads"));
    }

    // ==================== Data Quality Tests ====================

    @Test
    void dataQualityReturnsMetrics() {
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").parseStatus("success").nameMasked("张三").build();
        Candidate c2 = Candidate.builder().id(2L).ownerHrId(hrId).resumeJson(null).parseStatus("pending").nameMasked("").build();

        when(candidateRepository.findByCreatedAtAfter(any(Instant.class)))
                .thenReturn(List.of(c1, c2));

        when(interviewAssignmentRepository.findAll()).thenReturn(List.of());
        when(interviewFeedbackRepository.findByCreatedAtAfter(any(Instant.class))).thenReturn(List.of());

        Map<String, Object> result = biService.dataQuality(30, hrId, true);

        assertEquals(2L, result.get("total_candidates"));
        assertEquals(1L, result.get("candidates_without_resume"));
        assertTrue((Double) result.get("parse_success_rate") > 0);
    }

    @Test
    void dataQualityRecruiterScope() {
        Candidate c1 = Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").parseStatus("success").nameMasked("张三").build();

        when(candidateRepository.findByCreatedAtAfterAndOwnerHrId(any(Instant.class), eq(hrId)))
                .thenReturn(List.of(c1));

        when(interviewAssignmentRepository.findAll()).thenReturn(List.of());
        when(interviewFeedbackRepository.findByCreatedAtAfter(any(Instant.class))).thenReturn(List.of());

        Map<String, Object> result = biService.dataQuality(30, hrId, false);

        assertEquals(1L, result.get("total_candidates"));
        assertEquals(0L, result.get("candidates_without_resume"));
    }

    // ==================== Staff Analytics Tests (existing) ====================

    @Test
    void staffAnalyticsReturnsStaffData() {
        User staff = User.builder().id(hrId).name("张三").role("recruiter").build();

        when(userRepository.findById(hrId)).thenReturn(Optional.of(staff));
        when(candidateRepository.countByOwnerHrId(hrId)).thenReturn(2L);
        when(jobRepository.countByOwnerHrIdAndStatus(hrId, "active")).thenReturn(1L);
        when(candidateRepository.findByOwnerHrId(hrId)).thenReturn(List.of(
                Candidate.builder().id(1L).ownerHrId(hrId).resumeJson("{}").build(),
                Candidate.builder().id(2L).ownerHrId(hrId).resumeJson("{}").build()
        ));

        when(pipelineStageRepository.findByCandidateIdIn(anyList())).thenReturn(List.of(
                PipelineStage.builder().candidateId(1L).jobId(10L).stage("interview").ts(Instant.now()).build(),
                PipelineStage.builder().candidateId(2L).jobId(10L).stage("onboarded").ts(Instant.now()).build()
        ));

        when(interviewFeedbackRepository.findByInterviewerId(hrId)).thenReturn(List.of(
                InterviewFeedback.builder().candidateId(1L).jobId(10L).interviewerId(hrId).passRecommended(true).build()
        ));

        when(eventRepository.findTop10ByActorIdOrderByTsDesc(hrId)).thenReturn(List.of());

        Map<String, Object> result = biService.staffAnalytics(hrId);

        assertEquals(hrId, result.get("staffId"));
        assertEquals("张三", result.get("staffName"));
        assertEquals("recruiter", result.get("staffRole"));
        Map<String, Object> overview = (Map<String, Object>) result.get("overview");
        assertEquals(2L, overview.get("totalCandidates"));
        assertEquals(1L, overview.get("activeJobs"));
    }

    @Test
    void staffAnalyticsThrowsForInvalidId() {
        when(userRepository.findById(99999L)).thenReturn(Optional.empty());

        assertThrows(NoSuchElementException.class, () -> biService.staffAnalytics(99999L));
    }
}
