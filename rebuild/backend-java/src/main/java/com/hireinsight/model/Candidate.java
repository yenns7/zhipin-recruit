package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "candidates")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Candidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_hr_id")
    private Long ownerHrId;

    @Column(name = "name_masked", length = 100)
    private String nameMasked;

    @Column(name = "email_masked", length = 100)
    private String emailMasked;

    @Column(name = "phone_masked", length = 20)
    private String phoneMasked;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "resume_json", columnDefinition = "jsonb")
    private String resumeJson;

    @Column(name = "raw_file_path")
    private String rawFilePath;

    @Column(name = "parse_status", length = 20)
    @Builder.Default
    private String parseStatus = "pending";

    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "parse_error", length = 2000)
    private String parseError;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
