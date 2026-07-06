package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "interview_feedbacks")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class InterviewFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "candidate_id", nullable = false)
    private Long candidateId;

    @Column(name = "job_id", nullable = false)
    private Long jobId;

    @Column(name = "interviewer_id")
    private Long interviewerId;

    @Column(name = "qa_json", columnDefinition = "jsonb")
    private String qaJson;

    @Column(name = "ai_report", columnDefinition = "jsonb")
    private String aiReport;

    private Integer score;

    @Column(name = "pass_recommended")
    private Boolean passRecommended;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
