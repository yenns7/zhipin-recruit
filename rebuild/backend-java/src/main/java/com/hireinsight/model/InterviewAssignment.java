package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.time.LocalDateTime;

@Entity
@Table(name = "interview_assignments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class InterviewAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(nullable = false)
    private Integer round;

    @Column(name = "interviewer_id", nullable = false)
    private Long interviewerId;

    @Column(name = "interviewer_name", length = 100)
    private String interviewerName;

    @Column(name = "scheduled_at")
    private LocalDateTime scheduledAt;

    @Column(length = 255)
    private String location;

    @Column(length = 20)
    @Builder.Default
    private String status = "SCHEDULED";

    @Column(columnDefinition = "text")
    private String notes;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
