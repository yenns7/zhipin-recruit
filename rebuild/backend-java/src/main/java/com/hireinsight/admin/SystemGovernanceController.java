package com.hireinsight.admin;

import com.hireinsight.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/system")
public class SystemGovernanceController {

    private volatile boolean manualReviewEnabled = false;
    private volatile String questionModelStatus = "standby";
    private final List<Map<String, Object>> auditLogs = new ArrayList<>();

    public SystemGovernanceController() {
        auditLogs.add(audit("audit-boot-001", "MODEL_CONFIG_REVIEWED", "model",
                "gpt-4.1-mini / resume-parser", "确认 demo 环境继续使用影子发布卡片，仅前台只读展示。"));
    }

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> overview() {
        Map<String, Object> payload = Map.of(
                "generatedAt", Instant.now().toString(),
                "demoNotice", "仅用于 demo / in-memory 展示，不代表真实持久化配置。",
                "parameterSummary", Map.of(
                        "totalCount", 2,
                        "mutableCount", 1,
                        "entries", List.of(
                                parameter("security.sessionTimeoutMinutes", "后台会话超时", "120 分钟", "security", "admin_readonly_demo", false),
                                parameter("audit.manualReviewEnabled", "审核人工复核", manualReviewEnabled ? "开启" : "关闭", "audit", "admin_demo_write", true)
                        )
                ),
                "modelSummary", Map.of(
                        "totalCount", 2,
                        "rolloutMode", "demo-shadow",
                        "entries", List.of(
                                model("resume-parser-primary", "OpenAI", "gpt-4.1-mini", "简历解析 / 总结", "active", false),
                                model("interview-question-generator", "OpenAI", "gpt-4.1", "面试问题生成", questionModelStatus, true)
                        )
                )
        );
        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> auditLogs() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "generatedAt", Instant.now().toString(),
                "demoNotice", "仅用于 demo / in-memory 展示，不代表真实持久化配置。",
                "total", auditLogs.size(),
                "items", auditLogs
        )));
    }

    @PostMapping("/parameters/{key}/toggle")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleParameter(@PathVariable String key) {
        if (!"audit.manualReviewEnabled".equals(key)) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, "Unsupported demo parameter: " + key));
        }
        manualReviewEnabled = !manualReviewEnabled;
        String value = manualReviewEnabled ? "开启" : "关闭";
        auditLogs.add(0, audit("audit-" + Instant.now().toEpochMilli(), "SYSTEM_PARAMETER_TOGGLED",
                "parameter", key, "将审核人工复核切换为" + value + "（demo / in-memory）。"));
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "generatedAt", Instant.now().toString(),
                "demoNotice", "仅用于 demo / in-memory 展示，不代表真实持久化配置。",
                "message", "已切换参数：审核人工复核",
                "targetType", "parameter",
                "targetName", key,
                "currentValue", value
        )));
    }

    @PostMapping("/models/{modelId}/toggle-status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleModel(@PathVariable String modelId) {
        if (!"interview-question-generator".equals(modelId)) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, "Unsupported demo model: " + modelId));
        }
        questionModelStatus = "active".equals(questionModelStatus) ? "standby" : "active";
        auditLogs.add(0, audit("audit-" + Instant.now().toEpochMilli(), "MODEL_STATUS_TOGGLED",
                "model", modelId, "将模型 gpt-4.1 的状态切换为" + questionModelStatus + "（demo / in-memory）。"));
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "generatedAt", Instant.now().toString(),
                "demoNotice", "仅用于 demo / in-memory 展示，不代表真实持久化配置。",
                "message", "已切换模型状态：gpt-4.1",
                "targetType", "model",
                "targetName", modelId,
                "currentValue", questionModelStatus
        )));
    }

    private Map<String, Object> parameter(String key, String label, String value, String category, String exposure, boolean mutable) {
        return Map.of(
                "key", key,
                "label", label,
                "value", value,
                "category", category,
                "exposure", exposure,
                "mutable", mutable
        );
    }

    private Map<String, Object> model(String id, String provider, String model, String scenario, String status, boolean mutable) {
        return Map.of(
                "id", id,
                "provider", provider,
                "model", model,
                "scenario", scenario,
                "status", status,
                "fallbackModel", "gpt-4.1-mini",
                "note", "当前仅展示摘要，不落真实供应商密钥。",
                "mutable", mutable
        );
    }

    private Map<String, Object> audit(String id, String action, String targetType, String targetName, String detail) {
        return Map.of(
                "id", id,
                "action", action,
                "actorName", "系统管理员",
                "actorRole", "admin",
                "targetType", targetType,
                "targetName", targetName,
                "result", "success",
                "detail", detail,
                "happenedAt", Instant.now().toString()
        );
    }
}
