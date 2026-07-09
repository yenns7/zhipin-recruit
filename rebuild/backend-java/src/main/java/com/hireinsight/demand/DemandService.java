package com.hireinsight.demand;

import com.hireinsight.demand.DemandResponse.DemandMetrics;
import com.hireinsight.model.Job;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.model.RecruitmentDemand;
import com.hireinsight.repository.DemandRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.PipelineStageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 招聘需求业务服务：将实体富化为前端需要的 DemandResponse。
 */
@Service
public class DemandService {

    private static final Logger log = LoggerFactory.getLogger(DemandService.class);

    private final DemandRepository demandRepository;
    private final JobRepository jobRepository;
    private final PipelineStageRepository pipelineStageRepository;

    public DemandService(DemandRepository demandRepository,
                         JobRepository jobRepository,
                         PipelineStageRepository pipelineStageRepository) {
        this.demandRepository = demandRepository;
        this.jobRepository = jobRepository;
        this.pipelineStageRepository = pipelineStageRepository;
    }

    /**
     * 查询需求列表并富化为前端响应。
     */
    public List<DemandResponse> listDemands(Long userId, boolean isAdmin, String status) {
        List<RecruitmentDemand> entities;
        if (isAdmin) {
            if (status != null && !status.isBlank()) {
                entities = demandRepository.findByStatus(status);
            } else {
                entities = demandRepository.findAll();
            }
        } else {
            entities = demandRepository.findByOwnerHrId(userId);
            if (status != null && !status.isBlank()) {
                entities = entities.stream()
                        .filter(d -> status.equals(d.getStatus()))
                        .toList();
            }
        }
        return enrich(entities);
    }

    /**
     * 查询单条需求并富化。
     */
    public DemandResponse getDemand(Long demandId) {
        RecruitmentDemand entity = demandRepository.findById(demandId)
                .orElseThrow(() -> new IllegalArgumentException("需求不存在: " + demandId));
        return toResponse(entity, resolveJobTitle(entity.getJobId()), computeMetrics(entity.getJobId()), computeRiskFlags(entity));
    }

    // ===== 批量富化 =====

