package com.hireinsight.agent;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.AgentCallLog;
import com.hireinsight.repository.AgentCallLogRepository;
import com.hireinsight.repository.ConversationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AgentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private AgentCallLogRepository agentCallLogRepository;

    @Autowired
    private ConversationRepository conversationRepository;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() {
        agentCallLogRepository.deleteAll();
        conversationRepository.deleteAll();
        adminToken = "Bearer " + jwtTokenProvider.createToken(1L, "ADMIN");
        userToken = "Bearer " + jwtTokenProvider.createToken(2L, "RECRUITER");
    }

    // ==================== Call Logs ====================

    @Test
    void callLogsWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/agent/call-logs"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void callLogsWithUserRoleReturns403() throws Exception {
        mockMvc.perform(get("/api/v1/agent/call-logs")
                        .header("Authorization", userToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void listCallLogsReturnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/v1/agent/call-logs")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.total").value(0));
    }

    @Test
    void getCallLogNotFoundReturns404() throws Exception {
        mockMvc.perform(get("/api/v1/agent/call-logs/9999")
                        .header("Authorization", adminToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void getCallLogReturnsDetail() throws Exception {
        AgentCallLog saved = agentCallLogRepository.save(AgentCallLog.builder()
                .userId(1L)
                .action("chat")
                .toolName("search_candidates")
                .inputJson("{\"q\":\"test\"}")
                .outputJson("{\"result\":\"ok\"}")
                .status("success")
                .durationMs(100L)
                .build());

        mockMvc.perform(get("/api/v1/agent/call-logs/{id}", saved.getId())
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(saved.getId()))
                .andExpect(jsonPath("$.data.action").value("chat"))
                .andExpect(jsonPath("$.data.toolName").value("search_candidates"))
                .andExpect(jsonPath("$.data.status").value("success"));
    }

    @Test
    void listCallLogsSupportsActionFilter() throws Exception {
        agentCallLogRepository.save(AgentCallLog.builder()
                .userId(1L).action("chat").status("success").build());
        agentCallLogRepository.save(AgentCallLog.builder()
                .userId(1L).action("tool_execute").status("success").build());

        mockMvc.perform(get("/api/v1/agent/call-logs?action=chat")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.total").value(1));
    }

    // ==================== Tools ====================

    @Test
    void toolsReturnsPredefinedList() throws Exception {
        mockMvc.perform(get("/api/v1/agent/tools")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].name").value("search_candidates"))
                .andExpect(jsonPath("$.data[1].name").value("match_candidates"))
                .andExpect(jsonPath("$.data[2].name").value("move_pipeline"))
                .andExpect(jsonPath("$.data[3].name").value("generate_report"));
    }

    @Test
    void toolsWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/agent/tools"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void executeToolReturnsResult() throws Exception {
        mockMvc.perform(post("/api/v1/agent/execute")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toolName\":\"search_candidates\",\"parameters\":{\"keyword\":\"engineer\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.tool").value("search_candidates"))
                .andExpect(jsonPath("$.data.result").value("found 5 candidates matching criteria"));

        // Verify a call log was created
        mockMvc.perform(get("/api/v1/agent/call-logs?action=tool_execute")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1));
    }

    @Test
    void executeToolWithoutAuthReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/agent/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toolName\":\"search_candidates\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ==================== Conversations ====================

    @Test
    void createConversationReturnsCreated() throws Exception {
        mockMvc.perform(post("/api/v1/agent/conversations")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Test Conversation\",\"description\":\"A test conversation\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.title").value("Test Conversation"))
                .andExpect(jsonPath("$.data.description").value("A test conversation"));
    }

    @Test
    void listConversationsReturnsList() throws Exception {
        // First create one
        mockMvc.perform(post("/api/v1/agent/conversations")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"My Chat\"}"));

        mockMvc.perform(get("/api/v1/agent/conversations")
                        .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.conversations").isArray());
    }

    @Test
    void deleteConversationReturnsOk() throws Exception {
        // Create first
        String responseJson = mockMvc.perform(post("/api/v1/agent/conversations")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"To Delete\"}"))
                .andReturn().getResponse().getContentAsString();

        // Extract id
        String convId = responseJson.split("\"id\":\"")[1].split("\"")[0];

        mockMvc.perform(delete("/api/v1/agent/conversations/{id}", convId)
                        .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void deleteConversationNotFoundReturns404() throws Exception {
        mockMvc.perform(delete("/api/v1/agent/conversations/nonexistent")
                        .header("Authorization", userToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void allEndpointsWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/agent/conversations"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/agent/conversations/test"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/agent/conversations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"test\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/v1/agent/conversations/test"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/agent/conversations/test/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"hello\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/agent/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hello\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ==================== SSE Chat (new) ====================

    @Test
    void chatWithoutAuthReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/agent/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hello\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void chatReturnsSseStream() throws Exception {
        mockMvc.perform(post("/api/v1/agent/chat")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"你好\",\"route\":\"fast\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void chatWithConversationIdReturnsSseStream() throws Exception {
        mockMvc.perform(post("/api/v1/agent/chat")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"继续\",\"conversationId\":1}"))
                .andExpect(status().isOk());
    }

    // ==================== Admin Architecture (new) ====================

    @Test
    void adminArchitectureWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/agent/admin/ai-architecture"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminArchitectureWithUserRoleReturns403() throws Exception {
        mockMvc.perform(get("/api/v1/agent/admin/ai-architecture")
                        .header("Authorization", userToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminArchitectureReturnsSystemPromptAndTools() throws Exception {
        mockMvc.perform(get("/api/v1/agent/admin/ai-architecture")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.systemPrompt").exists())
                .andExpect(jsonPath("$.data.tools").isArray())
                .andExpect(jsonPath("$.data.permissions").exists())
                .andExpect(jsonPath("$.data.security").exists())
                .andExpect(jsonPath("$.data.llmConfig").exists());
    }

    @Test
    void adminArchitectureToolsIncludeReadAndWrite() throws Exception {
        mockMvc.perform(get("/api/v1/agent/admin/ai-architecture")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.tools.length()").value(12));
    }
}
