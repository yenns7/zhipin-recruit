package com.hireinsight.interview;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class InterviewAIService {

    private static final Logger log = LoggerFactory.getLogger(InterviewAIService.class);

    private final ObjectMapper objectMapper;

    public InterviewAIService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Generate interview questions from JD text.
     */
    public List<InterviewQuestion> generateQuestions(String jdText, int count) {
        if (jdText == null || jdText.isBlank()) {
            return generateDefaultQuestions(count);
        }

        // Extract keywords from JD
        Set<String> techKeywords = extractKeywords(jdText);
        String title = extractJobTitle(jdText);

        List<InterviewQuestion> questions = new ArrayList<>();
        int idCounter = 1;

        // 3 technical questions
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
        // If not enough tech keywords, fill with generic tech questions
        while (questions.size() < techCount) {
            questions.add(new InterviewQuestion(
                    "q-" + (idCounter++),
                    "请描述你在" + (title.isEmpty() ? "技术" : title) + "相关工作中遇到的最有挑战性的技术问题以及如何解决的？",
                    "technical",
                    "技术挑战,解决方案,架构设计",
                    25
            ));
        }

        // 2 behavioral questions
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

        // 1 general question
        String domain = title.isEmpty() ? "该岗位" : title;
        questions.add(new InterviewQuestion(
                "q-" + (idCounter++),
                "你认为在 " + domain + " 领域中，未来最重要的技术趋势是什么？你如何保持自己的技能更新？",
                "general",
                "技术趋势,学习能力,行业认知",
                    20
        ));

        return questions;
    }

    /**
     * Evaluate answers and return evaluation result.
     */
    public InterviewEvaluation evaluateAnswers(List<QA> qaList) {
        if (qaList == null || qaList.isEmpty()) {
            return new InterviewEvaluation(0, "未提供回答", List.of(), List.of("未提供任何回答"));
        }

        int totalScore = 0;
        List<String> strengths = new ArrayList<>();
        List<String> weaknesses = new ArrayList<>();
        int answeredCount = 0;

        // Expected keywords per question - in a real system these come from the question definition
        // Here we do simple heuristic evaluation
        for (QA qa : qaList) {
            if (qa.getAnswer() == null || qa.getAnswer().isBlank()) {
                weaknesses.add("问题「" + truncate(qa.getQuestion(), 20) + "」未回答");
                continue;
            }
            answeredCount++;

            String answer = qa.getAnswer();
            int answerLength = answer.length();

            // Score based on length
            int lengthScore;
            if (answerLength > 200) {
                lengthScore = 40;
            } else if (answerLength > 100) {
                lengthScore = 25;
            } else if (answerLength > 50) {
                lengthScore = 15;
            } else {
                lengthScore = 5;
            }

            // Keyword matching - extract keywords from question and check against answer
            String question = qa.getQuestion() != null ? qa.getQuestion() : "";
            String questionLower = question.toLowerCase();
            String answerLower = answer.toLowerCase();

            // Extract potential keywords from question
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

            // Bonus for technical details (numbers, code-like terms)
            int detailBonus = 0;
            if (answer.matches(".*\\d+.*")) {
                detailBonus += 10;
            }
            if (answer.contains("因为") || answer.contains("所以") || answer.contains("因此") ||
                    answer.contains("first") || answer.contains("then") || answer.contains("because")) {
                detailBonus += 10;
            }

            int qScore = Math.min(100, lengthScore + keywordScore + detailBonus);
            totalScore += qScore;

            if (qScore >= 70) {
                strengths.add("问题「" + truncate(qa.getQuestion(), 20) + "」回答详实");
            } else if (qScore >= 40) {
                // neutral
            } else {
                weaknesses.add("问题「" + truncate(qa.getQuestion(), 20) + "」回答不够充分");
            }
        }

        int overallScore = answeredCount > 0 ? totalScore / answeredCount : 0;
        overallScore = Math.min(100, Math.max(0, overallScore));

        // Summary
        String summary;
        if (overallScore >= 80) {
            summary = "面试表现优秀，候选人在技术能力和沟通表达方面均表现出色。";
        } else if (overallScore >= 60) {
            summary = "面试表现良好，候选人具备基本能力，部分领域有待深入。";
        } else if (overallScore >= 40) {
            summary = "面试表现一般，候选人需要加强技术深度和表达能力。";
        } else {
            summary = "面试表现有待提升，建议进一步考察候选人的技术基础。";
        }

        if (strengths.isEmpty()) {
            strengths.add("需要提供更详细的回答以评估优势");
        }
        if (weaknesses.isEmpty()) {
            weaknesses.add("无明显短板，表现均衡");
        }

        return new InterviewEvaluation(overallScore, summary, strengths, weaknesses);
    }

    /**
     * Generate AI report as JSON string.
     */
    public String generateReport(List<QA> qaList, int score) {
        InterviewEvaluation evaluation = evaluateAnswers(qaList);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("overallScore", score);
        report.put("summary", evaluation.getSummary());
        report.put("strengths", evaluation.getStrengths());
        report.put("weaknesses", evaluation.getWeaknesses());
        report.put("answerCount", qaList != null ? qaList.size() : 0);
        report.put("recommendation", score >= 70 ? "建议进入下一轮" :
                score >= 50 ? "待定，可进一步考察" : "不建议进入下一轮");
        report.put("generatedAt", System.currentTimeMillis());

        try {
            return objectMapper.writeValueAsString(report);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize report", e);
            return "{}";
        }
    }

    // ---- Private helpers ----

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

    private Set<String> extractKeywords(String jdText) {
        Set<String> keywords = new LinkedHashSet<>();
        // Common tech keywords to look for
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
            Pattern pattern = Pattern.compile(term, Pattern.CASE_INSENSITIVE);
            Matcher matcher = pattern.matcher(jdText);
            if (matcher.find()) {
                // Normalize: remove regex special chars and dots
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
        // Try to find the title from first line or obvious patterns
        String[] lines = jdText.split("\\n");
        if (lines.length > 0) {
            String firstLine = lines[0].trim();
            if (firstLine.length() < 100) {
                return firstLine;
            }
        }
        // Look for "职位" or "岗位" indicators
        Pattern pattern = Pattern.compile("(?:职位|岗位|招聘)[：: ]*(.+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(jdText);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return "";
    }

    private Set<String> extractKeywordsFromQuestion(String question) {
        Set<String> keywords = new HashSet<>();
        if (question == null) return keywords;

        // Split by common Chinese/English delimiters and extract meaningful words
        String[] words = question.split("[，。、；：？！,.;:?!\\s]+");
        for (String word : words) {
            if (word.length() >= 2) {
                // Skip common stop words
                if (!isStopWord(word)) {
                    keywords.add(word);
                }
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

        public InterviewEvaluation() {}

        public InterviewEvaluation(int score, String summary, List<String> strengths, List<String> weaknesses) {
            this.score = score;
            this.summary = summary;
            this.strengths = strengths;
            this.weaknesses = weaknesses;
        }

        public int getScore() { return score; }
        public void setScore(int score) { this.score = score; }
        public String getSummary() { return summary; }
        public void setSummary(String summary) { this.summary = summary; }
        public List<String> getStrengths() { return strengths; }
        public void setStrengths(List<String> strengths) { this.strengths = strengths; }
        public List<String> getWeaknesses() { return weaknesses; }
        public void setWeaknesses(List<String> weaknesses) { this.weaknesses = weaknesses; }
    }
}
