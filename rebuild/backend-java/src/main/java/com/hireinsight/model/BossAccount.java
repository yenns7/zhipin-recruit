package com.hireinsight.model;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * BOSS直聘账号绑定。
 * encryptedCookie 使用 FieldEncryptionService (AES-GCM) 加密存储。
 */
@Entity
@Table(name = "boss_account")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class BossAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "boss_uid", length = 100)
    private String bossUid;

    @Column(name = "encrypted_cookie", columnDefinition = "text")
    private String encryptedCookie;

    @Column(length = 100)
    private String nickname;

    @Column(length = 500)
    private String avatar;

    @Column(length = 20)
    @Builder.Default
    private String status = "active";

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = false;

    @Column(name = "cookie_count")
    @Builder.Default
    private Integer cookieCount = 0;

    @Column(name = "last_verified_at")
    private Instant lastVerifiedAt;

    @Column(name = "last_verified_ok")
    private Boolean lastVerifiedOk;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;
}
