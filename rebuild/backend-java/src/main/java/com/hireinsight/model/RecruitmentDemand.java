package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "recruitment_demands")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class RecruitmentDemand {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id")
    private Long jobId;

    @Column(name = "owner_hr_id", nullable = false)
    private Long ownerHrId;

    @Column(name = "request_no", nullable = false, length = 64)
    private String requestNo;

    @Column(name = "requester_name", nullable = false, length = 100)
    private String requesterName;

    @Column(nullable = false, length = 100)
    private String department;

    @Column(name = "hiring_manager_name", nullable = false, length = 100)
    private String hiringManagerName;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "target_date")
    private LocalDate targetDate;

    @Column(length = 20)
    @Builder.Default
    private String priority = "medium";

    @Builder.Default
    private Integer headcount = 1;

    @Column(length = 20)
    @Builder.Default
    private String status = "open";

    @Column(name = "close_reason", length = 500)
    private String closeReason;

    @Column(name = "downgrade_reason", length = 500)
    private String downgradeReason;

    @Column(length = 2000)
    private String note;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;
}
