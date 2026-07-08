package com.hireinsight.interview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.hireinsight.llm.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
public class InterviewAIService {

    private static final Logger log = LoggerFactory.getLogger(InterviewAIService.class);

    private final ObjectMapper objectMapper;
    private final LlmClient llmClient;

    public InterviewAIService(ObjectMapper objectMapper, LlmClient llmClient) {
        this.objectMapper = objectMapper;
        this.llmClient = llmClient;
    }

    /**
     * Generate interview questions from JD text using LLM.
     * Falls back to template questions if LLM is unavailable or returns unexpected format.
     */
    public List<InterviewQuestion> generateQuestions(String jdText, int count) {
        if (jdText == null || jdText.isBlank()) {
            return generateDefaultQuestions(count);
        }

        try {
            String systemPrompt = "你是一位专业的面试官，擅长根据职位描述（JD）生成有针对性的面试问题。" +
                    "请严格按照JSON格式输出，不要输出任何其他内容。";

            String userPrompt = "根据以下职位描述，生成" + count + "道面试问题。\n" +
                    "职位描述：\n" + jdText + "\n\n" +
                    "请输出JSON数组，每个元素包含以下字段：\n" +
                    "- id: 唯一标识，格式为\"q-数字\"\n" +
                    "- question: 问题内容（中文）\n" +
                    "- type: 问题类型，取值为\"technical\"（技术）、\"behavioral\"（行为）或\"cultural\"（文化）\n" +
                    "- expectedKeywords: 期望答案中出现的关键词，用逗号分隔\n" +
                    "- maxScore: 满分分值（整数，范围15-25）\n\n" +
                    "要求：\n" +
                    "1. 问题必须与职位描述高度相关\n" +
                    "2. 技术问题应覆盖JD中提到的核心技术栈\n" +
                    "3. 行为问题考察候选人的团队协作和问题解决能力\n" +
                    "4. 文化问题考察候选人的价值观匹配度\n" +
                    "5. 确保问题具体、可评估";

            String json = llmClient.chatJson(systemPrompt, userPrompt, "fast");
            List<InterviewQuestion> questions = parseQuestionsFromJson(json, count);
            if (!questions.isEmpty()) {
                return questions;
            }
        } catch (Exception e) {
            log.warn("LLM question generation failed, falling back to templates: {}", e.getMessage());
        }

        // Fall back to keyword-extraction-based question generation
        return generateQuestionsFromJd(jdText, count);
    }

    /**
     * Evaluate answers using LLM.
     * Returns evaluation with score (1-5 scale), strengths, concerns, and pass recommendation.
     * Fall back to basic evaluation if LLM is unavailable.
     */
    public InterviewEvaluation evaluateAnswers(List<QA> qaList) {
        if (qaList == null || qaList.isEmpty()) {
            return new InterviewEvaluation(0, "未提供回答", List.of(), List.of("未提供任何回答"), false);
        }

        try {
            String systemPrompt = "你是一位专业的面试评估专家，严格按照JSON格式输出评估结果。";

            StringBuilder sb = new StringBuilder();
            sb.append("请评估以下面试回答，为每个回答打分（1-5分），并给出整体评估。\n\n");
            for (int i = 0; i < qaList.size(); i++) {
                QA qa = qaList.get(i);
                sb.append("问题").append(i + 1).append("：").append(qa.getQuestion()).append("\n");
                sb.append("回答").append(i + 1).append("：").append(qa.getAnswer()).append("\n\n");
            }
            sb.append("请输出以下JSON格式（不要输出其他内容）：\n");
            sb.append("{\n");
            sb.append("  \"overallScore\": <1-5的整数>,\n");
            sb.append("  \"summary\": \"总体评价（中文）\",\n");
            sb.append("  \"strengths\": [\"优势1\", \"优势2\", ...],\n");
            sb.append("  \"concerns\": [\"顾虑1\", \"顾虑2\", ...],\n");
            sb.append("  \"passRecommended\": true/false,\n");
            sb.append("  \"reasonTags\": [\"标签1\", \"标签2\", ...]\n");
            sb.append("}\n\n");
            sb.append("评分标准：\n");
            sb.append("- 5分：回答非常出色，超出预期\n");
            sb.append("- 4分：回答良好，满足要求\n");
            sb.append("- 3分：回答一般，基本满足要求\n");
            sb.append("- 2分：回答较差，部分满足要求\n");
            sb.append("- 1分：回答很差，未满足要求\n\n");
            sb.append("推荐通过标准：平均分 >= 3.5分则 passRecommended 为 true\n\n");
            sb.append("reasonTags取值示例：strong_technical, weak_communication, good_experience_match, lacks_depth, team_fit, needs_clarification");

            String json = llmClient.chatJson(systemPrompt, sb.toString(), "think");
            InterviewEvaluation evaluation = parseEvaluationFromJson(json);
            if (evaluation != null) {
                return evaluation;
            }
        } catch (Exception e) {
            log.warn("LLM evaluation failed, falling back to basic evaluation: {}", e.getMessage());
        }

        // Fall back to basic evaluation
        return basicEvaluation(qaList);
    }

