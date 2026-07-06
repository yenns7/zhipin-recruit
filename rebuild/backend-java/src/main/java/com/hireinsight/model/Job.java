package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "jobs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "jd_text", nullable = false, columnDefinition = "text")
    private String jdText;

    @Column(name = "jd_structured", columnDefinition = "jsonb")
    private String jdStructured;

    @Column(name = "owner_hr_id")
    private Long ownerHrId;

    @Column(length = 20)
    @Builder.Default
    private String status = "active";

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