    private List<DemandResponse> enrich(List<RecruitmentDemand> entities) {
        if (entities.isEmpty()) return List.of();

        // 批量解析 jobId -> jobTitle
        Set<Long> jobIds = entities.stream()
                .map(RecruitmentDemand::getJobId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> jobTitles = new HashMap<>();
        if (!jobIds.isEmpty()) {
            List<Job> jobs = jobRepository.findAllById(jobIds);
            for (Job job : jobs) {
                jobTitles.put(job.getId(), job.getTitle());
            }
        }

        // 批量查询 pipeline 数据（按 jobId）
        Map<Long, List<PipelineStage>> stagesByJob = new HashMap<>();
        if (!jobIds.isEmpty()) {
            List<PipelineStage> allStages = pipelineStageRepository.findByJobIdIn(new ArrayList<>(jobIds));
            for (PipelineStage stage : allStages) {
                stagesByJob.computeIfAbsent(stage.getJobId(), k -> new ArrayList<>()).add(stage);
            }
        }

        List<DemandResponse> results = new ArrayList<>();
        for (RecruitmentDemand entity : entities) {
            Long jobId = entity.getJobId();
            String title = jobId != null ? jobTitles.getOrDefault(jobId, "") : "";
            List<PipelineStage> jobStages = jobId != null ? stagesByJob.getOrDefault(jobId, List.of()) : List.of();
            DemandMetrics metrics = computeMetrics(jobStages);
            List<String> riskFlags = computeRiskFlags(entity, metrics);
            results.add(toResponse(entity, title, metrics, riskFlags));
        }
        return results;
    }

    // ===== 映射 =====

    private DemandResponse toResponse(RecruitmentDemand entity, String jobTitle,
                                       DemandMetrics metrics, List<String> riskFlags) {
        DemandResponse resp = new DemandResponse();
        resp.setId(entity.getId());
        resp.setJobId(entity.getJobId());
        resp.setJobTitle(jobTitle);
        resp.setJobCity("");
        resp.setJobDepartment("");
        resp.setJobCode("");
        resp.setOwnerHrId(entity.getOwnerHrId());
        resp.setRequestNo(entity.getRequestNo());
        resp.setRequesterName(entity.getRequesterName());
        resp.setRequesterDepartment(entity.getDepartment());
        resp.setHiringManagerName(entity.getHiringManagerName());
        resp.setRequestedAt(entity.getRequestedAt());
        resp.setAcceptedAt(entity.getAcceptedAt());
        resp.setTargetDate(entity.getTargetDate());
        resp.setPriority(entity.getPriority());
        resp.setHeadcount(entity.getHeadcount());
        resp.setStatus(entity.getStatus());
        resp.setCloseReason(entity.getCloseReason());
        resp.setDowngradeReason(entity.getDowngradeReason());
        resp.setNote(entity.getNote());
        resp.setMetrics(metrics);
        resp.setRiskFlags(riskFlags);
        resp.setCreatedAt(entity.getCreatedAt());
        resp.setUpdatedAt(entity.getUpdatedAt());
        return resp;
    }

    // ===== metrics 计算 =====

    private DemandMetrics computeMetrics(List<PipelineStage> stages) {
        // 每个 candidateId 取最新 stage
        Map<Long, String> latestStage = new HashMap<>();
        for (PipelineStage s : stages) {
            latestStage.merge(s.getCandidateId(), s.getStage(),
                    (oldStage, newStage) -> {
                        // 按 ts 取最新
                        return (s.getTs() != null) ? newStage : oldStage;
                    });
        }

        int recommended = 0, businessReview = 0, interview = 0, offer = 0, onboarded = 0;
        Map<String, Integer> stageCounts = new LinkedHashMap<>();

        for (String stage : latestStage.values()) {
            stageCounts.merge(stage, 1, Integer::sum);
            switch (stage) {
                case "pending":
                case "ai_screen":
                    recommended++;
                    break;
                case "business_review":
                    businessReview++;
                    break;
                case "interview":
                    interview++;
                    break;
                case "offer":
                    offer++;
                    break;
                case "onboarded":
                    onboarded++;
                    break;
                default:
                    break;
            }
        }

        return new DemandMetrics(recommended, businessReview, interview, offer, onboarded, stageCounts);
    }

    private DemandMetrics computeMetrics(Long jobId) {
        if (jobId == null) {
            return new DemandMetrics(0, 0, 0, 0, 0, Map.of());
        }
        List<PipelineStage> stages = pipelineStageRepository.findByJobIdIn(List.of(jobId));
        return computeMetrics(stages);
    }

    // ===== riskFlags 计算 =====

    private List<String> computeRiskFlags(RecruitmentDemand entity) {
        DemandMetrics metrics = computeMetrics(entity.getJobId());
        return computeRiskFlags(entity, metrics);
    }

    private List<String> computeRiskFlags(RecruitmentDemand entity, DemandMetrics metrics) {
        List<String> flags = new ArrayList<>();
        Instant now = Instant.now();

        // 超期：超过 targetDate
        if (entity.getTargetDate() != null) {
            Instant deadline = entity.getTargetDate().atStartOfDay(java.time.ZoneId.of("Asia/Shanghai"))
                    .toInstant();
            if (now.isAfter(deadline)) {
                flags.add("overdue");
            }
        }

        // 业务待反馈：business_review 有人
        if (metrics.getBusinessReviewCount() > 0) {
            flags.add("business_feedback_pending");
        }

        // HR 暂无推荐：接手超过 7 天且推荐为 0
        if (entity.getAcceptedAt() != null && ChronoUnit.DAYS.between(entity.getAcceptedAt(), now) > 7
                && metrics.getRecommendedCount() == 0) {
            flags.add("hr_no_recommendation");
        }

        // 推荐多但面试少：推荐超过 3 但面试为 0
        if (metrics.getRecommendedCount() > 3 && metrics.getInterviewCount() == 0) {
            flags.add("low_interview_conversion");
        }

        // 开放过久：从 requestedAt 超过 30 天
        if (entity.getRequestedAt() != null && ChronoUnit.DAYS.between(entity.getRequestedAt(), now) > 30) {
            flags.add("open_too_long");
        }

        return flags;
    }

    // ===== jobTitle 解析 =====

    private String resolveJobTitle(Long jobId) {
        if (jobId == null) return "";
        return jobRepository.findById(jobId)
                .map(Job::getTitle)
                .orElse("");
    }
}