    /**
     * Build AI report as JSON string.
     */
    public String buildReport(List<QA> qaList, int score) {
        try {
            String systemPrompt = "你是一位专业的面试报告撰写专家，严格按照JSON格式输出。";

            StringBuilder sb = new StringBuilder();
            sb.append("请根据以下面试问答记录，生成一份详细的面试评估报告。\n\n");
            if (qaList != null && !qaList.isEmpty()) {
                for (int i = 0; i < qaList.size(); i++) {
                    QA qa = qaList.get(i);
                    sb.append("问题").append(i + 1).append("：").append(qa.getQuestion()).append("\n");
                    sb.append("回答").append(i + 1).append("：").append(qa.getAnswer()).append("\n\n");
                }
            }
            sb.append("总体得分：").append(score).append("\n\n");
            sb.append("请输出以下JSON格式（不要输出其他内容）：\n");
            sb.append("{\n");
            sb.append("  \"overallScore\": ").append(score).append(",\n");
            sb.append("  \"summary\": \"总体评价\",\n");
            sb.append("  \"strengths\": [\"优势1\", \"优势2\"],\n");
            sb.append("  \"concerns\": [\"顾虑1\", \"顾虑2\"],\n");
            sb.append("  \"recommendation\": \"建议（通过/待定/不通过）\",\n");
            sb.append("  \"answerCount\": ").append(qaList != null ? qaList.size() : 0).append("\n");
            sb.append("}");

            String json = llmClient.chatJson(systemPrompt, sb.toString(), "fast");
            // Validate it's parseable JSON
            JsonNode root = objectMapper.readTree(json);
            if (root.has("summary") && root.has("recommendation")) {
                return json;
            }
        } catch (Exception e) {
            log.warn("LLM report generation failed, falling back: {}", e.getMessage());
        }

        // Fall back to basic report
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("overallScore", score);
        report.put("summary", score >= 80 ? "面试表现优秀" :
                score >= 60 ? "面试表现良好" :
                score >= 40 ? "面试表现一般" : "面试表现有待提升");
        report.put("strengths", List.of("需要LLM服务以生成详细评估"));
        report.put("concerns", List.of("需要LLM服务以生成详细评估"));
        report.put("recommendation", score >= 70 ? "建议进入下一轮" :
                score >= 50 ? "待定，可进一步考察" : "不建议进入下一轮");
        report.put("answerCount", qaList != null ? qaList.size() : 0);
        report.put("generatedAt", System.currentTimeMillis());

        try {
            return objectMapper.writeValueAsString(report);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize fallback report", e);
            return "{}";
        }
    }

    // ---- Private helpers ----

    private List<InterviewQuestion> parseQuestionsFromJson(String json, int count) {
        try {
            JsonNode root = objectMapper.readTree(json);
            // Handle both array and object with "questions" key
            JsonNode arr;
            if (root.isArray()) {
                arr = root;
            } else if (root.has("questions")) {
                arr = root.get("questions");
            } else {
                return List.of();
            }

            List<InterviewQuestion> questions = new ArrayList<>();
            for (JsonNode node : arr) {
                if (!node.has("question")) continue;
                String id = node.has("id") ? node.get("id").asText("q-" + (questions.size() + 1)) : "q-" + (questions.size() + 1);
                String question = node.get("question").asText("");
                String type = node.has("type") ? node.get("type").asText("technical") : "technical";
                String keywords = node.has("expectedKeywords") ? node.get("expectedKeywords").asText("") : "";
                int maxScore = node.has("maxScore") ? node.get("maxScore").asInt(20) : 20;
                questions.add(new InterviewQuestion(id, question, type, keywords, maxScore));
            }

            return questions.stream().limit(count).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Failed to parse LLM questions JSON: {}", e.getMessage());
            return List.of();
        }
    }

