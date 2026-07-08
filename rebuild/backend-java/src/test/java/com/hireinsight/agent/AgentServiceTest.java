package com.hireinsight.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.*;
import com.hireinsight.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AgentServiceTest {

    @Mock
    private LlmClient llmClient;
    @Mock
    private ConversationRepository conversationRepository;
    @Mock
    private ConversationMessageRepository conversationMessageRepository;
    @Mock
    private AgentCallLogRepository agentCallLogRepository;
    @Mock
    private CandidateRepository candidateRepository;
    @Mock
    private JobRepository jobRepository;
    @Mock
    private PipelineStageRepository pipelineStageRepository;
    @Mock
    private NotificationRepository notificationRepository;
    @Mock
    private InterviewSessionRepository interviewSessionRepository;

    private ObjectMapper objectMapper;
    private AgentService agentService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        agentService = new AgentService(
                llmClient, objectMapper,
                conversationRepository, conversationMessageRepository,
                agentCallLogRepository, candidateRepository,
                jobRepository, pipelineStageRepository,
                notificationRepository, interviewSessionRepository
        );
    }

    @Test
    void systemPromptIsInChinese() {
        String prompt = agentService.getSystemPrompt();
        assertTrue(prompt.contains("智聘"));
        assertTrue(prompt.contains("招聘助手"));
        assertTrue(prompt.contains("中文"));
    }

    @Test
    void toolDefinitionsReturnsAll12Tools() {
        List<Map<String, Object>> tools = agentService.getToolDefinitions();
        assertEquals(12, tools.size());

        long readCount = tools.stream().filter(t -> "read".equals(t.get("type"))).count();
        long writeCount = tools.stream().filter(t -> "write".equals(t.get("type"))).count();

        assertEquals(8, readCount);
        assertEquals(4, writeCount);
    }

    @Test
    void getToolDefinitionsContainsExpectedTools() {
        List<Map<String, Object>> tools = agentService.getToolDefinitions();
        List<String> names = tools.stream().map(t -> (String) t.get("name")).toList();

        assertTrue(names.contains("search_candidates"));
        assertTrue(names.contains("get_candidate"));
        assertTrue(names.contains("list_jobs"));
        assertTrue(names.contains("get_job"));
        assertTrue(names.contains("list_pipeline_stages"));
        assertTrue(names.contains("get_call_logs"));
        assertTrue(names.contains("list_conversations"));
        assertTrue(names.contains("get_help"));
        assertTrue(names.contains("update_pipeline_stage"));
        assertTrue(names.contains("send_notification"));
        assertTrue(names.contains("create_interview"));
        assertTrue(names.contains("update_candidate"));
    }

    @Test
    void executeWriteToolWithInvalidKeyReturnsError() {
        Map<String, Object> result = agentService.executeWriteTool("invalid_key", 1L);
        assertTrue(result.containsKey("error"));
    }

    @Test
    void processChatWithLlmReturningAnswerEmitsDone() throws Exception {
        // Mock LLM to return a direct answer
        when(llmClient.chat(anyString(), anyString(), anyString()))
                .thenReturn("{\"answer\":\"你好！我是智聘 AI 助手，有什么可以帮助你的？\"}");

        // Mock conversation save
        Conversation conv = Conversation.builder()
                .id(1L)
                .userId(1L)
                .title("test")
                .build();
        when(conversationRepository.save(any(Conversation.class)))
                .thenReturn(conv);
        when(conversationMessageRepository.findByConversationIdOrderByCreatedAtAsc(anyLong()))
                .thenReturn(List.of());

        SseEmitter emitter = new SseEmitter();

        agentService.processChat(1L, null, "你好", emitter, "fast");

        verify(llmClient, times(1)).chat(anyString(), anyString(), anyString());
        verify(conversationRepository, times(1)).save(any(Conversation.class));
        verify(conversationMessageRepository, times(2)).save(any(ConversationMessage.class));
    }

    @Test
    void processChatWithExistingConversationDoesNotCreateNew() throws Exception {
        when(llmClient.chat(anyString(), anyString(), anyString()))
                .thenReturn("{\"answer\":\"好的\"}");

        Conversation existingConv = Conversation.builder()
                .id(5L)
                .userId(1L)
                .title("existing")
                .build();
        when(conversationRepository.findById(5L))
                .thenReturn(Optional.of(existingConv));
        when(conversationMessageRepository.findByConversationIdOrderByCreatedAtAsc(5L))
                .thenReturn(List.of(
                        ConversationMessage.builder()
                                .id(1L)
                                .conversationId(5L)
                                .role("USER")
                                .content("之前的消息")
                                .build()
                ));

        SseEmitter emitter = new SseEmitter();
        agentService.processChat(1L, 5L, "继续", emitter, "fast");

        verify(conversationRepository, never()).save(any(Conversation.class));
        verify(conversationRepository, times(1)).findById(5L);
    }

    @Test
    void processChatWithInvalidConversationIdReturnsError() {
        when(conversationRepository.findById(999L))
                .thenReturn(Optional.empty());

        SseEmitter emitter = new SseEmitter();
        // Should not throw - error is captured in SSE event
        assertDoesNotThrow(() ->
                agentService.processChat(1L, 999L, "hello", emitter, "fast"));
    }
}
