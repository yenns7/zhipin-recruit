package com.hireinsight.bi;

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
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class BiService {

    private final CandidateRepository candidateRepository;
    private final JobRepository jobRepository;
    private final PipelineStageRepository pipelineStageRepository;
    private final InterviewFeedbackRepository interviewFeedbackRepository;
    private final EventRepository eventRepository;
    private final UserRepository userRepository;

    public BiService(CandidateRepository candidateRepository,
                     JobRepository jobRepository,
                     PipelineStageRepository pipelineStageRepository,
                     InterviewFeedbackRepository interviewFeedbackRepository,
                     EventRepository eventRepository,
                     UserRepository userRepository) {
        this.candidateRepository = candidateRepository;
        this.jobRepository = jobRepository;
        this.pipelineStageRepository = pipelineStageRepository;
        this.interviewFeedbackRepository = interviewFeedbackRepository;
        this.eventRepository = eventRepository;
        this.userRepository = userRepository;
    }

    private static final List<String> STAGE_ORDER = List.of(
            "pending", "ai_screen", "business_review", "interview", "offer", "onboarded", "rejected"
    );

    public Map<String, Object> staffAnalytics(Long hrId) {
        User user = userRepository.findById(hrId)
                .orElseThrow(() -> new NoSuchElementException("Staff not found: " + hrId));

        // --- overview ---
        long totalCandidates = candidateRepository.countByOwnerHrId(hrId);
        long activeJobs = jobRepository.countByOwnerHrIdAndStatus(hrId, "active");

        List<Candidate> candidates = candidateRepository.findByOwnerHrId(hrId);
        List<Long> candidateIds = candidates.stream().map(Candidate::getId).toList();

        // pipeline breakdown per candidate (latest stage)
        List<PipelineStage> allStages = candidateIds.isEmpty()
                ? List.of()
                : pipelineStageRepository.findByCandidateIdIn(candidateIds);

        Map<Long, PipelineStage> latestPerCandidate = allStages.stream()
                .collect(Collectors.toMap(
                        PipelineStage::getCandidateId,
                        Function.identity(),
                        (s1, s2) -> s1.getTs() != null && s2.getTs() != null && s1.getTs().isAfter(s2.getTs()) ? s1 : s2
                ));

        Map<String, Long> pipelineBreakdown = new LinkedHashMap<>();
        for (String stage : STAGE_ORDER) {
            long count = latestPerCandidate.values().stream()
                    .filter(ps -> stage.equals(ps.getStage()))
                    .count();
            if (count > 0) {
                pipelineBreakdown.put(stage, count);
            }
        }

        long pipelineTotal = latestPerCandidate.size();

        // interviews completed
        List<InterviewFeedback> feedbacks = interviewFeedbackRepository.findByInterviewerId(hrId);
        long interviewsCompleted = feedbacks.size();

        // offers / onboarded from pipeline breakdown
        long offersSent = pipelineBreakdown.getOrDefault("offer", 0L);
        long onboarded = pipelineBreakdown.getOrDefault("onboarded", 0L);

        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("totalCandidates", totalCandidates);
        overview.put("activeJobs", activeJobs);
        overview.put("pipelineTotal", pipelineTotal);
        overview.put("interviewsCompleted", interviewsCompleted);
        overview.put("offersSent", offersSent);
        overview.put("onboarded", onboarded);

        // --- conversion rates ---
        Map<String, Double> conversionRates = new LinkedHashMap<>();
        double screenCount = pipelineBreakdown.getOrDefault("ai_screen", 0L)
                + pipelineBreakdown.getOrDefault("business_review", 0L)
                + pipelineBreakdown.getOrDefault("interview", 0L)
                + pipelineBreakdown.getOrDefault("offer", 0L)
                + pipelineBreakdown.getOrDefault("onboarded", 0L);
        double interviewCount = pipelineBreakdown.getOrDefault("interview", 0L)
                + pipelineBreakdown.getOrDefault("offer", 0L)
                + pipelineBreakdown.getOrDefault("onboarded", 0L);
        double offerCount = pipelineBreakdown.getOrDefault("offer", 0L)
                + pipelineBreakdown.getOrDefault("onboarded", 0L);

        conversionRates.put("screenToInterview", screenCount > 0 ? Math.round(interviewCount / screenCount * 100.0) / 100.0 : 0.0);
        conversionRates.put("interviewToOffer", interviewCount > 0 ? Math.round(offerCount / interviewCount * 100.0) / 100.0 : 0.0);
        conversionRates.put("offerToOnboard", offerCount > 0 ? Math.round((double) onboarded / offerCount * 100.0) / 100.0 : 0.0);

        // --- recent activity ---
        List<Event> recentEvents = eventRepository.findTop10ByActorIdOrderByTsDesc(hrId);
        List<Map<String, Object>> recentActivity = recentEvents.stream().map(e -> {
            Map<String, Object> activity = new LinkedHashMap<>();
            activity.put("action", e.getAction());
            activity.put("ts", e.getTs() != null ? e.getTs().toString() : null);
            // Try to find candidate name from entityId if entityType is "candidate"
            if ("candidate".equals(e.getEntityType()) && e.getEntityId() != null) {
                candidateRepository.findById(e.getEntityId())
                        .ifPresent(c -> activity.put("candidateName", c.getNameMasked()));
            }
            return activity;
        }).toList();

        // --- build result ---
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("staffId", hrId);
        result.put("staffName", user.getName());
        result.put("staffRole", user.getRole());
        result.put("overview", overview);
        result.put("pipelineBreakdown", pipelineBreakdown);
        result.put("conversionRates", conversionRates);
        result.put("recentActivity", recentActivity);

        return result;
    }

    public Map<String, Object> jobFunnel(Long jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new NoSuchElementException("Job not found: " + jobId));

        // --- funnel ---
        List<PipelineStage> stages = pipelineStageRepository.findByJobIdOrderByTsDesc(jobId);
        // Get latest stage per candidate for this job
        Map<Long, PipelineStage> latestPerCandidate = stages.stream()
                .collect(Collectors.toMap(
                        PipelineStage::getCandidateId,
                        Function.identity(),
                        (s1, s2) -> s1.getTs() != null && s2.getTs() != null && s1.getTs().isAfter(s2.getTs()) ? s1 : s2
                ));

        Map<String, Long> funnel = new LinkedHashMap<>();
        for (String stage : STAGE_ORDER) {
            long count = latestPerCandidate.values().stream()
                    .filter(ps -> stage.equals(ps.getStage()))
                    .count();
            if (count > 0) {
                funnel.put(stage, count);
            }
        }

        // --- conversion rates ---
        Map<String, Double> conversionRates = new LinkedHashMap<>();
        double pendingCount = funnel.getOrDefault("pending", 0L);
        double screenCount = funnel.getOrDefault("ai_screen", 0L);
        double reviewCount = funnel.getOrDefault("business_review", 0L);
        double interviewCount = funnel.getOrDefault("interview", 0L);
        double offerCount = funnel.getOrDefault("offer", 0L);
        double onboardedCount = funnel.getOrDefault("onboarded", 0L);

        double reachedScreen = screenCount + reviewCount + interviewCount + offerCount + onboardedCount;
        double reachedReview = reviewCount + interviewCount + offerCount + onboardedCount;
        double reachedInterview = interviewCount + offerCount + onboardedCount;
        double reachedOffer = offerCount + onboardedCount;

        double totalInFunnel = pendingCount + reachedScreen;
        conversionRates.put("applyToScreen", totalInFunnel > 0 ? Math.round(reachedScreen / totalInFunnel * 100.0) / 100.0 : 0.0);
        conversionRates.put("screenToReview", reachedScreen > 0 ? Math.round(reachedReview / reachedScreen * 100.0) / 100.0 : 0.0);
        conversionRates.put("reviewToInterview", reachedReview > 0 ? Math.round(reachedInterview / reachedReview * 100.0) / 100.0 : 0.0);
        conversionRates.put("interviewToOffer", reachedInterview > 0 ? Math.round(reachedOffer / reachedInterview * 100.0) / 100.0 : 0.0);
        conversionRates.put("offerToOnboard", reachedOffer > 0 ? Math.round(onboardedCount / reachedOffer * 100.0) / 100.0 : 0.0);

        // --- interview stats ---
        List<InterviewFeedback> feedbacks = interviewFeedbackRepository.findByJobId(jobId);
        long totalInterviews = feedbacks.size();
        double avgScore = feedbacks.stream()
                .filter(f -> f.getScore() != null)
                .mapToInt(InterviewFeedback::getScore)
                .average()
                .orElse(0.0);
        avgScore = Math.round(avgScore * 100.0) / 100.0;
        long passed = feedbacks.stream()
                .filter(f -> Boolean.TRUE.equals(f.getPassRecommended()))
                .count();
        double passRate = totalInterviews > 0 ? Math.round((double) passed / totalInterviews * 100.0) / 100.0 : 0.0;

        Map<String, Object> interviewStats = new LinkedHashMap<>();
        interviewStats.put("total", totalInterviews);
        interviewStats.put("avgScore", avgScore);
        interviewStats.put("passRate", passRate);

        // --- sourcing breakdown (not available in data model) ---
        Map<String, Object> sourcingBreakdown = new LinkedHashMap<>();

        // --- build result ---
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("jobId", jobId);
        result.put("jobTitle", job.getTitle());
        result.put("funnel", funnel);
        result.put("conversionRates", conversionRates);
        result.put("interviewStats", interviewStats);
        result.put("sourcingBreakdown", sourcingBreakdown);

        return result;
    }
}