    private InterviewEvaluation parseEvaluationFromJson(String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            int score = root.has("overallScore") ? root.get("overallScore").asInt(3) : 3;
            String summary = root.has("summary") ? root.get("summary").asText("") : "";
            List<String> strengths = new ArrayList<>();
            List<String> concerns = new ArrayList<>();

            if (root.has("strengths") && root.get("strengths").isArray()) {
                for (JsonNode n : root.get("strengths")) {
                    strengths.add(n.asText());
                }
            }
            if (root.has("concerns") && root.get("concerns").isArray()) {
                for (JsonNode n : root.get("concerns")) {
                    concerns.add(n.asText());
                }
            } else if (root.has("weaknesses") && root.get("weaknesses").isArray()) {
                for (JsonNode n : root.get("weaknesses")) {
                    concerns.add(n.asText());
                }
            }

            boolean passRecommended = root.has("passRecommended") && root.get("passRecommended").asBoolean(false);

            if (strengths.isEmpty()) strengths.add("需要提供更详细的回答以评估优势");
            if (concerns.isEmpty()) concerns.add("无明显短板，表现均衡");

            return new InterviewEvaluation(score, summary, strengths, concerns, passRecommended);
        } catch (Exception e) {
            log.warn("Failed to parse LLM evaluation JSON: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Fallback: generate questions from JD by keyword extraction (original approach).
     */
    private List<InterviewQuestion> generateQuestionsFromJd(String jdText, int count) {
        Set<String> techKeywords = extractKeywords(jdText);
        String title = extractJobTitle(jdText);

        List<InterviewQuestion> questions = new ArrayList<>();
        int idCounter = 1;

        // Technical questions
        int techCount = Math.min(3, count);
        List<String> techKeywordsList = new ArrayList<>(techKeywords);
        for (int i = 0; i < techCount && i < techKeywordsList.size(); i++) {
            String keyword = techKeywordsList.get(i);
            questions.add(new InterviewQuestion(
                    "q-" + (idCounter++),
                    "请谈谈你在 " + keyword + " 方面的项目经验？你是如何在实际工作中应用它的？",
                    "technical",
                    keyword + ",项目经验,实践",
                    25
            ));
        }
        while (questions.size() < techCount) {
            questions.add(new InterviewQuestion(
                    "q-" + (idCounter++),
                    "请描述你在" + (title.isEmpty() ? "技术" : title) + "相关工作中遇到的最有挑战性的技术问题以及如何解决的？",
                    "technical",
                    "技术挑战,解决方案,架构设计",
                    25
            ));
        }

        // Behavioral questions
        String[] behavioralTemplates = {
                "请分享一个你在团队协作中解决冲突的经历。",
                "请描述一个你在项目中主动承担额外责任的例子。",
                "请谈谈你是如何在紧迫的项目截止日期下管理时间和优先级的。",
                "请分享一个你从失败中学习并改进的经历。",
                "请描述一个你说服团队采纳新想法或新技术的经验。"
        };
        List<String> behavioralPool = new ArrayList<>(Arrays.asList(behavioralTemplates));
        Collections.shuffle(behavioralPool, new Random(idCounter));
        for (int i = 0; i < 2 && i < behavioralPool.size(); i++) {
            questions.add(new InterviewQuestion(
                    "q-" + (idCounter++),
                    behavioralPool.get(i),
                    "behavioral",
                    "团队协作,沟通,主动,解决问题",
                    20
            ));
        }

        // General question
        String domain = title.isEmpty() ? "该岗位" : title;
        questions.add(new InterviewQuestion(
                "q-" + (idCounter++),
                "你认为在 " + domain + " 领域中，未来最重要的技术趋势是什么？你如何保持自己的技能更新？",
                "general",
                "技术趋势,学习能力,行业认知",
                20
        ));

        return questions.stream().limit(count).collect(Collectors.toList());
    }

    private List<InterviewQuestion> generateDefaultQuestions(int count) {
        List<InterviewQuestion> questions = new ArrayList<>();
        questions.add(new InterviewQuestion("q-1", "请做一个简短的自我介绍。", "general", "自我介绍,经验,技能", 20));
        questions.add(new InterviewQuestion("q-2", "你最大的职业成就是什么？", "behavioral", "成就,贡献,影响", 20));
        questions.add(new InterviewQuestion("q-3", "你如何看待团队合作？", "behavioral", "团队,协作,沟通", 20));
        questions.add(new InterviewQuestion("q-4", "请描述你解决复杂问题的思路。", "technical", "问题分析,解决方案,逻辑", 20));
        questions.add(new InterviewQuestion("q-5", "你如何保持对新技术的了解？", "general", "学习,技术趋势,成长", 20));
        questions.add(new InterviewQuestion("q-6", "你对未来的职业规划是什么？", "behavioral", "规划,目标,发展", 20));
        return questions.stream().limit(count).collect(Collectors.toList());
    }

    /**
     * Basic heuristic evaluation (fallback when LLM is unavailable).
     */
    private InterviewEvaluation basicEvaluation(List<QA> qaList) {
        int totalScore = 0;
        List<String> strengths = new ArrayList<>();
        List<String> weaknesses = new ArrayList<>();
        int answeredCount = 0;

        for (QA qa : qaList) {
            if (qa.getAnswer() == null || qa.getAnswer().isBlank()) {
                weaknesses.add("问题「" + truncate(qa.getQuestion(), 20) + "」未回答");
                continue;
            }
            answeredCount++;

            String answer = qa.getAnswer();
            int answerLength = answer.length();

            int lengthScore;
            if (answerLength > 200) lengthScore = 40;
            else if (answerLength > 100) lengthScore = 25;
            else if (answerLength > 50) lengthScore = 15;
            else lengthScore = 5;

            String question = qa.getQuestion() != null ? qa.getQuestion() : "";
            String answerLower = answer.toLowerCase();

            Set<String> questionKeywords = extractKeywordsFromQuestion(question);
            int keywordMatchCount = 0;
            for (String kw : questionKeywords) {
                if (answerLower.contains(kw.toLowerCase())) {
                    keywordMatchCount++;
                }
            }

            double keywordRatio = questionKeywords.isEmpty() ? 0.5 :
                    (double) keywordMatchCount / questionKeywords.size();
            int keywordScore = (int) Math.round(keywordRatio * 40);

            int detailBonus = 0;
            if (answer.matches(".*\\d+.*")) detailBonus += 10;
            if (answer.contains("因为") || answer.contains("所以") || answer.contains("因此") ||
                    answer.contains("first") || answer.contains("then") || answer.contains("because")) {
                detailBonus += 10;
            }

            int qScore = Math.min(100, lengthScore + keywordScore + detailBonus);
            totalScore += qScore;

            if (qScore >= 70) {
                strengths.add("问题「" + truncate(qa.getQuestion(), 20) + "」回答详实");
            } else if (qScore < 40) {
                weaknesses.add("问题「" + truncate(qa.getQuestion(), 20) + "」回答不够充分");
            }
        }

        int overallScore = answeredCount > 0 ? totalScore / answeredCount : 0;
        overallScore = Math.min(100, Math.max(0, overallScore));

        // Map to 1-5 scale
        int score1to5;
        String summary;
        boolean passRecommended;

        if (overallScore >= 80) {
            score1to5 = 5;
            summary = "面试表现优秀，候选人在技术能力和沟通表达方面均表现出色。";
            passRecommended = true;
        } else if (overallScore >= 60) {
            score1to5 = 4;
            summary = "面试表现良好，候选人具备基本能力，部分领域有待深入。";
            passRecommended = true;
        } else if (overallScore >= 40) {
            score1to5 = 3;
            summary = "面试表现一般，候选人需要加强技术深度和表达能力。";
            passRecommended = false;
        } else {
            score1to5 = overallScore > 0 ? 2 : 1;
            summary = "面试表现有待提升，建议进一步考察候选人的技术基础。";
            passRecommended = false;
        }

        if (strengths.isEmpty()) strengths.add("需要提供更详细的回答以评估优势");
        if (weaknesses.isEmpty()) weaknesses.add("无明显短板，表现均衡");

        return new InterviewEvaluation(score1to5, summary, strengths, weaknesses, passRecommended);
    }

    // ---- Keyword extraction helpers (preserved from original for fallback) ----

    private Set<String> extractKeywords(String jdText) {
        Set<String> keywords = new LinkedHashSet<>();
        String[] techTerms = {
                "Java", "Python", "Go", "Rust", "C\\+\\+", "JavaScript", "TypeScript", "Node\\.?js",
                "React", "Vue", "Angular", "Spring", "Spring Boot", "Django", "Flask", "FastAPI",
                "Microservice", "微服务", "分布式", "Docker", "Kubernetes", "K8s", "云原生",
                "AWS", "Azure", "GCP", "阿里云", "腾讯云",
                "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "RabbitMQ",
                "REST", "GraphQL", "gRPC", "API",
                "CI/CD", "DevOps", "Jenkins", "Git",
                "机器学习", "深度学习", "AI", "NLP", "大模型", "LLM",
                "Hadoop", "Spark", "Flink", "大数据",
                "敏捷开发", "Scrum", "项目管理",
                "Linux", "Unix", "Shell",
                "数据结构", "算法", "设计模式",
                "测试", "单元测试", "TDD",
                "安全", "认证", "授权", "OAuth", "JWT"
        };

        for (String term : techTerms) {
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile(term, java.util.regex.Pattern.CASE_INSENSITIVE);
            java.util.regex.Matcher matcher = pattern.matcher(jdText);
            if (matcher.find()) {
                String normalized = term.replaceAll("\\\\\\+\\+", "++")
                        .replaceAll("\\\\\\.", ".")
                        .replaceAll("\\\\?", "")
                        .replaceAll("\\^", "")
                        .replaceAll("\\\\d", "d");
                keywords.add(normalized);
            }
        }
        return keywords;
    }

    private String extractJobTitle(String jdText) {
        String[] lines = jdText.split("\\n");
        if (lines.length > 0) {
            String firstLine = lines[0].trim();
            if (firstLine.length() < 100) return firstLine;
        }
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("(?:职位|岗位|招聘)[：: ]*(.+)", java.util.regex.Pattern.CASE_INSENSITIVE);
        java.util.regex.Matcher matcher = pattern.matcher(jdText);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return "";
    }

    private Set<String> extractKeywordsFromQuestion(String question) {
        Set<String> keywords = new HashSet<>();
        if (question == null) return keywords;
        String[] words = question.split("[，。、；：？！,.;:?!\\s]+");
        for (String word : words) {
            if (word.length() >= 2 && !isStopWord(word)) {
                keywords.add(word);
            }
        }
        return keywords;
    }

    private boolean isStopWord(String word) {
        Set<String> stopWords = Set.of("请", "一个", "你", "的", "在", "了", "是", "什么", "如何",
                "怎么", "哪些", "这个", "那个", "可以", "会", "能", "要", "有", "和", "与",
                "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                "have", "has", "had", "do", "does", "did", "will", "would", "could",
                "should", "may", "might", "shall", "can", "to", "of", "in", "for",
                "on", "with", "at", "by", "from", "as", "into", "through", "during");
        return stopWords.contains(word.toLowerCase());
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "...";
    }

    // ---- Inner classes ----

    public static class InterviewQuestion {
        private String id;
        private String question;
        private String type;
        private String expectedKeywords;
        private int maxScore;

        public InterviewQuestion() {}

        public InterviewQuestion(String id, String question, String type, String expectedKeywords, int maxScore) {
            this.id = id;
            this.question = question;
            this.type = type;
            this.expectedKeywords = expectedKeywords;
            this.maxScore = maxScore;
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getQuestion() { return question; }
        public void setQuestion(String question) { this.question = question; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getExpectedKeywords() { return expectedKeywords; }
        public void setExpectedKeywords(String expectedKeywords) { this.expectedKeywords = expectedKeywords; }
        public int getMaxScore() { return maxScore; }
        public void setMaxScore(int maxScore) { this.maxScore = maxScore; }
    }

    public static class QA {
        private String questionId;
        private String question;
        private String answer;

        public QA() {}

        public QA(String questionId, String question, String answer) {
            this.questionId = questionId;
            this.question = question;
            this.answer = answer;
        }

        public String getQuestionId() { return questionId; }
        public void setQuestionId(String questionId) { this.questionId = questionId; }
        public String getQuestion() { return question; }
        public void setQuestion(String question) { this.question = question; }
        public String getAnswer() { return answer; }
        public void setAnswer(String answer) { this.answer = answer; }
    }

    public static class InterviewEvaluation {
        private int score;
        private String summary;
        private List<String> strengths;
        private List<String> weaknesses;
        private boolean passRecommended;

        public InterviewEvaluation() {}

        public InterviewEvaluation(int score, String summary, List<String> strengths, List<String> weaknesses, boolean passRecommended) {
            this.score = score;
            this.summary = summary;
            this.strengths = strengths;
            this.weaknesses = weaknesses;
            this.passRecommended = passRecommended;
        }

        public int getScore() { return score; }
        public void setScore(int score) { this.score = score; }
        public String getSummary() { return summary; }
        public void setSummary(String summary) { this.summary = summary; }
        public List<String> getStrengths() { return strengths; }
        public void setStrengths(List<String> strengths) { this.strengths = strengths; }
        public List<String> getWeaknesses() { return weaknesses; }
        public void setWeaknesses(List<String> weaknesses) { this.weaknesses = weaknesses; }
        public boolean isPassRecommended() { return passRecommended; }
        public void setPassRecommended(boolean passRecommended) { this.passRecommended = passRecommended; }
    }
}
