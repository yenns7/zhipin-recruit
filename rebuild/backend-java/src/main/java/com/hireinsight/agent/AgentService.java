package com.hireinsight.agent;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.*;
import com.hireinsight.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.stream.Collectors;

@Service
public class AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentService.class);

    private static final String SYSTEM_PROMPT = """
            你是智聘（HireInsight）平台的 AI 招聘助手。
            你可以帮助用户搜索候选人、查看岗位、管理招聘流程等。请用中文回复。
            
            你有以下工具可用：
            
            ## 只读工具（直接执行）
            - search_candidates: 搜索候选人。参数: {"keyword": "搜索关键词"}
            - get_candidate: 获取候选人详情。参数: {"candidate_id": 数字}
            - list_jobs: 列出岗位。参数: {"status": "可选: active/closed"}
            - get_job: 获取岗位详情。参数: {"job_id": 数字}
            - list_pipeline_stages: 列出候选人流程阶段。参数: {"candidate_id": 数字, "job_id": 数字}
            - get_call_logs: 获取调用日志。参数: {}
            - list_conversations: 查看历史会话。参数: {}
            - get_help: 获取帮助信息。参数: {}
            
            ## 写工具（需要用户确认后才能执行）
            - update_pipeline_stage: 更新候选人流程阶段。参数: {"candidate_id": 数字, "job_id": 数字, "stage": "新阶段"}
            - send_notification: 发送通知。参数: {"user_id": 数字, "title": "标题", "message": "内容"}
            - create_interview: 创建面试。参数: {"candidate_id": 数字, "job_id": 数字}
            - update_candidate: 更新候选人信息。参数: {"candidate_id": 数字, "field": "字段名", "value": "新值"}
            
            请严格按照以下 JSON 格式回复（只输出 JSON，不要包含其他文字）：
            
            如果需要调用工具：
            {"thought": "你的思考过程...", "tool": "工具名", "args": {"参数名": "参数值"}}
            
            如果是最终回答：
            {"answer": "你的回答"}
            
            如果是写工具，先输出确认请求：
            {"thought": "你准备做什么操作", "tool": "工具名", "args": {"参数名": "参数值"}, "confirm": true}
            """;

    private static final int MAX_REACT_LOOP = 10;

    private final LlmClient llmClient;
    private final ObjectMapper objectMapper;
    private final ConversationRepository conversationRepository;
    private final ConversationMessageRepository conversationMessageRepository;
    private final AgentCallLogRepository agentCallLogRepository;
    private final CandidateRepository candidateRepository;
    private final JobRepository jobRepository;
    private final PipelineStageRepository pipelineStageRepository;
    private final NotificationRepository notificationRepository;
    private final InterviewSessionRepository interviewSessionRepository;

    // In-memory store for pending write tool confirmations
    private final ConcurrentHashMap<String, PendingWrite> pendingWrites = new ConcurrentHashMap<>();

    public AgentService(LlmClient llmClient,
                        ObjectMapper objectMapper,
                        ConversationRepository conversationRepository,
                        ConversationMessageRepository conversationMessageRepository,
                        AgentCallLogRepository agentCallLogRepository,
                        CandidateRepository candidateRepository,
                        JobRepository jobRepository,
                        PipelineStageRepository pipelineStageRepository,
                        NotificationRepository notificationRepository,
                        InterviewSessionRepository interviewSessionRepository) {
        this.llmClient = llmClient;
        this.objectMapper = objectMapper;
        this.conversationRepository = conversationRepository;
        this.conversationMessageRepository = conversationMessageRepository;
        this.agentCallLogRepository = agentCallLogRepository;
        this.candidateRepository = candidateRepository;
        this.jobRepository = jobRepository;
        this.pipelineStageRepository = pipelineStageRepository;
        this.notificationRepository = notificationRepository;
        this.interviewSessionRepository = interviewSessionRepository;
    }

    /**
     * Process a chat message with SSE streaming, running the ReAct loop.
     */
    @Transactional
    public void processChat(Long userId, Long conversationId, String message,
                            SseEmitter emitter, String route) {
        long startTime = System.currentTimeMillis();
        try {
            // 1. Resolve or create conversation
            Conversation conversation;
            boolean isNew = false;
            if (conversationId == null) {
                conversation = Conversation.builder()
                        .userId(userId)
                        .title(message.length() > 100 ? message.substring(0, 100) : message)
                        .status("ACTIVE")
                        .build();
                conversation = conversationRepository.save(conversation);
                isNew = true;
                // Emit conversation_started
                Map<String, Object> startedEvent = new HashMap<>();
                startedEvent.put("type", "conversation_started");
                startedEvent.put("id", conversation.getId());
                emitEvent(emitter, "conversation_started", startedEvent);
            } else {
                conversation = conversationRepository.findById(conversationId)
                        .orElseThrow(() -> new RuntimeException("Conversation not found: " + conversationId));
            }

            Long convId = conversation.getId();

            // 2. Save user message
            ConversationMessage userMsg = ConversationMessage.builder()
                    .conversationId(convId)
                    .role("USER")
                    .content(message)
                    .build();
            conversationMessageRepository.save(userMsg);

            // 3. Build conversation history for LLM context
            List<ConversationMessage> history = conversationMessageRepository
                    .findByConversationIdOrderByCreatedAtAsc(convId);

            // 4. Run ReAct loop
            String finalAnswer = runReActLoop(userId, convId, history, emitter, route,
                    startTime);

            // 5. Save assistant message
            ConversationMessage assistantMsg = ConversationMessage.builder()
                    .conversationId(convId)
                    .role("ASSISTANT")
                    .content(finalAnswer)
                    .build();
            conversationMessageRepository.save(assistantMsg);

            // 6. Auto-generate title on first interaction
            if (isNew && conversation.getTitle().length() > 50) {
                String title = message.length() > 50 ? message.substring(0, 50) + "..." : message;
                conversation.setTitle(title);
                conversationRepository.save(conversation);
            }

            // 7. Emit done event
            emitEvent(emitter, "done",
                    Map.of("type", "done", "answer", finalAnswer));

        } catch (Exception e) {
            log.error("Agent chat error", e);
            emitEvent(emitter, "error",
                    Map.of("type", "error", "message", e.getMessage()));
        } finally {
            try {
                emitter.complete();
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Run the ReAct reasoning loop.
     */
    private String runReActLoop(Long userId, Long convId,
                                 List<ConversationMessage> history,
                                 SseEmitter emitter, String route,
                                 long startTime) {
        StringBuilder fullConversation = new StringBuilder();
        for (ConversationMessage msg : history) {
            fullConversation.append(msg.getRole()).append(": ").append(msg.getContent()).append("\n");
        }

        String systemPrompt = buildSystemPrompt(history);

        for (int step = 0; step < MAX_REACT_LOOP; step++) {
            long stepStart = System.currentTimeMillis();

            // Call LLM
            String llmResponse;
            try {
                llmResponse = llmClient.chat(systemPrompt, fullConversation.toString(), route);
            } catch (Exception e) {
                log.error("LLM call failed at step {}", step, e);
                // Log the error
                saveCallLog(userId, convId, "react_loop", null,
                        mapOf("step", step, "error", e.getMessage()),
                        "llm_error", System.currentTimeMillis() - stepStart, null, 0, 0);
                return "抱歉，AI 服务暂时不可用，请稍后重试。";
            }

            log.debug("LLM response step {}: {}", step, llmResponse);

            // Parse LLM response
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(llmResponse, Map.class);

                // Emit thought
                String thought = (String) parsed.getOrDefault("thought", "");
                if (!thought.isBlank()) {
                    emitEvent(emitter, "thought",
                            mapOf("type", "thought", "text", thought));
                }

                // Check if final answer
                if (parsed.containsKey("answer")) {
                    String answer = (String) parsed.get("answer");
                    // Emit tokens character by character for streaming effect
                    emitTokens(emitter, answer);
                    // Log success
                    saveCallLog(userId, convId, "react_answer", null,
                            mapOf("answer", answer, "steps", step + 1),
                            "success", System.currentTimeMillis() - startTime, null, 0, 0);
                    return answer;
                }

                // Check if tool call
                String tool = (String) parsed.get("tool");
                if (tool == null || tool.isBlank()) {
                    // No tool and no answer - try again
                    fullConversation.append("ASSISTANT: ").append(llmResponse).append("\n");
                    fullConversation.append("USER: 请给出最终回答或调用工具。\n");
                    continue;
                }

                @SuppressWarnings("unchecked")
                Map<String, Object> args = (Map<String, Object>) parsed.getOrDefault("args", new HashMap<>());

                boolean isConfirm = Boolean.TRUE.equals(parsed.get("confirm"));
                boolean isWriteTool = isWriteTool(tool);

                // Emit tool_call event
                emitEvent(emitter, "tool_call",
                        mapOf("type", "tool_call", "tool", tool, "args", args));

                if (isWriteTool) {
                    // Write tool - generate a confirmation key and emit confirm_required
                    String confirmKey = "write_" + convId + "_" + System.nanoTime();

                    // Build a summary for the confirmation card
                    String summary = buildWriteSummary(tool, args);

                    PendingWrite pending = new PendingWrite(tool, args, userId, convId);
                    pendingWrites.put(confirmKey, pending);

                    emitEvent(emitter, "confirm_required",
                            mapOf(
                                    "type", "confirm_required",
                                    "tool", tool,
                                    "args", args,
                                    "summary", summary,
                                    "confirmKey", confirmKey
                            ));

                    // Save the assistant message with tool call info
                    ConversationMessage toolMsg = ConversationMessage.builder()
                            .conversationId(convId)
                            .role("ASSISTANT")
                            .content("提议执行写操作: " + tool)
                            .toolName(tool)
                            .toolArgs(toJsonString(args))
                            .build();
                    conversationMessageRepository.save(toolMsg);

                    // Wait for user confirmation via POST /agent/execute
                    // The ReAct loop pauses here - the user will call execute which
                    // will complete the conversation
                    return "写操作正在等待确认: " + tool;
                }

                // Read tool - execute immediately
                Map<String, Object> result = executeReadTool(tool, args);

                // Emit tool_result event
                emitEvent(emitter, "tool_result",
                        mapOf("type", "tool_result", "tool", tool, "result", result));

                // Save tool message
                ConversationMessage toolMsg = ConversationMessage.builder()
                        .conversationId(convId)
                        .role("TOOL")
                        .content("工具执行结果: " + tool)
                        .toolName(tool)
                        .toolArgs(toJsonString(args))
                        .toolResult(toJsonString(result))
                        .build();
                conversationMessageRepository.save(toolMsg);

                // Add observation to conversation for next LLM iteration
                fullConversation.append("ASSISTANT: ").append(thought).append("\n");
                fullConversation.append("TOOL (").append(tool).append("): ").append(toJsonString(result)).append("\n");

                // Log tool execution
                saveCallLog(userId, convId, "tool_execute", tool,
                        mapOf("args", args, "result", result),
                        "success", System.currentTimeMillis() - stepStart, null, 0, 0);

            } catch (JsonProcessingException e) {
                log.warn("Failed to parse LLM response as JSON: {}", llmResponse);
                // If it's not JSON, treat it as a direct answer
                emitTokens(emitter, llmResponse);
                saveCallLog(userId, convId, "react_answer", null,
                        mapOf("answer", llmResponse, "steps", step + 1),
                        "success", System.currentTimeMillis() - startTime, null, 0, 0);
                return llmResponse;
            }
        }

        // Max steps reached
        String fallback = "我已经分析了可用信息，但由于步骤限制无法完成完整分析。请尝试更具体的问题。";
        emitTokens(emitter, fallback);
        return fallback;
    }

    /**
     * Execute a confirmed write tool.
     */
    @Transactional
    public Map<String, Object> executeWriteTool(String confirmKey, Long userId) {
        PendingWrite pending = pendingWrites.remove(confirmKey);
        if (pending == null) {
            return mapOf("error", "确认已过期或无效");
        }
        if (!pending.userId.equals(userId)) {
            return mapOf("error", "无权限执行此操作");
        }

        long start = System.currentTimeMillis();
        try {
            Map<String, Object> result = doExecuteWriteTool(pending.tool, pending.args);

            // Save tool result message
            ConversationMessage toolMsg = ConversationMessage.builder()
                    .conversationId(pending.conversationId)
                    .role("TOOL")
                    .content("写工具执行结果: " + pending.tool)
                    .toolName(pending.tool)
                    .toolArgs(toJsonString(pending.args))
                    .toolResult(toJsonString(result))
                    .build();
            conversationMessageRepository.save(toolMsg);

            saveCallLog(userId, pending.conversationId, "tool_execute", pending.tool,
                    mapOf("args", pending.args, "result", result),
                    "success", System.currentTimeMillis() - start, null, 0, 0);

            return mapOf("ok", true, "result", result);
        } catch (Exception e) {
            log.error("Failed to execute write tool: {}", pending.tool, e);
            saveCallLog(userId, pending.conversationId, "tool_execute", pending.tool,
                    mapOf("args", pending.args, "error", e.getMessage()),
                    "error", System.currentTimeMillis() - start, null, 0, 0);
            return mapOf("ok", false, "error", e.getMessage());
        }
    }

    // ==================== Read Tool Execution ====================

    private Map<String, Object> executeReadTool(String tool, Map<String, Object> args) {
        return switch (tool) {
            case "search_candidates" -> searchCandidates(args);
            case "get_candidate" -> getCandidate(args);
            case "list_jobs" -> listJobs(args);
            case "get_job" -> getJob(args);
            case "list_pipeline_stages" -> listPipelineStages(args);
            case "get_call_logs" -> getCallLogs(args);
            case "list_conversations" -> listConversations(args);
            case "get_help" -> getHelp();
            default -> Map.<String, Object>of("error", "未知工具: " + tool);
        };
    }

    private Map<String, Object> searchCandidates(Map<String, Object> args) {
        String keyword = (String) args.getOrDefault("keyword", "");
        List<Candidate> candidates;
        if (keyword.isBlank()) {
            candidates = candidateRepository.findAll();
        } else {
            try {
                candidates = candidateRepository.findBySkillTag(keyword);
            } catch (Exception e) {
                candidates = candidateRepository.findAll();
            }
        }
        List<Map<String, Object>> items = candidates.stream()
                .limit(20)
                .map(c -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", c.getId());
                    m.put("name", c.getNameMasked());
                    m.put("status", c.getParseStatus());
                    return m;
                })
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "search_candidates");
        result.put("count", items.size());
        result.put("candidates", items);
        return result;
    }

    private Map<String, Object> getCandidate(Map<String, Object> args) {
        Object idObj = args.get("candidate_id");
        if (idObj == null) return Map.<String, Object>of("error", "缺少 candidate_id");
        Long id = toLong(idObj);
        Optional<Candidate> opt = candidateRepository.findById(id);
        if (opt.isPresent()) {
            Candidate c = opt.get();
            Map<String, Object> candidate = new HashMap<>();
            candidate.put("id", c.getId());
            candidate.put("name", c.getNameMasked());
            candidate.put("email", c.getEmailMasked());
            candidate.put("parseStatus", c.getParseStatus());
            Map<String, Object> result = new HashMap<>();
            result.put("tool", "get_candidate");
            result.put("candidate", candidate);
            return result;
        }
        return Map.<String, Object>of("error", "候选人不存在");
    }

    private Map<String, Object> listJobs(Map<String, Object> args) {
        String status = (String) args.getOrDefault("status", "");
        List<Job> jobs;
        if (!status.isBlank()) {
            jobs = jobRepository.findByStatus(status);
        } else {
            jobs = jobRepository.findAll();
        }
        List<Map<String, Object>> items = jobs.stream()
                .limit(20)
                .map(j -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", j.getId());
                    m.put("title", j.getTitle());
                    m.put("status", j.getStatus());
                    return m;
                })
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "list_jobs");
        result.put("count", items.size());
        result.put("jobs", items);
        return result;
    }

    private Map<String, Object> getJob(Map<String, Object> args) {
        Object idObj = args.get("job_id");
        if (idObj == null) return Map.<String, Object>of("error", "缺少 job_id");
        Long id = toLong(idObj);
        Optional<Job> opt = jobRepository.findById(id);
        if (opt.isPresent()) {
            Job j = opt.get();
            Map<String, Object> job = new HashMap<>();
            job.put("id", j.getId());
            job.put("title", j.getTitle());
            job.put("status", j.getStatus());
            job.put("jdText", j.getJdText());
            Map<String, Object> result = new HashMap<>();
            result.put("tool", "get_job");
            result.put("job", job);
            return result;
        }
        return Map.<String, Object>of("error", "岗位不存在");
    }

    private Map<String, Object> listPipelineStages(Map<String, Object> args) {
        Object cId = args.get("candidate_id");
        Object jId = args.get("job_id");
        if (cId == null || jId == null) return Map.<String, Object>of("error", "缺少 candidate_id 或 job_id");
        List<PipelineStage> stages = pipelineStageRepository
                .findByCandidateIdAndJobIdOrderByTsDesc(toLong(cId), toLong(jId));
        List<Map<String, Object>> items = stages.stream()
                .map(s -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", s.getId());
                    m.put("stage", s.getStage());
                    m.put("updatedAt", s.getTs() != null ? s.getTs().toString() : null);
                    return m;
                })
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "list_pipeline_stages");
        result.put("stages", items);
        return result;
    }

    private Map<String, Object> getCallLogs(Map<String, Object> args) {
        List<AgentCallLog> logs = agentCallLogRepository.findAll();
        List<Map<String, Object>> items = logs.stream()
                .limit(20)
                .map(l -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", l.getId());
                    m.put("action", l.getAction());
                    m.put("toolName", l.getToolName());
                    m.put("status", l.getStatus());
                    m.put("createdAt", l.getCreatedAt() != null ? l.getCreatedAt().toString() : null);
                    return m;
                })
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "get_call_logs");
        result.put("count", items.size());
        result.put("logs", items);
        return result;
    }

    private Map<String, Object> listConversations(Map<String, Object> args) {
        List<Conversation> conversations = conversationRepository.findAll();
        List<Map<String, Object>> items = conversations.stream()
                .limit(20)
                .map(c -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", c.getId());
                    m.put("title", c.getTitle());
                    m.put("status", c.getStatus());
                    m.put("createdAt", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
                    return m;
                })
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "list_conversations");
        result.put("count", items.size());
        result.put("conversations", items);
        return result;
    }

    private Map<String, Object> getHelp() {
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "get_help");
        result.put("help", "你好！我是智聘 AI 招聘助手。我可以帮你：\n" +
                "1. 搜索候选人（search_candidates）\n" +
                "2. 查看候选人详情（get_candidate）\n" +
                "3. 浏览岗位列表（list_jobs）\n" +
                "4. 查看岗位详情（get_job）\n" +
                "5. 查看候选人流程（list_pipeline_stages）\n" +
                "6. 查看系统日志（get_call_logs）\n" +
                "7. 查看历史会话（list_conversations）\n" +
                "写操作需要你的确认才能执行。"
        );
        return result;
    }

    // ==================== Write Tool Execution ====================

    private Map<String, Object> doExecuteWriteTool(String tool, Map<String, Object> args) {
        return switch (tool) {
            case "update_pipeline_stage" -> updatePipelineStage(args);
            case "send_notification" -> sendNotification(args);
            case "create_interview" -> createInterview(args);
            case "update_candidate" -> updateCandidate(args);
            default -> Map.<String, Object>of("error", "未知写工具: " + tool);
        };
    }

    private Map<String, Object> updatePipelineStage(Map<String, Object> args) {
        Object cId = args.get("candidate_id");
        Object jId = args.get("job_id");
        String stage = (String) args.get("stage");
        if (cId == null || jId == null || stage == null || stage.isBlank()) {
            return Map.<String, Object>of("error", "缺少必要参数");
        }
        PipelineStage newStage = PipelineStage.builder()
                .candidateId(toLong(cId))
                .jobId(toLong(jId))
                .stage(stage)
                .build();
        newStage = pipelineStageRepository.save(newStage);
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "update_pipeline_stage");
        result.put("stageId", newStage.getId());
        result.put("stage", stage);
        result.put("success", true);
        return result;
    }

    private Map<String, Object> sendNotification(Map<String, Object> args) {
        Object uId = args.get("user_id");
        String title = (String) args.get("title");
        String message = (String) args.get("message");
        if (uId == null || title == null || title.isBlank()) {
            return Map.<String, Object>of("error", "缺少必要参数");
        }
        Notification notification = Notification.builder()
                .userId(toLong(uId))
                .title(title)
                .message(message)
                .type("agent")
                .build();
        notification = notificationRepository.save(notification);
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "send_notification");
        result.put("notificationId", notification.getId());
        result.put("success", true);
        return result;
    }

    private Map<String, Object> createInterview(Map<String, Object> args) {
        Object cId = args.get("candidate_id");
        Object jId = args.get("job_id");
        if (cId == null || jId == null) {
            return Map.<String, Object>of("error", "缺少 candidate_id 或 job_id");
        }
        InterviewSession session = InterviewSession.builder()
                .candidateId(toLong(cId))
                .jobId(toLong(jId))
                .status("pending")
                .build();
        session = interviewSessionRepository.save(session);
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "create_interview");
        result.put("interviewId", session.getId());
        result.put("success", true);
        return result;
    }

    private Map<String, Object> updateCandidate(Map<String, Object> args) {
        Object cId = args.get("candidate_id");
        String field = (String) args.get("field");
        String value = (String) args.get("value");
        if (cId == null || field == null) {
            return Map.<String, Object>of("error", "缺少必要参数");
        }
        Optional<Candidate> opt = candidateRepository.findById(toLong(cId));
        if (opt.isEmpty()) {
            return Map.<String, Object>of("error", "候选人不存在");
        }
        Candidate candidate = opt.get();
        switch (field) {
            case "name" -> candidate.setNameMasked(value);
            case "email" -> candidate.setEmailMasked(value);
            case "parseStatus" -> candidate.setParseStatus(value);
            default -> {
                return Map.<String, Object>of("error", "不支持更新字段: " + field);
            }
        }
        candidateRepository.save(candidate);
        Map<String, Object> result = new HashMap<>();
        result.put("tool", "update_candidate");
        result.put("candidateId", candidate.getId());
        result.put("field", field);
        result.put("success", true);
        return result;
    }

    // ==================== Helpers ====================

    private boolean isWriteTool(String tool) {
        return List.of("update_pipeline_stage", "send_notification",
                "create_interview", "update_candidate").contains(tool);
    }

    private String buildWriteSummary(String tool, Map<String, Object> args) {
        return switch (tool) {
            case "update_pipeline_stage" -> "将候选人 " + args.get("candidate_id") +
                    " 在岗位 " + args.get("job_id") + " 的流程推进至「" + args.get("stage") + "」阶段";
            case "send_notification" -> "向用户 " + args.get("user_id") +
                    " 发送通知：「" + args.get("title") + "」";
            case "create_interview" -> "为候选人 " + args.get("candidate_id") +
                    " 在岗位 " + args.get("job_id") + " 创建面试";
            case "update_candidate" -> "更新候选人 " + args.get("candidate_id") +
                    " 的 " + args.get("field") + " 字段";
            default -> "执行 " + tool + " 操作";
        };
    }

    private String buildSystemPrompt(List<ConversationMessage> history) {
        StringBuilder sb = new StringBuilder(SYSTEM_PROMPT);
        // Add conversation context
        if (!history.isEmpty()) {
            sb.append("\n\n历史消息：\n");
            for (ConversationMessage msg : history) {
                String role = switch (msg.getRole()) {
                    case "USER" -> "用户";
                    case "ASSISTANT" -> "助手";
                    case "TOOL" -> "工具(" + (msg.getToolName() != null ? msg.getToolName() : "unknown") + ")";
                    default -> msg.getRole();
                };
                String content = msg.getContent() != null ? msg.getContent() : "";
                if (content.length() > 500) {
                    content = content.substring(0, 500) + "...";
                }
                sb.append(role).append(": ").append(content).append("\n");
            }
        }
        return sb.toString();
    }

    private void saveCallLog(Long userId, Long conversationId, String action,
                              String toolName, Object detail, String status,
                              long durationMs, String model,
                              int promptTokens, int completionTokens) {
        try {
            AgentCallLog log = AgentCallLog.builder()
                    .userId(userId)
                    .conversationId(conversationId)
                    .action(action)
                    .toolName(toolName)
                    .inputJson(detail != null ? toJsonString(detail) : null)
                    .status(status)
                    .durationMs(durationMs)
                    .model(model)
                    .promptTokens(promptTokens)
                    .completionTokens(completionTokens)
                    .build();
            agentCallLogRepository.save(log);
        } catch (Exception e) {
            log.warn("Failed to save call log", e);
        }
    }

    private void emitEvent(SseEmitter emitter, String eventName, Map<String, Object> data) {
        try {
            String json = objectMapper.writeValueAsString(data);
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(json));
        } catch (IOException e) {
            log.warn("Failed to emit SSE event: {}", eventName, e);
        }
    }

    private void emitTokens(SseEmitter emitter, String text) {
        // Emit text in chunks for streaming effect
        if (text == null || text.isBlank()) return;
        // Emit in small chunks (4-8 chars) for natural streaming feel
        int chunkSize = 4;
        for (int i = 0; i < text.length(); i += chunkSize) {
            int end = Math.min(i + chunkSize, text.length());
            String chunk = text.substring(i, end);
            emitEvent(emitter, "token",
                    Map.of("type", "token", "text", chunk));
            try {
                Thread.sleep(10); // small delay for streaming effect
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private Long toLong(Object obj) {
        if (obj instanceof Number n) return n.longValue();
        if (obj instanceof String s) return Long.parseLong(s);
        return null;
    }

    /**
     * Create a Map<String, Object> with alternating key-value pairs.
     * Safe alternative to Map.of() when values have mixed types.
     */
    private static Map<String, Object> mapOf(Object... entries) {
        if (entries.length == 0) return new HashMap<>();
        Map<String, Object> result = new HashMap<>();
        for (int i = 0; i < entries.length; i += 2) {
            result.put(String.valueOf(entries[i]), entries[i + 1]);
        }
        return result;
    }

    private String toJsonString(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return obj.toString();
        }
    }

    /**
     * Get the system prompt for the architecture endpoint.
     */
    public String getSystemPrompt() {
        return SYSTEM_PROMPT;
    }

    /**
     * Get tool definitions for the architecture endpoint.
     */
    public List<Map<String, Object>> getToolDefinitions() {
        List<Map<String, Object>> allTools = new ArrayList<>();

        // Read tools
        allTools.add(toolDefMap("search_candidates", "搜索候选人",
                Map.<String, Object>of("keyword", "string"), "read"));
        allTools.add(toolDefMap("get_candidate", "获取候选人详情",
                Map.<String, Object>of("candidate_id", "integer"), "read"));
        allTools.add(toolDefMap("list_jobs", "列出岗位",
                Map.<String, Object>of("status", "string (optional)"), "read"));
        allTools.add(toolDefMap("get_job", "获取岗位详情",
                Map.<String, Object>of("job_id", "integer"), "read"));
        allTools.add(toolDefMap("list_pipeline_stages", "查看候选人流程阶段",
                Map.<String, Object>of("candidate_id", "integer", "job_id", "integer"), "read"));
        allTools.add(toolDefMap("get_call_logs", "查看系统调用日志",
                Map.<String, Object>of(), "read"));
        allTools.add(toolDefMap("list_conversations", "查看历史会话",
                Map.<String, Object>of(), "read"));
        allTools.add(toolDefMap("get_help", "获取帮助信息",
                Map.<String, Object>of(), "read"));

        // Write tools
        allTools.add(writeToolDefMap("update_pipeline_stage", "更新候选人流程阶段",
                Map.<String, Object>of("candidate_id", "integer", "job_id", "integer", "stage", "string")));
        allTools.add(writeToolDefMap("send_notification", "发送通知",
                Map.<String, Object>of("user_id", "integer", "title", "string", "message", "string")));
        allTools.add(writeToolDefMap("create_interview", "创建面试",
                Map.<String, Object>of("candidate_id", "integer", "job_id", "integer")));
        allTools.add(writeToolDefMap("update_candidate", "更新候选人信息",
                Map.<String, Object>of("candidate_id", "integer", "field", "string", "value", "string")));

        return allTools;
    }

    private Map<String, Object> toolDefMap(String name, String desc, Map<String, Object> params, String type) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", name);
        m.put("description", desc);
        m.put("params", params);
        m.put("type", type);
        return m;
    }

    private Map<String, Object> writeToolDefMap(String name, String desc, Map<String, Object> params) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", name);
        m.put("description", desc);
        m.put("params", params);
        m.put("type", "write");
        m.put("requires_confirmation", true);
        return m;
    }

    // ==================== Inner Types ====================

    private record PendingWrite(String tool, Map<String, Object> args, Long userId, Long conversationId) {}
}
