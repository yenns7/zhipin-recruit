package com.hireinsight.agent;

import com.hireinsight.common.ApiResponse;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.AgentCallLog;
import com.hireinsight.repository.AgentCallLogRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    private final AgentDemoService agentDemoService;
    private final AgentService agentService;
    private final LlmClient llmClient;
    private final AgentCallLogRepository agentCallLogRepository;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public AgentController(AgentDemoService agentDemoService,
                           AgentService agentService,
                           LlmClient llmClient,
                           AgentCallLogRepository agentCallLogRepository) {
        this.agentDemoService = agentDemoService;
        this.agentService = agentService;
        this.llmClient = llmClient;
        this.agentCallLogRepository = agentCallLogRepository;
    }

    // ==================== SSE Chat (new) ====================

    /**
     * POST /api/v1/agent/chat
     * SSE streaming chat endpoint. Returns text/event-stream with ReAct agent events.
     */
    @PostMapping("/chat")
    public SseEmitter chat(@Valid @RequestBody ChatRequest request,
                           Authentication authentication) {
        Long userId = authentication != null ? (Long) authentication.getPrincipal() : 0L;
        String route = request.getRoute() != null ? request.getRoute() : "fast";

        SseEmitter emitter = new SseEmitter(300_000L); // 5 minute timeout

        executor.execute(() -> {
            try {
                agentService.processChat(userId, request.getConversationId(),
                        request.getMessage(), emitter, route);
            } catch (Exception e) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data("{\"type\":\"error\",\"message\":\"" +
                                    e.getMessage().replace("\"", "\\\"") + "\"}"));
                } catch (Exception ignored) {
                }
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }

    // ==================== Call Logs (admin) ====================

    @GetMapping("/call-logs")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listCallLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String action) {
        Page<AgentCallLog> logPage;
        if (action != null && !action.isBlank()) {
            logPage = agentCallLogRepository.findByAction(action, PageRequest.of(page, size));
        } else {
            logPage = agentCallLogRepository.findAll(PageRequest.of(page, size));
        }
        List<CallLogResponse> items = logPage.getContent().stream()
                .map(this::toCallLogResponse)
                .toList();
        Map<String, Object> result = Map.of(
                "items", items,
                "total", logPage.getTotalElements(),
                "page", logPage.getNumber(),
                "size", logPage.getSize(),
                "totalPages", logPage.getTotalPages()
        );
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/call-logs/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CallLogResponse>> getCallLog(@PathVariable Long id) {
        return agentCallLogRepository.findById(id)
                .map(log -> ResponseEntity.ok(ApiResponse.ok(toCallLogResponse(log))))
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.error(404, "call log not found")));
    }

    // ==================== Tools (admin) ====================

    @GetMapping("/tools")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<ToolDefinition>>> listTools() {
        return ResponseEntity.ok(ApiResponse.ok(predefinedTools()));
    }

    @PostMapping("/execute")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> executeTool(
            @Valid @RequestBody ExecuteToolRequest request,
            Authentication authentication) {
        Long userId = authentication != null ? (Long) authentication.getPrincipal() : 0L;

        // If confirmKey is provided, execute a pending write tool
        if (request.getConfirmKey() != null && !request.getConfirmKey().isBlank()) {
            Map<String, Object> result = agentService.executeWriteTool(request.getConfirmKey(), userId);
            boolean ok = Boolean.TRUE.equals(result.get("ok"));
            if (ok) {
                return ResponseEntity.ok(ApiResponse.ok(result));
            } else {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(ApiResponse.error(400, (String) result.getOrDefault("error", "执行失败")));
            }
        }

        // Legacy mock tool execution
        long start = System.currentTimeMillis();
        Map<String, Object> result;
        try {
            result = mockExecuteTool(request.getToolName(), request.getParameters());
        } catch (Exception e) {
            AgentCallLog errorLog = AgentCallLog.builder()
                    .userId(userId)
                    .action("tool_execute")
                    .toolName(request.getToolName())
                    .inputJson(toJsonString(request.getParameters()))
                    .outputJson("{\"error\":\"" + e.getMessage() + "\"}")
                    .status("error")
                    .durationMs(System.currentTimeMillis() - start)
                    .build();
            agentCallLogRepository.save(errorLog);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, e.getMessage()));
        }
        long duration = System.currentTimeMillis() - start;
        AgentCallLog execLog = AgentCallLog.builder()
                .userId(userId)
                .action("tool_execute")
                .toolName(request.getToolName())
                .inputJson(toJsonString(request.getParameters()))
                .outputJson(toJsonString(result))
                .status("success")
                .durationMs(duration)
                .build();
        agentCallLogRepository.save(execLog);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ==================== Conversations ====================

    @GetMapping("/conversations")
    public ResponseEntity<ApiResponse<Map<String, Object>>> conversations() {
        return ResponseEntity.ok(ApiResponse.ok(agentDemoService.listConversations()));
    }

    @GetMapping("/conversations/{conversationId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> conversation(@PathVariable String conversationId) {
        return ResponseEntity.ok(ApiResponse.ok(agentDemoService.getConversation(conversationId)));
    }

    @PostMapping("/conversations")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createConversation(
            @Valid @RequestBody CreateConversationRequest request) {
        Map<String, Object> result = agentDemoService.createConversation(request.getTitle(), request.getDescription());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(result));
    }

    @PatchMapping("/conversations/{conversationId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateConversation(
            @PathVariable String conversationId,
            @Valid @RequestBody UpdateConversationRequest request) {
        Map<String, Object> result = agentDemoService.updateConversation(conversationId, request.getTitle(), request.getDescription());
        if (result == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "conversation not found"));
        }
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @DeleteMapping("/conversations/{conversationId}")
    public ResponseEntity<ApiResponse<Void>> deleteConversation(@PathVariable String conversationId) {
        boolean deleted = agentDemoService.deleteConversation(conversationId);
        if (!deleted) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(404, "conversation not found"));
        }
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/conversations/{conversationId}/messages")
    public ResponseEntity<ApiResponse<Map<String, Object>>> message(
            @PathVariable String conversationId,
            @Valid @RequestBody SendMessageRequest request,
            Authentication authentication) {
        String role = authentication.getAuthorities().stream()
                .findFirst()
                .map(authority -> authority.getAuthority().replace("ROLE_", "").toLowerCase())
                .orElse("recruiter");
        return ResponseEntity.ok(ApiResponse.ok(agentDemoService.appendMessage(conversationId, request.getContent(), role)));
    }

    // ==================== Admin Architecture Endpoint ====================

    @GetMapping("/admin/ai-architecture")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAiArchitecture() {
        Map<String, Object> arch = Map.of(
                "systemPrompt", agentService.getSystemPrompt(),
                "tools", agentService.getToolDefinitions(),
                "permissions", Map.of(
                        "readTools", "所有认证用户",
                        "writeTools", "需要 ADMIN 角色 + 用户确认",
                        "adminEndpoint", "需要 ADMIN 角色"
                ),
                "security", Map.of(
                        "authentication", "JWT Bearer Token",
                        "rateLimit", "agent-chat: 20次/60秒",
                        "dataAccess", "用户只能访问自己有权限的数据",
                        "writeConfirmation", "写操作需要用户二次确认"
                ),
                "llmConfig", Map.of(
                        "routes", List.of("fast", "think", "pro"),
                        "mockMode", "当 LLM_API_KEY 未配置时自动启用"
                )
        );
        return ResponseEntity.ok(ApiResponse.ok(arch));
    }

    // ==================== DTOs ====================

    @Data
    public static class ChatRequest {
        @NotBlank
        private String message;
        private Long conversationId;
        private String route; // fast, think, pro
        private List<Map<String, String>> history; // optional context
    }

    @Data
    public static class SendMessageRequest {
        @NotBlank
        private String content;
    }

    @Data
    public static class CreateConversationRequest {
        private String title;
        private String description;
    }

    @Data
    public static class UpdateConversationRequest {
        private String title;
        private String description;
    }

    @Data
    public static class ExecuteToolRequest {
        @NotBlank
        private String toolName;
        private Map<String, Object> parameters;
        private String confirmKey; // for write tool confirmation
    }

    @Data
    public static class ToolDefinition {
        private String name;
        private String description;
        private String parameters;
        private boolean enabled;
    }

    @Data
    public static class CallLogResponse {
        private Long id;
        private Long conversationId;
        private Long userId;
        private String action;
        private String toolName;
        private String inputJson;
        private String outputJson;
        private String status;
        private Long durationMs;
        private String model;
        private Integer promptTokens;
        private Integer completionTokens;
        private String createdAt;
    }

    // ==================== Helpers ====================

    private CallLogResponse toCallLogResponse(AgentCallLog log) {
        CallLogResponse r = new CallLogResponse();
        r.setId(log.getId());
        r.setConversationId(log.getConversationId());
        r.setUserId(log.getUserId());
        r.setAction(log.getAction());
        r.setToolName(log.getToolName());
        r.setInputJson(log.getInputJson());
        r.setOutputJson(log.getOutputJson());
        r.setStatus(log.getStatus());
        r.setDurationMs(log.getDurationMs());
        r.setModel(log.getModel());
        r.setPromptTokens(log.getPromptTokens());
        r.setCompletionTokens(log.getCompletionTokens());
        r.setCreatedAt(log.getCreatedAt() != null ? log.getCreatedAt().toString() : null);
        return r;
    }

    private List<ToolDefinition> predefinedTools() {
        return List.of(
                toolDef("search_candidates", "搜索候选人", "{\"type\":\"object\",\"properties\":{\"keyword\":{\"type\":\"string\"}}}", true),
                toolDef("match_candidates", "匹配候选人", "{\"type\":\"object\",\"properties\":{\"candidateId\":{\"type\":\"integer\"},\"jobId\":{\"type\":\"integer\"}}}", true),
                toolDef("move_pipeline", "推进候选人流程", "{\"type\":\"object\",\"properties\":{\"candidateId\":{\"type\":\"integer\"},\"stage\":{\"type\":\"string\"}}}", true),
                toolDef("generate_report", "生成面试报告", "{\"type\":\"object\",\"properties\":{\"candidateId\":{\"type\":\"integer\"},\"template\":{\"type\":\"string\"}}}", true)
        );
    }

    private ToolDefinition toolDef(String name, String description, String parameters, boolean enabled) {
        ToolDefinition t = new ToolDefinition();
        t.setName(name);
        t.setDescription(description);
        t.setParameters(parameters);
        t.setEnabled(enabled);
        return t;
    }

    private Map<String, Object> mockExecuteTool(String toolName, Map<String, Object> parameters) {
        return switch (toolName) {
            case "search_candidates" -> Map.of(
                    "tool", toolName,
                    "result", "found 5 candidates matching criteria",
                    "parameters", parameters != null ? parameters : Map.of()
            );
            case "match_candidates" -> Map.of(
                    "tool", toolName,
                    "result", "candidate matched successfully",
                    "score", 85,
                    "parameters", parameters != null ? parameters : Map.of()
            );
            case "move_pipeline" -> Map.of(
                    "tool", toolName,
                    "result", "candidate moved to next stage",
                    "previousStage", "screening",
                    "nextStage", "interview",
                    "parameters", parameters != null ? parameters : Map.of()
            );
            case "generate_report" -> Map.of(
                    "tool", toolName,
                    "result", "report generated",
                    "reportUrl", "/reports/interview-summary-001.pdf",
                    "parameters", parameters != null ? parameters : Map.of()
            );
            default -> throw new IllegalArgumentException("Unknown tool: " + toolName);
        };
    }

    private String toJsonString(Object obj) {
        if (obj == null) return null;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj);
        } catch (Exception e) {
            return obj.toString();
        }
    }
}
