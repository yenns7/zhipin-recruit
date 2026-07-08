package com.hireinsight.admin;

import com.hireinsight.model.AuditLog;
import com.hireinsight.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

@Service
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public AuditLog log(Long actorId, String actorName, String targetType, String targetId,
                        String action, String detail) {
        AuditLog log = AuditLog.builder()
                .actorId(actorId)
                .actorName(actorName)
                .targetType(targetType)
                .targetId(targetId)
                .action(action)
                .detail(detail)
                .build();
        return auditLogRepository.save(log);
    }
}
