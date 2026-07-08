package com.hireinsight.bi;

import com.hireinsight.model.*;
import com.hireinsight.repository.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
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
    private final DemandRepository demandRepository;
    private final OfferRecordRepository offerRecordRepository;
    private final UploadBatchRepository uploadBatchRepository;
    private final InterviewAssignmentRepository interviewAssignmentRepository;

    public BiService(CandidateRepository candidateRepository,
                     JobRepository jobRepository,
                     PipelineStageRepository pipelineStageRepository,
                     InterviewFeedbackRepository interviewFeedbackRepository,
                     EventRepository eventRepository,
                     UserRepository userRepository,
                     DemandRepository demandRepository,
                     OfferRecordRepository offerRecordRepository,
                     UploadBatchRepository uploadBatchRepository,
                     InterviewAssignmentRepository interviewAssignmentRepository) {
        this.candidateRepository = candidateRepository;
        this.jobRepository = jobRepository;
        this.pipelineStageRepository = pipelineStageRepository;
        this.interviewFeedbackRepository = interviewFeedbackRepository;
        this.eventRepository = eventRepository;
        this.userRepository = userRepository;
        this.demandRepository = demandRepository;
        this.offerRecordRepository = offerRecordRepository;
        this.uploadBatchRepository = uploadBatchRepository;
        this.interviewAssignmentRepository = interviewAssignmentRepository;
    }

    private static final List<String> STAGE_ORDER = List.of(
            "pending", "ai_screen", "business_review", "interview", "offer", "onboarded", "rejected"
    );

    // ==================== Helper ====================

    private Instant cutoff(int days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    private boolean isAdminOrManager(Collection<?> authorities) {
        return authorities.stream()
                .map(Object::toString)
                .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_MANAGER"));
    }

    private Map<String, Long> buildPipelineBreakdown(List<PipelineStage> allStages) {
        Map<Long, PipelineStage> latestPerCandidate = allStages.stream()
                .collect(Collectors.toMap(
                        PipelineStage::getCandidateId,
                        Function.identity(),
                        (s1, s2) -> s1.getTs() != null && s2.getTs() != null && s1.getTs().isAfter(s2.getTs()) ? s1 : s2
                ));
        Map<String, Long> breakdown = new LinkedHashMap<>();
        for (String stage : STAGE_ORDER) {
            long count = latestPerCandidate.values().stream()
                    .filter(ps -> stage.equals(ps.getStage()))
                    .count();
            if (count > 0) {
                breakdown.put(stage, count);
            }
        }
        return breakdown;
    }

    // ==================== 1. Funnel ====================

    public Map<String, Object> funnel(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);
        List<Candidate> candidates;
        if (adminOrManager) {
            candidates = candidateRepository.findByCreatedAtAfter(since);
        } else {
            candidates = candidateRepository.findByCreatedAtAfterAndOwnerHrId(since, userId);
        }

        long totalCandidates = candidates.size();

        // Distinct jobs referenced by these candidates' pipeline stages
        List<Long> candidateIds = candidates.stream().map(Candidate::getId).toList();
        List<PipelineStage> stages = candidateIds.isEmpty()
                ? List.of()
                : pipelineStageRepository.findByCandidateIdIn(candidateIds);

        Map<String, Long> funnelBreakdown = buildPipelineBreakdown(stages);

        long resumeImported = totalCandidates;
        long resumeValid = candidates.stream()
                .filter(c -> c.getResumeJson() != null && !c.getResumeJson().isBlank())
                .count();
        long aiScreenPass = funnelBreakdown.getOrDefault("ai_screen", 0L)
                + funnelBreakdown.getOrDefault("business_review", 0L)
                + funnelBreakdown.getOrDefault("interview", 0L)
                + funnelBreakdown.getOrDefault("offer", 0L)
                + funnelBreakdown.getOrDefault("onboarded", 0L);
        long interviewPass = funnelBreakdown.getOrDefault("interview", 0L)
                + funnelBreakdown.getOrDefault("offer", 0L)
                + funnelBreakdown.getOrDefault("onboarded", 0L);
        long offerCount = funnelBreakdown.getOrDefault("offer", 0L)
                + funnelBreakdown.getOrDefault("onboarded", 0L);
        long hiredCount = funnelBreakdown.getOrDefault("onboarded", 0L);

        long jobCount = stages.stream()
                .map(PipelineStage::getJobId)
                .distinct()
                .count();

        double conversionRate = totalCandidates > 0
                ? Math.round((double) hiredCount / totalCandidates * 10000.0) / 100.0
                : 0.0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("job_count", jobCount);
        result.put("resume_imported", resumeImported);
        result.put("resume_valid", resumeValid);
        result.put("ai_screen_pass", aiScreenPass);
        result.put("interview_pass", interviewPass);
        result.put("offer_count", offerCount);
        result.put("hired_count", hiredCount);
        result.put("conversion_rate", conversionRate);
        result.put("pipeline_breakdown", funnelBreakdown);

        return result;
    }

    // ==================== 2. Channel Quality ====================

    public Map<String, Object> channelQuality(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);
        List<Candidate> candidates;
        if (adminOrManager) {
            candidates = candidateRepository.findByCreatedAtAfter(since);
        } else {
            candidates = candidateRepository.findByCreatedAtAfterAndOwnerHrId(since, userId);
        }

        // Link candidates to upload batches to get source channel
        List<Long> batchIds = candidates.stream()
                .map(Candidate::getBatchId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        Map<Long, UploadBatch> batchMap = batchIds.isEmpty()
                ? Map.of()
                : uploadBatchRepository.findAllById(batchIds).stream()
                        .collect(Collectors.toMap(UploadBatch::getId, Function.identity()));

        // Classify candidates by channel
        Map<String, List<Candidate>> byChannel = new LinkedHashMap<>();
        for (Candidate c : candidates) {
            String channel = "other";
            if (c.getBatchId() != null && batchMap.containsKey(c.getBatchId())) {
                String raw = batchMap.get(c.getBatchId()).getChannel();
                if (raw != null && !raw.isBlank()) {
                    channel = normalizeChannel(raw);
                }
            }
            byChannel.computeIfAbsent(channel, k -> new ArrayList<>()).add(c);
        }

        // Get pipeline stages for all these candidates
        List<Long> candidateIds = candidates.stream().map(Candidate::getId).toList();
        List<PipelineStage> allStages = candidateIds.isEmpty()
                ? List.of()
                : pipelineStageRepository.findByCandidateIdIn(candidateIds);

        Map<Long, PipelineStage> latestPerCandidate = allStages.stream()
                .collect(Collectors.toMap(
                        PipelineStage::getCandidateId,
                        Function.identity(),
                        (s1, s2) -> s1.getTs() != null && s2.getTs() != null && s1.getTs().isAfter(s2.getTs()) ? s1 : s2
                ));

        List<Map<String, Object>> channels = new ArrayList<>();
        for (Map.Entry<String, List<Candidate>> entry : byChannel.entrySet()) {
            String ch = entry.getKey();
            List<Candidate> chCandidates = entry.getValue();
            long chTotal = chCandidates.size();

            long chInterview = chCandidates.stream()
                    .filter(c -> {
                        PipelineStage ps = latestPerCandidate.get(c.getId());
                        if (ps == null) return false;
                        String stage = ps.getStage();
                        return stage.equals("interview") || stage.equals("offer") || stage.equals("onboarded");
                    })
                    .count();

            long chOffer = chCandidates.stream()
                    .filter(c -> {
                        PipelineStage ps = latestPerCandidate.get(c.getId());
                        if (ps == null) return false;
                        String stage = ps.getStage();
                        return stage.equals("offer") || stage.equals("onboarded");
                    })
                    .count();

            double interviewRate = chTotal > 0 ? Math.round((double) chInterview / chTotal * 10000.0) / 100.0 : 0.0;
            double offerRate = chTotal > 0 ? Math.round((double) chOffer / chTotal * 10000.0) / 100.0 : 0.0;

            Map<String, Object> chData = new LinkedHashMap<>();
            chData.put("channel", ch);
            chData.put("resume_count", chTotal);
            chData.put("interview_count", chInterview);
            chData.put("offer_count", chOffer);
            chData.put("interview_rate", interviewRate);
            chData.put("offer_rate", offerRate);
            channels.add(chData);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("channels", channels);
        result.put("total_candidates", candidates.size());
        return result;
    }

    private String normalizeChannel(String raw) {
        String s = raw.trim().toLowerCase();
        if (s.contains("boss") || s.equals("boss直聘")) return "BOSS直聘";
        if (s.contains("58") || s.contains("五八")) return "58同城";
        if (s.contains("猎聘")) return "猎聘";
        if (s.contains("鱼泡")) return "鱼泡直聘";
        if (s.contains("智联")) return "智联招聘";
        if (s.contains("前程") || s.contains("无忧")) return "前程无忧";
        if (s.contains("内推") || s.contains("内部推荐")) return "内推";
        if (s.contains("官网") || s.contains("官方")) return "官网";
        if (s.contains("领英") || s.contains("linkedin")) return "LinkedIn";
        return raw;
    }

    // ==================== 3. Interview Accountability ====================

    public Map<String, Object> interviewAccountability(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);

        List<InterviewAssignment> allAssignments;
        if (adminOrManager) {
            allAssignments = interviewAssignmentRepository.findAll().stream()
                    .filter(a -> a.getCreatedAt() != null && a.getCreatedAt().isAfter(since))
                    .toList();
        } else {
            allAssignments = interviewAssignmentRepository.findAll().stream()
                    .filter(a -> a.getInterviewerId() != null && a.getInterviewerId().equals(userId))
                    .filter(a -> a.getCreatedAt() != null && a.getCreatedAt().isAfter(since))
                    .toList();
        }

        long totalScheduled = allAssignments.size();

        // Get feedbacks within the time window
        List<InterviewFeedback> feedbacks = interviewFeedbackRepository.findByCreatedAtAfter(since);
        if (!adminOrManager) {
            feedbacks = feedbacks.stream()
                    .filter(f -> f.getInterviewerId() != null && f.getInterviewerId().equals(userId))
                    .toList();
        }

        long feedbackSubmitted = feedbacks.size();
        double feedbackRate = totalScheduled > 0
                ? Math.round((double) feedbackSubmitted / totalScheduled * 10000.0) / 100.0
                : 0.0;

        long passCount = feedbacks.stream()
                .filter(f -> Boolean.TRUE.equals(f.getPassRecommended()))
                .count();
        long rejectCount = feedbacks.stream()
                .filter(f -> Boolean.FALSE.equals(f.getPassRecommended()))
                .count();

        // Average response time: difference between assignment scheduled_at and feedback creation
        double avgResponseHours = 0.0;
        if (!feedbacks.isEmpty()) {
            double totalHours = 0;
            int count = 0;
            for (InterviewFeedback fb : feedbacks) {
                if (fb.getCreatedAt() == null) continue;
                // Find matching assignment
                List<InterviewAssignment> matching = allAssignments.stream()
                        .filter(a -> a.getInterviewerId() != null
                                && a.getInterviewerId().equals(fb.getInterviewerId())
                                && a.getScheduledAt() != null)
                        .toList();
                if (!matching.isEmpty()) {
                    InterviewAssignment assign = matching.get(0);
                    long hours = ChronoUnit.HOURS.between(assign.getScheduledAt(), fb.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDateTime());
                    totalHours += Math.abs(hours);
                    count++;
                }
            }
            avgResponseHours = count > 0 ? Math.round(totalHours / count * 100.0) / 100.0 : 0.0;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_scheduled", totalScheduled);
        result.put("feedback_submitted", feedbackSubmitted);
        result.put("feedback_rate", feedbackRate);
        result.put("pass_count", passCount);
        result.put("reject_count", rejectCount);
        result.put("avg_response_hours", avgResponseHours);
        result.put("pending_feedback", totalScheduled - feedbackSubmitted);

        return result;
    }

    // ==================== 4. Manager Alerts ====================

    public Map<String, Object> managerAlerts(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);

        List<Job> allJobs;
        List<RecruitmentDemand> allDemands;
        if (adminOrManager) {
            allJobs = jobRepository.findAll();
            allDemands = demandRepository.findAll();
        } else {
            allJobs = jobRepository.findByOwnerHrId(userId);
            allDemands = demandRepository.findByOwnerHrId(userId);
        }

        // Jobs overdue: active jobs created >30 days ago without any onboarded candidate
        List<Long> jobIds = allJobs.stream().map(Job::getId).toList();
        List<PipelineStage> allStages = jobIds.isEmpty()
                ? List.of()
                : pipelineStageRepository.findByJobIdIn(jobIds);

        Map<Long, List<PipelineStage>> stagesByJob = allStages.stream()
                .collect(Collectors.groupingBy(PipelineStage::getJobId));

        List<Map<String, Object>> overdueJobs = new ArrayList<>();
        for (Job job : allJobs) {
            if (!"active".equals(job.getStatus())) continue;
            if (job.getCreatedAt() == null) continue;
            long age = ChronoUnit.DAYS.between(job.getCreatedAt(), Instant.now());
            if (age < 30) continue;

            List<PipelineStage> jobStages = stagesByJob.getOrDefault(job.getId(), List.of());
            boolean hasOnboarded = jobStages.stream().anyMatch(ps -> "onboarded".equals(ps.getStage()));
            if (!hasOnboarded) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("job_id", job.getId());
                alert.put("title", job.getTitle());
                alert.put("days_open", age);
                overdueJobs.add(alert);
            }
        }

        // Demands unfilled: open demands past target_date
        List<Map<String, Object>> unfilledDemands = new ArrayList<>();
        for (RecruitmentDemand d : allDemands) {
            if (!"open".equals(d.getStatus())) continue;
            if (d.getTargetDate() != null && d.getTargetDate().isBefore(LocalDate.now())) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("demand_id", d.getId());
                alert.put("request_no", d.getRequestNo());
                alert.put("department", d.getDepartment());
                alert.put("headcount", d.getHeadcount());
                alert.put("target_date", d.getTargetDate().toString());
                unfilledDemands.add(alert);
            }
        }

        // Candidates stalled: >7 days without stage change
        List<Map<String, Object>> stalledCandidates = new ArrayList<>();
        Map<Long, PipelineStage> latestPerCandidate = allStages.stream()
                .collect(Collectors.toMap(
                        PipelineStage::getCandidateId,
                        Function.identity(),
                        (s1, s2) -> s1.getTs() != null && s2.getTs() != null && s1.getTs().isAfter(s2.getTs()) ? s1 : s2
                ));
        for (PipelineStage ps : latestPerCandidate.values()) {
            if (ps.getTs() == null) continue;
            if (ps.getStage().equals("onboarded") || ps.getStage().equals("rejected")) continue;
            long daysInStage = ChronoUnit.DAYS.between(ps.getTs(), Instant.now());
            if (daysInStage > 7) {
                candidateRepository.findById(ps.getCandidateId()).ifPresent(c -> {
                    Map<String, Object> alert = new LinkedHashMap<>();
                    alert.put("candidate_id", ps.getCandidateId());
                    alert.put("candidate_name", c.getNameMasked());
                    alert.put("stage", ps.getStage());
                    alert.put("days_in_stage", daysInStage);
                    stalledCandidates.add(alert);
                });
            }
        }

        // Risk-flagged demands: demands with priority high and still open past target
        List<Map<String, Object>> riskDemands = new ArrayList<>();
        for (RecruitmentDemand d : allDemands) {
            if (!"open".equals(d.getStatus())) continue;
            if ("high".equals(d.getPriority()) && d.getTargetDate() != null
                    && d.getTargetDate().isBefore(LocalDate.now().minusDays(7))) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("demand_id", d.getId());
                alert.put("request_no", d.getRequestNo());
                alert.put("department", d.getDepartment());
                alert.put("priority", d.getPriority());
                alert.put("days_overdue", ChronoUnit.DAYS.between(d.getTargetDate(), LocalDate.now()));
                riskDemands.add(alert);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("jobs_overdue_count", overdueJobs.size());
        result.put("jobs_overdue", overdueJobs);
        result.put("demands_unfilled_count", unfilledDemands.size());
        result.put("demands_unfilled", unfilledDemands);
        result.put("candidates_stalled_count", stalledCandidates.size());
        result.put("candidates_stalled", stalledCandidates);
        result.put("risk_flagged_demands_count", riskDemands.size());
        result.put("risk_flagged_demands", riskDemands);

        return result;
    }

    // ==================== 5. Demand Health ====================

    public Map<String, Object> demandHealth(int days, Long userId, boolean adminOrManager) {
        List<RecruitmentDemand> allDemands;
        if (adminOrManager) {
            allDemands = demandRepository.findAll();
        } else {
            allDemands = demandRepository.findByOwnerHrId(userId);
        }

        int totalHeadcount = allDemands.stream().mapToInt(d -> d.getHeadcount() != null ? d.getHeadcount() : 1).sum();
        long activeCount = allDemands.stream().filter(d -> "open".equals(d.getStatus())).count();
        long closedCount = allDemands.stream().filter(d -> "closed".equals(d.getStatus())).count();
        long riskCount = allDemands.stream()
                .filter(d -> "open".equals(d.getStatus())
                        && "high".equals(d.getPriority())
                        && d.getTargetDate() != null
                        && d.getTargetDate().isBefore(LocalDate.now()))
                .count();

        // Fill rate: active demands with at least one candidate in pipeline
        List<Long> demandJobIds = allDemands.stream()
                .map(RecruitmentDemand::getJobId)
                .filter(Objects::nonNull)
                .toList();
        List<PipelineStage> stages = demandJobIds.isEmpty()
                ? List.of()
                : pipelineStageRepository.findByJobIdIn(demandJobIds);

        Set<Long> jobsWithCandidates = stages.stream()
                .map(PipelineStage::getJobId)
                .collect(Collectors.toSet());

        double fillRate = demandJobIds.isEmpty() ? 0.0
                : Math.round((double) jobsWithCandidates.size() / demandJobIds.size() * 10000.0) / 100.0;

        // Active headcount (from open demands)
        long activeHeadcount = allDemands.stream()
                .filter(d -> "open".equals(d.getStatus()))
                .mapToInt(d -> d.getHeadcount() != null ? d.getHeadcount() : 1)
                .sum();

        // Filled headcount (from onboarded candidates in pipeline)
        long filledHeadcount = stages.stream()
                .filter(ps -> "onboarded".equals(ps.getStage()))
                .map(PipelineStage::getCandidateId)
                .distinct()
                .count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_headcount", totalHeadcount);
        result.put("active_demands", activeCount);
        result.put("active_headcount", activeHeadcount);
        result.put("closed_demands", closedCount);
        result.put("risk_flagged", riskCount);
        result.put("fill_rate", fillRate);
        result.put("filled_headcount", filledHeadcount);
        result.put("total_demands", allDemands.size());

        return result;
    }

    // ==================== 6. Resume Consumption ====================

    public Map<String, Object> resumeConsumption(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);

        List<Event> downloadEvents = eventRepository.findByActionAndTsAfter("resume.downloaded", since);
        List<Event> viewEvents = eventRepository.findByActionAndTsAfter("resume.viewed", since);
        List<Event> matchEvents = eventRepository.findByActionAndTsAfter("resume.matched", since);

        if (!adminOrManager) {
            downloadEvents = downloadEvents.stream()
                    .filter(e -> e.getActorId() != null && e.getActorId().equals(userId))
                    .toList();
            viewEvents = viewEvents.stream()
                    .filter(e -> e.getActorId() != null && e.getActorId().equals(userId))
                    .toList();
            matchEvents = matchEvents.stream()
                    .filter(e -> e.getActorId() != null && e.getActorId().equals(userId))
                    .toList();
        }

        long totalDownloads = downloadEvents.size();
        long totalViews = viewEvents.size();
        long totalMatches = matchEvents.size();

        // By-user breakdown
        Map<Long, Map<String, Long>> byUser = new LinkedHashMap<>();
        for (Event e : downloadEvents) {
            if (e.getActorId() == null) continue;
            byUser.computeIfAbsent(e.getActorId(), k -> new LinkedHashMap<>());
            byUser.get(e.getActorId()).merge("downloads", 1L, Long::sum);
        }
        for (Event e : viewEvents) {
            if (e.getActorId() == null) continue;
            byUser.computeIfAbsent(e.getActorId(), k -> new LinkedHashMap<>());
            byUser.get(e.getActorId()).merge("views", 1L, Long::sum);
        }
        for (Event e : matchEvents) {
            if (e.getActorId() == null) continue;
            byUser.computeIfAbsent(e.getActorId(), k -> new LinkedHashMap<>());
            byUser.get(e.getActorId()).merge("matches", 1L, Long::sum);
        }

        List<Map<String, Object>> userBreakdown = new ArrayList<>();
        for (Map.Entry<Long, Map<String, Long>> entry : byUser.entrySet()) {
            Map<String, Object> ub = new LinkedHashMap<>();
            ub.put("user_id", entry.getKey());
            userRepository.findById(entry.getKey()).ifPresent(u -> ub.put("user_name", u.getName()));
            ub.put("downloads", entry.getValue().getOrDefault("downloads", 0L));
            ub.put("views", entry.getValue().getOrDefault("views", 0L));
            ub.put("matches", entry.getValue().getOrDefault("matches", 0L));
            userBreakdown.add(ub);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_downloads", totalDownloads);
        result.put("total_views", totalViews);
        result.put("total_matches", totalMatches);
        result.put("by_user", userBreakdown);

        return result;
    }

    // ==================== 7. Data Quality ====================

    public Map<String, Object> dataQuality(int days, Long userId, boolean adminOrManager) {
        Instant since = cutoff(days);

        List<Candidate> candidates;
        if (adminOrManager) {
            candidates = candidateRepository.findByCreatedAtAfter(since);
        } else {
            candidates = candidateRepository.findByCreatedAtAfterAndOwnerHrId(since, userId);
        }

        long candidatesWithoutResume = candidates.stream()
                .filter(c -> c.getResumeJson() == null || c.getResumeJson().isBlank())
                .count();
        long totalCandidates = candidates.size();

        // Parse success rate
        long parseSuccess = candidates.stream()
                .filter(c -> "success".equals(c.getParseStatus()))
                .count();
        double parseSuccessRate = totalCandidates > 0
                ? Math.round((double) parseSuccess / totalCandidates * 10000.0) / 100.0
                : 0.0;

        // Interviews without feedback
        List<InterviewAssignment> assignments = interviewAssignmentRepository.findAll();
        List<InterviewFeedback> feedbacks = interviewFeedbackRepository.findByCreatedAtAfter(since);

        Set<String> feedbackKeySet = feedbacks.stream()
                .map(f -> f.getCandidateId() + ":" + f.getJobId())
                .collect(Collectors.toSet());

        long interviewsWithoutFeedback = assignments.stream()
                .filter(a -> a.getCreatedAt() != null && a.getCreatedAt().isAfter(since))
                .filter(a -> !feedbackKeySet.contains(a.getInterviewId() + ":" + a.getInterviewId()))
                .count();

        // Field completion rate: check required fields on candidates
        long completeFields = candidates.stream()
                .filter(c -> c.getNameMasked() != null && !c.getNameMasked().isBlank())
                .count();
        double fieldCompletionRate = totalCandidates > 0
                ? Math.round((double) completeFields / totalCandidates * 10000.0) / 100.0
                : 0.0;

        // Parse status breakdown
        Map<String, Long> parseStatusBreakdown = candidates.stream()
                .collect(Collectors.groupingBy(
                        c -> c.getParseStatus() != null ? c.getParseStatus() : "unknown",
                        Collectors.counting()
                ));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total_candidates", totalCandidates);
        result.put("candidates_without_resume", candidatesWithoutResume);
        result.put("candidates_with_resume_rate", totalCandidates > 0
                ? Math.round((double) (totalCandidates - candidatesWithoutResume) / totalCandidates * 10000.0) / 100.0
                : 0.0);
        result.put("interviews_without_feedback", interviewsWithoutFeedback);
        result.put("field_completion_rate", fieldCompletionRate);
        result.put("parse_success_rate", parseSuccessRate);
        result.put("parse_success_count", parseSuccess);
        result.put("parse_status_breakdown", parseStatusBreakdown);

        return result;
    }

    // ==================== Existing Methods ====================

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
