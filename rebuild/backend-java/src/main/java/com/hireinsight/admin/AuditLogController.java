package com.hireinsight.admin;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.model.AuditLog;
import com.hireinsight.repository.AuditLogRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/audit-logs")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String targetType) {
        Page<AuditLog> logPage;
        if (actorId != null) {
            var logs = auditLogRepository.findByActorIdOrderByCreatedAtDesc(actorId);
            List<Map<String, Object>> items = logs.stream().map(this::toResponse).toList();
            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                    "logs", items,
                    "total", items.size(),
                    "page", 0,
                    "per_page", items.size(),
                    "pages", 1
            )));
        }
        logPage = auditLogRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size));
        List<Map<String, Object>> items = logPage.getContent().stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "logs", items,
                "total", logPage.getTotalElements(),
                "page", logPage.getNumber(),
                "per_page", logPage.getSize(),
                "pages", logPage.getTotalPages()
        )));
    }

    private Map<String, Object> toResponse(AuditLog log) {
        return Map.of(
                "id", log.getId(),
                "source", "audit_log",
                "actor_id", log.getActorId(),
                "actor_name", log.getActorName(),
                "action", log.getAction(),
                "target_type", log.getTargetType(),
                "target_id", log.getTargetId(),
                "detail", log.getDetail() != null ? log.getDetail() : "",
                "ts", log.getCreatedAt() != null ? log.getCreatedAt().toString() : null
        );
    }
}
