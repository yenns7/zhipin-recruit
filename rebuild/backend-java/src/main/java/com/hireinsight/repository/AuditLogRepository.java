package com.hireinsight.repository;

import com.hireinsight.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByActorIdOrderByCreatedAtDesc(Long actorId);
    List<AuditLog> findByTargetTypeAndTargetId(String targetType, String targetId);
    Page<AuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
