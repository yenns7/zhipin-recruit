package com.hireinsight.admin;

import com.hireinsight.agent.AgentService;
import com.hireinsight.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AiArchitectureController {

    private final AgentService agentService;

    public AiArchitectureController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping("/ai-architecture")
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
}
