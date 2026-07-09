package com.hireinsight.demand;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 招聘需求响应 DTO，与前端 RecruitmentDemand 类型对齐。
 */
public class DemandResponse {

    private Long id;
    private Long jobId;
    private String jobTitle;
    private String jobCity;
    private String jobDepartment;
    private String jobCode;
    private Long ownerHrId;
    private String requestNo;
    private String requesterName;
    private String requesterDepartment;
    private String hiringManagerName;
    private Instant requestedAt;
    private Instant acceptedAt;
    private LocalDate targetDate;
    private String priority;
    private Integer headcount;
    private String status;
    private String closeReason;
    private String downgradeReason;
    private String note;
    private DemandMetrics metrics;
    private List<String> riskFlags;
    private Instant createdAt;
    private Instant updatedAt;

    public DemandResponse() {}

    // ---- Getters / Setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }

    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }

    public String getJobCity() { return jobCity; }
    public void setJobCity(String jobCity) { this.jobCity = jobCity; }

    public String getJobDepartment() { return jobDepartment; }
    public void setJobDepartment(String jobDepartment) { this.jobDepartment = jobDepartment; }

    public String getJobCode() { return jobCode; }
    public void setJobCode(String jobCode) { this.jobCode = jobCode; }

    public Long getOwnerHrId() { return ownerHrId; }
    public void setOwnerHrId(Long ownerHrId) { this.ownerHrId = ownerHrId; }

    public String getRequestNo() { return requestNo; }
    public void setRequestNo(String requestNo) { this.requestNo = requestNo; }

    public String getRequesterName() { return requesterName; }
    public void setRequesterName(String requesterName) { this.requesterName = requesterName; }

    public String getRequesterDepartment() { return requesterDepartment; }
    public void setRequesterDepartment(String requesterDepartment) { this.requesterDepartment = requesterDepartment; }

    public String getHiringManagerName() { return hiringManagerName; }
    public void setHiringManagerName(String hiringManagerName) { this.hiringManagerName = hiringManagerName; }

    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }

    public Instant getAcceptedAt() { return acceptedAt; }
    public void setAcceptedAt(Instant acceptedAt) { this.acceptedAt = acceptedAt; }

    public LocalDate getTargetDate() { return targetDate; }
    public void setTargetDate(LocalDate targetDate) { this.targetDate = targetDate; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public Integer getHeadcount() { return headcount; }
    public void setHeadcount(Integer headcount) { this.headcount = headcount; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCloseReason() { return closeReason; }
    public void setCloseReason(String closeReason) { this.closeReason = closeReason; }

    public String getDowngradeReason() { return downgradeReason; }
    public void setDowngradeReason(String downgradeReason) { this.downgradeReason = downgradeReason; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public DemandMetrics getMetrics() { return metrics; }
    public void setMetrics(DemandMetrics metrics) { this.metrics = metrics; }

    public List<String> getRiskFlags() { return riskFlags; }
    public void setRiskFlags(List<String> riskFlags) { this.riskFlags = riskFlags; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    // ---- 嵌套 metrics ----

    public static class DemandMetrics {
        private int recommendedCount;
        private int businessReviewCount;
        private int interviewCount;
        private int offerCount;
        private int onboardedCount;
        private Map<String, Integer> currentStageCounts;

        public DemandMetrics() {}

        public DemandMetrics(int recommendedCount, int businessReviewCount, int interviewCount,
                             int offerCount, int onboardedCount, Map<String, Integer> currentStageCounts) {
            this.recommendedCount = recommendedCount;
            this.businessReviewCount = businessReviewCount;
            this.interviewCount = interviewCount;
            this.offerCount = offerCount;
            this.onboardedCount = onboardedCount;
            this.currentStageCounts = currentStageCounts;
        }

        public int getRecommendedCount() { return recommendedCount; }
        public void setRecommendedCount(int recommendedCount) { this.recommendedCount = recommendedCount; }

        public int getBusinessReviewCount() { return businessReviewCount; }
        public void setBusinessReviewCount(int businessReviewCount) { this.businessReviewCount = businessReviewCount; }

        public int getInterviewCount() { return interviewCount; }
        public void setInterviewCount(int interviewCount) { this.interviewCount = interviewCount; }

        public int getOfferCount() { return offerCount; }
        public void setOfferCount(int offerCount) { this.offerCount = offerCount; }

        public int getOnboardedCount() { return onboardedCount; }
        public void setOnboardedCount(int onboardedCount) { this.onboardedCount = onboardedCount; }

        public Map<String, Integer> getCurrentStageCounts() { return currentStageCounts; }
        public void setCurrentStageCounts(Map<String, Integer> currentStageCounts) { this.currentStageCounts = currentStageCounts; }
    }
}
