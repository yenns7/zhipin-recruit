package com.hireinsight.repository;

import com.hireinsight.model.BossAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BossAccountRepository extends JpaRepository<BossAccount, Long> {
    List<BossAccount> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<BossAccount> findByUserIdAndIsActiveTrue(Long userId);
    Optional<BossAccount> findByIdAndUserId(Long id, Long userId);
    long countByUserId(Long userId);
}
