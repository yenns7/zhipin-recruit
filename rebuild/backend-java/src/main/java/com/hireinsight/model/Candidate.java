package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
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

    @Column(name = "resume_json", columnDefinition = "jsonb")
    private String resumeJson;

    @Column(name = "raw_file_path")
    private String rawFilePath;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
