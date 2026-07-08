package com.hireinsight.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * LLM Client facade supporting Fast/Think/Pro routing and
 * OpenAI / DeepSeek compatible APIs.
 *
 * Routes:
 *   fast  — simple/structured tasks (cheapest model)
 *   think — moderate complexity
 *   pro   — high-difficulty reasoning
 */
@Service
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final LlmConfig config;

    public LlmClient(LlmConfig config, ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(config.getTimeout()))
                .build();
    }

    /**
     * Chat completion with explicit route.
     */
    public String chat(String systemPrompt, String userPrompt, String route) {
        String model = resolveModel(route);
        ObjectNode body = buildBody(systemPrompt, userPrompt, model);

        return doRequest(body);
    }

    /**
     * Chat completion with JSON response format (enforced via system prompt).
     */
    public String chatJson(String systemPrompt, String userPrompt, String route) {
        String model = resolveModel(route);
        ObjectNode body = buildBody(systemPrompt, userPrompt, model);
        body.put("response_format", objectMapper.createObjectNode()
                .put("type", "json_object"));

        return doRequest(body);
    }

    /**
     * Resolve model name for the given route, respecting app.llm.provider
     * and app.llm.model-fast/think/pro config. Falls back to provider-specific
     * defaults when config values are empty.
     */
    private String resolveModel(String route) {
        String r = (route == null) ? "fast" : route;
        String model = switch (r) {
            case "think" -> config.getModelThink();
            case "pro" -> config.getModelPro();
            default -> config.getModelFast();
        };

        // If config value is empty, fall back to provider-based default
        if (model == null || model.isBlank()) {
            String provider = config.getProvider();
            model = switch (r) {
                case "think" -> "deepseek".equalsIgnoreCase(provider) ? "deepseek-reasoner" : "gpt-4o";
                case "pro" -> "deepseek".equalsIgnoreCase(provider) ? "deepseek-chat" : "o3-mini";
                default -> "deepseek".equalsIgnoreCase(provider) ? "deepseek-chat" : "gpt-4o-mini";
            };
        }
        return model;
    }

    private ObjectNode buildBody(String systemPrompt, String userPrompt, String model) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", model);

        ArrayNode messages = body.putArray("messages");
        ObjectNode systemMsg = messages.addObject();
        systemMsg.put("role", "system");
        systemMsg.put("content", systemPrompt);
        ObjectNode userMsg = messages.addObject();
        userMsg.put("role", "user");
        userMsg.put("content", userPrompt);

        body.put("temperature", config.getTemperature());
        return body;
    }

    private String doRequest(ObjectNode body) {
        String apiUrl = config.getApiUrl();
        String apiKey = config.getApiKey();

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("LLM API key is not configured; returning mock response");
            return mockResponse(body);
        }

        int maxRetry = config.getMaxRetry();
        Exception lastException = null;

        for (int attempt = 1; attempt <= maxRetry; attempt++) {
            try {
                String jsonBody = objectMapper.writeValueAsString(body);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeout()))
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                        .build();

                HttpResponse<String> response = httpClient.send(request,
                        HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    JsonNode root = objectMapper.readTree(response.body());
                    JsonNode choice = root.path("choices").get(0);
                    if (choice != null) {
                        String content = choice.path("message").path("content").asText("").trim();
                        if (!content.isEmpty()) {
                            return content;
                        }
                    }
                    log.warn("LLM returned empty content, attempt {}/{}", attempt, maxRetry);
                } else {
                    log.warn("LLM returned HTTP {}: {}, attempt {}/{}",
                            response.statusCode(), response.body(), attempt, maxRetry);
                }
            } catch (IOException | InterruptedException e) {
                lastException = e;
                log.warn("LLM call failed (attempt {}/{}): {}", attempt, maxRetry, e.getMessage());
                if (e instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("LLM call interrupted", e);
                }
            }

            if (attempt < maxRetry) {
                try {
                    Thread.sleep((long) Math.pow(2, attempt) * 1000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        throw new RuntimeException("LLM call failed after " + maxRetry + " retries"
                + (lastException != null ? ": " + lastException.getMessage() : ""));
    }

    /**
     * Return a mock JSON response when no API key is configured,
     * allowing the app to function in dev/demo mode.
     */
    private String mockResponse(ObjectNode body) {
        String userContent = "";
        try {
            JsonNode messages = body.get("messages");
            if (messages != null && messages.size() > 1) {
                userContent = messages.get(1).path("content").asText("");
            }
        } catch (Exception ignored) {}

        // Build a mock resume JSON from the raw text
        String name = "Unknown";
        String email = "";
        String phone = "";
        if (userContent.contains("张三")) { name = "张三"; }
        else if (userContent.contains("李四")) { name = "李四"; }
        else {
            // Try to extract first line as name
            String[] lines = userContent.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (!line.isEmpty() && line.length() < 20) {
                    name = line;
                    break;
                }
            }
        }

        try {
            ObjectNode mock = objectMapper.createObjectNode();
            mock.put("name", name);
            mock.put("email", email);
            mock.put("phone", phone);
            mock.put("summary", "Mock parsed resume (LLM not configured)");
            mock.put("intent_city", "");
            mock.set("education", objectMapper.createArrayNode());
            mock.set("experience", objectMapper.createArrayNode());
            mock.set("projects", objectMapper.createArrayNode());
            mock.set("certifications", objectMapper.createArrayNode());
            mock.set("languages", objectMapper.createArrayNode());
            mock.put("additional_info", "");
            mock.set("skills", objectMapper.createArrayNode());
            mock.set("skillScores", objectMapper.createObjectNode());
            return objectMapper.writeValueAsString(mock);
        } catch (Exception e) {
            return "{}";
        }
    }

    public record CallResult(String content, int promptTokens, int completionTokens, long durationMs) {}
}
