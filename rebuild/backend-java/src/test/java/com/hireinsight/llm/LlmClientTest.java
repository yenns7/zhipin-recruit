package com.hireinsight.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Tests for LlmClient, focused on mock-mode behavior (when no API key is configured).
 */
@ExtendWith(MockitoExtension.class)
class LlmClientTest {

    @Mock
    private LlmConfig llmConfig;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private LlmClient llmClient;

    @BeforeEach
    void setUp() {
        // Use lenient() for stubbings that may not be used by every test
        // (different tests exercise different code paths through resolveModel)
        lenient().when(llmConfig.getApiKey()).thenReturn("");
        lenient().when(llmConfig.getProvider()).thenReturn("openai");
        lenient().when(llmConfig.getTimeout()).thenReturn(30);
        lenient().when(llmConfig.getMaxRetry()).thenReturn(1);
        lenient().when(llmConfig.getTemperature()).thenReturn(0.7);
        lenient().when(llmConfig.getModelFast()).thenReturn("gpt-4o-mini");
        lenient().when(llmConfig.getModelThink()).thenReturn("gpt-4o");
        lenient().when(llmConfig.getModelPro()).thenReturn("o3-mini");

        llmClient = new LlmClient(llmConfig, objectMapper);
    }

    @Test
    void chat_returnsMockJson_whenNoApiKey() throws Exception {
        String result = llmClient.chat("system prompt", "user resume text", "fast");

        // Should return valid JSON with expected top-level fields
        JsonNode root = objectMapper.readTree(result);
        assertThat(root.has("name")).isTrue();
        assertThat(root.has("email")).isTrue();
        assertThat(root.has("phone")).isTrue();
        assertThat(root.has("summary")).isTrue();
        assertThat(root.has("skills")).isTrue();
        assertThat(root.has("skillScores")).isTrue();
    }

    @Test
    void chat_returnsMockJson_withRouteThink() throws Exception {
        String result = llmClient.chat("system", "some resume text", "think");

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.has("name")).isTrue();
        assertThat(root.has("education")).isTrue();
        // The mock response should have experience array
        assertThat(root.path("experience").isArray()).isTrue();
    }

    @Test
    void chat_returnsMockJson_withRoutePro() throws Exception {
        String result = llmClient.chat("system", "some resume text", "pro");

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.has("name")).isTrue();
        assertThat(root.has("projects")).isTrue();
        assertThat(root.has("certifications")).isTrue();
        assertThat(root.has("languages")).isTrue();
    }

    @Test
    void chat_usesDefaultRoute_whenRouteIsNull() throws Exception {
        String result = llmClient.chat("system", "some resume text", null);

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.path("skills").isArray()).isTrue();
        assertThat(root.path("skillScores").isObject()).isTrue();
    }

    @Test
    void chatJson_returnsMockJson() throws Exception {
        String result = llmClient.chatJson("system", "some resume text", "fast");

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.has("name")).isTrue();
        assertThat(root.has("summary")).isTrue();
    }

    @Test
    void mockResponse_extractsNameFromFirstLine() throws Exception {
        String result = llmClient.chat("system", "王小明\n工作经验丰富", "fast");

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.path("name").asText()).isEqualTo("王小明");
    }

    @Test
    void mockResponse_identifiesZhangSan() throws Exception {
        String result = llmClient.chat("system", "我叫张三，精通Java", "fast");

        JsonNode root = objectMapper.readTree(result);
        assertThat(root.path("name").asText()).isEqualTo("张三");
    }

}
