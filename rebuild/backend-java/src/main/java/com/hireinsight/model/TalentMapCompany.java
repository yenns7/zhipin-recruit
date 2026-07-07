package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

@Entity
@Table(name = "talent_map_companies")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class TalentMapCompany {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "map_id", nullable = false)
    private Long mapId;

    @Column(name = "company_name", nullable = false, length = 200)
    private String companyName;

    @Column(length = 80)
    @Builder.Default
    private String city = "";

    @Column(length = 80)
    @Builder.Default
    private String region = "";

    @Column(length = 120)
    @Builder.Default
    private String industry = "";

    @Column(length = 40)
    @Builder.Default
    private String priority = "medium";

    @Column(columnDefinition = "text")
    private String note;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;
}
