package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "talent_map_people")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class TalentMapPerson {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "map_id", nullable = false)
    private Long mapId;

    @Column(name = "company_id")
    private Long companyId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 160)
    @Builder.Default
    private String title = "";

    @Column(length = 80)
    @Builder.Default
    private String city = "";

    @Column(columnDefinition = "text")
    private String tags;

    @Column(name = "salary_range", length = 120)
    @Builder.Default
    private String salaryRange = "";

    @Column(name = "contact_status", length = 80)
    @Builder.Default
    private String contactStatus = "未接触";

    @Column(length = 120)
    @Builder.Default
    private String evaluation = "";

    @Column(length = 160)
    @Builder.Default
    private String source = "";

    @Column(name = "next_follow_at")
    private LocalDate nextFollowAt;

    @Column(columnDefinition = "text")
    private String note;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;
}
