package com.hireinsight.agent;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class AgentDemoService {

    private final ConcurrentHashMap<String, ConversationState> conversations = new ConcurrentHashMap<>();

    public AgentDemoService() {
        CopyOnWriteArrayList<Map<String, Object>> messages = new CopyOnWriteArrayList<>();
        messages.add(message("m1", "assistant",
                "先告诉我你想查什么；如果是写操作，我只会先生成确认卡片。",
                "text", null));
        messages.add(message("m2", "user",
                "今天先帮我看看待处理候选人进展",
                "text", null));
        conversations.put("daily-ops", new ConversationState(
                "daily-ops",
                "今日招聘助手",
                "适合演示收件箱和 confirm-first。",
                messages
        ));
    }

    public Map<String, Object> listConversations() {
        List<Map<String, Object>> summaries = conversations.values().stream()
                .map(this::summary)
                .toList();
        return Map.of("conversations", summaries);
    }

    public Map<String, Object> getConversation(String conversationId) {
        ConversationState state = conversations.computeIfAbsent(conversationId, this::newConversation);
        return Map.of(
                "conversation", summary(state),
                "messages", new ArrayList<>(state.messages())
        );
    }

    public Map<String, Object> appendMessage(String conversationId, String content, String role) {
        ConversationState state = conversations.computeIfAbsent(conversationId, this::newConversation);
        String timestamp = Instant.now().toString();
        Map<String, Object> userMessage = Map.of(
                "id", "u-" + System.nanoTime(),
                "role", "user",
                "content", content,
                "messageType", "text",
                "createdAt", timestamp
        );
        Map<String, Object> assistantMessage = assistantReply(content, role);
        state.messages().add(userMessage);
        state.messages().add(assistantMessage);
        return Map.of(
                "conversationId", conversationId,
                "userMessage", userMessage,
                "assistantMessage", assistantMessage
        );
    }

    private ConversationState newConversation(String id) {
        return new ConversationState(id, "新助手会话", "confirm-first demo 会话", new CopyOnWriteArrayList<>());
    }

    private Map<String, Object> summary(ConversationState state) {
        Map<String, Object> last = state.messages().isEmpty()
                ? Map.of("content", "先告诉我你想查什么", "role", "assistant")
                : state.messages().get(state.messages().size() - 1);
        return Map.of(
                "id", state.id(),
                "title", state.title(),
                "description", state.description(),
                "lastMessagePreview", String.valueOf(last.get("content")),
                "lastMessageRole", String.valueOf(last.get("role")),
                "messageCount", state.messages().size(),
                "unreadCount", 0,
                "updatedAt", Instant.now().toString()
        );
    }

    private Map<String, Object> assistantReply(String content, String role) {
        if (looksLikeWriteIntent(content)) {
            return message("a-" + System.nanoTime(), "assistant",
                    "我把这条请求识别成写操作意图了，下面先给你确认卡片。",
                    "confirmation",
                    Map.of(
                            "status", "pending_confirm",
                            "title", "待确认写操作",
                            "summary", "当前 demo 只生成确认卡片，不会直接执行。",
                            "riskNote", "未写入真实业务数据",
                            "confirmLabel", "确认后再执行",
                            "cancelLabel", "保持现状",
                            "executed", false,
                            "fields", List.of(
                                    Map.of("label", "请求内容", "value", content),
                                    Map.of("label", "当前角色", "value", role)
                            )
                    ));
        }
        return message("a-" + System.nanoTime(), "assistant",
                "已收到。当前 Java rebuild 助手仍是 demo 口径，只提供只读解释和 confirm-first 确认卡。",
                "text", null);
    }

    private boolean looksLikeWriteIntent(String content) {
        return content.contains("推进")
                || content.contains("通知")
                || content.contains("创建")
                || content.contains("重置")
                || content.contains("修改")
                || content.contains("关闭");
    }

    private Map<String, Object> message(String id, String role, String content, String messageType, Map<String, Object> confirmation) {
        java.util.LinkedHashMap<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("id", id);
        payload.put("role", role);
        payload.put("content", content);
        payload.put("messageType", messageType);
        payload.put("createdAt", Instant.now().toString());
        if (confirmation != null) {
            payload.put("confirmation", confirmation);
        }
        return payload;
    }

    private record ConversationState(
            String id,
            String title,
            String description,
            CopyOnWriteArrayList<Map<String, Object>> messages
    ) {
    }
}
