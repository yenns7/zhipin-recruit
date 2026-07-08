package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "upload_batch")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class UploadBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_hr_id", nullable = false)
    private Long ownerHrId;

    @Column(length = 50)
    @Builder.Default
    private String source = "manual";

    @Column(length = 50)
    private String channel;

    @Column(length = 1000)
    private String notes;

    @Column(name = "file_count", nullable = false)
    @Builder.Default
    private Integer fileCount = 0;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
