package com.hireinsight.agent;

import com.hireinsight.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentController {

    private final AgentDemoService agentDemoService;

    public AgentController(AgentDemoService agentDemoService) {
        this.agentDemoService = agentDemoService;
    }

    @GetMapping("/conversations")
    public ResponseEntity<ApiResponse<Map<String, Object>>> conversations() {
        return ResponseEntity.ok(ApiResponse.ok(agentDemoService.listConversations()));
    }

    @GetMapping("/conversations/{conversationId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> conversation(@PathVariable String conversationId) {
        return ResponseEntity.ok(ApiResponse.ok(agentDemoService.getConversation(conversationId)));
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

    @Data
    public static class SendMessageRequest {
        @NotBlank
        private String content;
    }
}
