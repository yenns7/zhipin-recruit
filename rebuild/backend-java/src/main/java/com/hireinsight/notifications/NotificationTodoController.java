package com.hireinsight.notifications;

import com.hireinsight.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/v1/notifications/todos")
public class NotificationTodoController {

    private final ConcurrentHashMap<String, String> statuses = new ConcurrentHashMap<>();

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(Authentication authentication) {
        String role = role(authentication);
        List<Map<String, Object>> items = new ArrayList<>();
        defaultItems(role).forEach(item -> {
            String id = String.valueOf(item.get("id"));
            String status = statuses.getOrDefault(id, "open");
            if (!"archived".equals(status)) {
                Map<String, Object> copy = new java.util.LinkedHashMap<>(item);
                copy.put("status", status);
                copy.put("statusLabel", switch (status) {
                    case "completed" -> "已完成";
                    case "archived" -> "已归档";
                    default -> "待处理";
                });
                items.add(copy);
            }
        });
        long openCount = items.stream().filter(item -> "open".equals(item.get("status"))).count();
        Map<String, Object> payload = Map.of(
                "role", role,
                "generatedAt", Instant.now().toString(),
                "summary", Map.of(
                        "title", roleTitle(role),
                        "highlight", roleHighlight(role),
                        "openCount", openCount
                ),
                "items", items
        );
        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    @PostMapping("/{todoId}/complete")
    public ResponseEntity<ApiResponse<Map<String, Object>>> complete(@PathVariable String todoId) {
        statuses.put(todoId, "completed");
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", todoId,
                "status", "completed",
                "statusLabel", "已完成"
        )));
    }

    @PostMapping("/{todoId}/archive")
    public ResponseEntity<ApiResponse<Map<String, Object>>> archive(@PathVariable String todoId) {
        statuses.put(todoId, "archived");
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "id", todoId,
                "status", "archived",
                "statusLabel", "已归档"
        )));
    }

    private List<Map<String, Object>> defaultItems(String role) {
        if ("interviewer".equals(role)) {
            return List.of(item("interviewer-1", "补交面试反馈", "还有面试记录缺少评分和结论。", "high", "查看面试", "/interviews", role));
        }
        if ("admin".equals(role)) {
            return List.of(item("admin-1", "检查试点账号", "确认管理员 demo 账号和权限仍可用。", "medium", "查看用户", "/admin/users", role));
        }
        return List.of(item("recruiter-1", "补齐候选人初筛结论", "今天有候选人还没有完成初筛。", "high", "查看候选人", "/candidates", role));
    }

    private Map<String, Object> item(String id, String title, String message, String priority,
                                     String nextActionLabel, String nextActionPath, String audience) {
        Map<String, Object> item = new java.util.LinkedHashMap<>();
        item.put("id", id);
        item.put("title", title);
        item.put("message", message);
        item.put("priority", priority);
        item.put("priorityLabel", "high".equals(priority) ? "高优先级" : "中优先级");
        item.put("status", "open");
        item.put("statusLabel", "待处理");
        item.put("nextActionLabel", nextActionLabel);
        item.put("nextActionPath", nextActionPath);
        item.put("dueHint", "今天 18:00 前");
        item.put("audience", audience);
        return item;
    }

    private String role(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .findFirst()
                .map(authority -> authority.getAuthority().replace("ROLE_", "").toLowerCase())
                .orElse("recruiter");
    }

    private String roleTitle(String role) {
        return switch (role) {
            case "admin" -> "管理员待办";
            case "manager" -> "负责人待办";
            case "interviewer" -> "面试官待办";
            default -> "招聘专员待办";
        };
    }

    private String roleHighlight(String role) {
        return switch (role) {
            case "admin" -> "先确认试点权限、账号和系统设置入口";
            case "manager" -> "今天优先处理跨岗位升级和负责人分配";
            case "interviewer" -> "今天优先补齐面试反馈";
            default -> "今天优先清掉初筛与约面试积压";
        };
    }
}
