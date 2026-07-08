package com.hireinsight.boss;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Demo-stub service for BOSS直聘 integration.
 * All data is in-memory mock data, not connected to real BOSS直聘.
 */
@Service
public class BossDemoService {

    private final ConcurrentHashMap<String, Map<String, Object>> accounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> candidates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> inboxMessages = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> aiScreenResults = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> labels = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        // 2 demo BOSS accounts (logged-in state)
        accounts.put("ba1", Map.of(
                "id", "ba1",
                "phone", "138****1234",
                "company", "字节跳动",
                "position", "HR总监",
                "status", "connected",
                "lastLoginAt", Instant.now().toString()
        ));
        accounts.put("ba2", Map.of(
                "id", "ba2",
                "phone", "139****5678",
                "company", "阿里巴巴",
                "position", "招聘经理",
                "status", "connected",
                "lastLoginAt", Instant.now().toString()
        ));

        // 5 demo BOSS jobs
        jobs.put("bj1", Map.ofEntries(
                Map.entry("id", "bj1"), Map.entry("title", "高级Java工程师"), Map.entry("salary", "30K-50K"),
                Map.entry("city", "北京"), Map.entry("status", "active"), Map.entry("company", "字节跳动"),
                Map.entry("department", "技术中台"), Map.entry("experience", "3-5年"), Map.entry("education", "本科"),
                Map.entry("description", "负责核心业务系统的架构设计和开发工作"),
                Map.entry("createdAt", "2026-06-01T00:00:00Z")
        ));
        jobs.put("bj2", Map.ofEntries(
                Map.entry("id", "bj2"), Map.entry("title", "前端架构师"), Map.entry("salary", "40K-60K"),
                Map.entry("city", "杭州"), Map.entry("status", "active"), Map.entry("company", "阿里巴巴"),
                Map.entry("department", "前端工程"), Map.entry("experience", "5-10年"), Map.entry("education", "本科"),
                Map.entry("description", "负责前端架构设计和工程效能提升"),
                Map.entry("createdAt", "2026-06-05T00:00:00Z")
        ));
        jobs.put("bj3", Map.ofEntries(
                Map.entry("id", "bj3"), Map.entry("title", "产品经理"), Map.entry("salary", "25K-45K"),
                Map.entry("city", "上海"), Map.entry("status", "active"), Map.entry("company", "字节跳动"),
                Map.entry("department", "飞书"), Map.entry("experience", "3-5年"), Map.entry("education", "本科"),
                Map.entry("description", "负责飞书产品的规划与迭代"),
                Map.entry("createdAt", "2026-06-10T00:00:00Z")
        ));
        jobs.put("bj4", Map.ofEntries(
                Map.entry("id", "bj4"), Map.entry("title", "算法工程师"), Map.entry("salary", "50K-80K"),
                Map.entry("city", "北京"), Map.entry("status", "paused"), Map.entry("company", "字节跳动"),
                Map.entry("department", "AI Lab"), Map.entry("experience", "3-5年"), Map.entry("education", "硕士"),
                Map.entry("description", "负责大模型训练和推理优化"),
                Map.entry("createdAt", "2026-05-20T00:00:00Z")
        ));
        jobs.put("bj5", Map.ofEntries(
                Map.entry("id", "bj5"), Map.entry("title", "测试开发工程师"), Map.entry("salary", "20K-35K"),
                Map.entry("city", "深圳"), Map.entry("status", "active"), Map.entry("company", "阿里巴巴"),
                Map.entry("department", "质量保障"), Map.entry("experience", "1-3年"), Map.entry("education", "本科"),
                Map.entry("description", "负责自动化测试框架搭建和维护"),
                Map.entry("createdAt", "2026-06-15T00:00:00Z")
        ));

        // 10 demo recommended candidates
        candidates.put("bc1", Map.ofEntries(
                Map.entry("id", "bc1"), Map.entry("name", "张三"), Map.entry("title", "Java专家"),
                Map.entry("salary", "45K-60K"), Map.entry("score", 0.92), Map.entry("source", "recommend"),
                Map.entry("city", "北京"), Map.entry("experience", "8年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("Java", "Spring Boot", "微服务", "Kubernetes")),
                Map.entry("currentCompany", "美团"), Map.entry("summary", "8年后端开发经验，擅长高并发系统设计"),
                Map.entry("updatedAt", "2026-07-01T00:00:00Z")
        ));
        candidates.put("bc2", Map.ofEntries(
                Map.entry("id", "bc2"), Map.entry("name", "李四"), Map.entry("title", "高级前端工程师"),
                Map.entry("salary", "35K-50K"), Map.entry("score", 0.88), Map.entry("source", "recommend"),
                Map.entry("city", "杭州"), Map.entry("experience", "6年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("React", "TypeScript", "Webpack", "Node.js")),
                Map.entry("currentCompany", "网易"), Map.entry("summary", "6年前端开发，精通React生态"),
                Map.entry("updatedAt", "2026-07-02T00:00:00Z")
        ));
        candidates.put("bc3", Map.ofEntries(
                Map.entry("id", "bc3"), Map.entry("name", "王五"), Map.entry("title", "产品总监"),
                Map.entry("salary", "60K-90K"), Map.entry("score", 0.85), Map.entry("source", "recommend"),
                Map.entry("city", "上海"), Map.entry("experience", "12年"), Map.entry("education", "硕士"),
                Map.entry("skills", List.of("产品规划", "数据分析", "团队管理")),
                Map.entry("currentCompany", "拼多多"), Map.entry("summary", "12年产品经验，主导过多个亿级用户产品"),
                Map.entry("updatedAt", "2026-07-03T00:00:00Z")
        ));
        candidates.put("bc4", Map.ofEntries(
                Map.entry("id", "bc4"), Map.entry("name", "赵六"), Map.entry("title", "算法研究员"),
                Map.entry("salary", "60K-100K"), Map.entry("score", 0.95), Map.entry("source", "recommend"),
                Map.entry("city", "北京"), Map.entry("experience", "5年"), Map.entry("education", "博士"),
                Map.entry("skills", List.of("深度学习", "NLP", "PyTorch", "TensorFlow")),
                Map.entry("currentCompany", "百度"), Map.entry("summary", "5年NLP研究经验，发表多篇顶会论文"),
                Map.entry("updatedAt", "2026-07-04T00:00:00Z")
        ));
        candidates.put("bc5", Map.ofEntries(
                Map.entry("id", "bc5"), Map.entry("name", "钱七"), Map.entry("title", "测试架构师"),
                Map.entry("salary", "40K-55K"), Map.entry("score", 0.82), Map.entry("source", "recommend"),
                Map.entry("city", "深圳"), Map.entry("experience", "9年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("自动化测试", "性能测试", "Jenkins", "Selenium")),
                Map.entry("currentCompany", "腾讯"), Map.entry("summary", "9年测试开发经验，主导过大型项目质量保障"),
                Map.entry("updatedAt", "2026-07-05T00:00:00Z")
        ));
        candidates.put("bc6", Map.ofEntries(
                Map.entry("id", "bc6"), Map.entry("name", "孙八"), Map.entry("title", "全栈工程师"),
                Map.entry("salary", "30K-45K"), Map.entry("score", 0.78), Map.entry("source", "inbox"),
                Map.entry("city", "北京"), Map.entry("experience", "4年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("Java", "Vue.js", "MySQL", "Docker")),
                Map.entry("currentCompany", "京东"), Map.entry("summary", "4年全栈开发，前后端都能独立完成"),
                Map.entry("updatedAt", "2026-07-06T00:00:00Z")
        ));
        candidates.put("bc7", Map.ofEntries(
                Map.entry("id", "bc7"), Map.entry("name", "周九"), Map.entry("title", "数据分析师"),
                Map.entry("salary", "25K-35K"), Map.entry("score", 0.75), Map.entry("source", "inbox"),
                Map.entry("city", "上海"), Map.entry("experience", "3年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("SQL", "Python", "Tableau", "Excel")),
                Map.entry("currentCompany", "小红书"), Map.entry("summary", "3年数据分析经验，擅长业务数据建模"),
                Map.entry("updatedAt", "2026-07-07T00:00:00Z")
        ));
        candidates.put("bc8", Map.ofEntries(
                Map.entry("id", "bc8"), Map.entry("name", "吴十"), Map.entry("title", "技术经理"),
                Map.entry("salary", "50K-70K"), Map.entry("score", 0.87), Map.entry("source", "inbox"),
                Map.entry("city", "杭州"), Map.entry("experience", "10年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("团队管理", "系统架构", "项目管理")),
                Map.entry("currentCompany", "蚂蚁集团"), Map.entry("summary", "10年技术管理经验，管理过20+人团队"),
                Map.entry("updatedAt", "2026-07-07T00:00:00Z")
        ));
        candidates.put("bc9", Map.ofEntries(
                Map.entry("id", "bc9"), Map.entry("name", "郑十一"), Map.entry("title", "DevOps工程师"),
                Map.entry("salary", "30K-45K"), Map.entry("score", 0.80), Map.entry("source", "recommend"),
                Map.entry("city", "北京"), Map.entry("experience", "5年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("Kubernetes", "Docker", "Jenkins", "Terraform")),
                Map.entry("currentCompany", "字节跳动"), Map.entry("summary", "5年DevOps经验，主导过CICD体系建设"),
                Map.entry("updatedAt", "2026-07-06T00:00:00Z")
        ));
        candidates.put("bc10", Map.ofEntries(
                Map.entry("id", "bc10"), Map.entry("name", "陈十二"), Map.entry("title", "安全工程师"),
                Map.entry("salary", "35K-55K"), Map.entry("score", 0.83), Map.entry("source", "inbox"),
                Map.entry("city", "北京"), Map.entry("experience", "6年"), Map.entry("education", "本科"),
                Map.entry("skills", List.of("渗透测试", "安全审计", "Java", "Python")),
                Map.entry("currentCompany", "360"), Map.entry("summary", "6年安全领域经验，持有CISP认证"),
                Map.entry("updatedAt", "2026-07-05T00:00:00Z")
        ));

        // 5 inbox messages
        inboxMessages.put("im1", Map.of(
                "id", "im1", "candidateId", "bc6",
                "content", "您好，我对贵公司的高级Java工程师职位很感兴趣",
                "direction", "incoming", "status", "unread",
                "createdAt", "2026-07-07T10:00:00Z"
        ));
        inboxMessages.put("im2", Map.of(
                "id", "im2", "candidateId", "bc7",
                "content", "请问这个职位还开放吗？",
                "direction", "incoming", "status", "unread",
                "createdAt", "2026-07-07T11:00:00Z"
        ));
        inboxMessages.put("im3", Map.of(
                "id", "im3", "candidateId", "bc8",
                "content", "感谢您的邀请，我已发送简历",
                "direction", "incoming", "status", "read",
                "createdAt", "2026-07-06T09:00:00Z"
        ));
        inboxMessages.put("im4", Map.of(
                "id", "im4", "candidateId", "bc1",
                "content", "您好，我是字节跳动的HR，想邀请您面试",
                "direction", "outgoing", "status", "sent",
                "createdAt", "2026-07-07T14:00:00Z"
        ));
        inboxMessages.put("im5", Map.of(
                "id", "im5", "candidateId", "bc2",
                "content", "请问您最近在看新机会吗？",
                "direction", "outgoing", "status", "sent",
                "createdAt", "2026-07-07T15:00:00Z"
        ));

        // 3 AI screen results
        aiScreenResults.put("as1", Map.ofEntries(
                Map.entry("id", "as1"), Map.entry("candidateId", "bc1"), Map.entry("jobId", "bj1"),
                Map.entry("score", 0.92), Map.entry("summary", "候选人Java技术栈匹配度高，有大型系统设计经验"),
                Map.entry("strengths", List.of("高并发设计经验丰富", "Spring Boot生态熟练", "有团队管理经验")),
                Map.entry("weaknesses", List.of("云原生经验较少")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T08:00:00Z")
        ));
        aiScreenResults.put("as2", Map.ofEntries(
                Map.entry("id", "as2"), Map.entry("candidateId", "bc4"), Map.entry("jobId", "bj4"),
                Map.entry("score", 0.95), Map.entry("summary", "候选人AI领域经验丰富，研究方向与岗位高度匹配"),
                Map.entry("strengths", List.of("NLP研究深入", "顶会论文多篇", "有大模型实战经验")),
                Map.entry("weaknesses", List.of("工业界经验相对较少")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T08:30:00Z")
        ));
        aiScreenResults.put("as3", Map.ofEntries(
                Map.entry("id", "as3"), Map.entry("candidateId", "bc2"), Map.entry("jobId", "bj2"),
                Map.entry("score", 0.85), Map.entry("summary", "候选人前端技术栈全面，架构设计能力强"),
                Map.entry("strengths", List.of("React生态精通", "有架构设计经验", "工程效能意识好")),
                Map.entry("weaknesses", List.of("跨端经验不足")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T09:00:00Z")
        ));

        // Labels
        labels.put("l1", Map.of("id", "l1", "name", "高匹配度", "color", "green", "count", 3));
        labels.put("l2", Map.of("id", "l2", "name", "待沟通", "color", "yellow", "count", 5));
        labels.put("l3", Map.of("id", "l3", "name", "已面试", "color", "blue", "count", 2));
        labels.put("l4", Map.of("id", "l4", "name", "不合适", "color", "gray", "count", 1));
        labels.put("l5", Map.of("id", "l5", "name", "需跟进", "color", "red", "count", 4));
    }

    // ========== BOSS connection status ==========

    public Map<String, Object> getStatus() {
        return Map.of(
                "connected", true,
                "platform", "zhipin",
                "accounts", List.copyOf(accounts.values())
        );
    }

    // ========== BOSS login ==========

    public Map<String, Object> getLoginInfo() {
        return Map.of(
                "qrCodeUrl", "https://demo.qr.example.com/boss-login?t=" + System.currentTimeMillis(),
                "expiresIn", 300
        );
    }

    // ========== Browser cookie import ==========

    public Map<String, Object> importBrowserCookie(Map<String, Object> request) {
        return Map.of(
                "success", true,
                "accountId", "ba1",
                "message", "Cookie导入成功（demo-stub）",
                "importedAt", Instant.now().toString()
        );
    }

    // ========== Jobs ==========

    public List<Map<String, Object>> getJobs() {
        return new ArrayList<>(jobs.values());
    }

    // ========== Candidates ==========

    public List<Map<String, Object>> getRecommendedCandidates() {
        return candidates.values().stream()
                .filter(c -> "recommend".equals(c.get("source")))
                .toList();
    }

    public List<Map<String, Object>> getInboxCandidates() {
        return candidates.values().stream()
                .filter(c -> "inbox".equals(c.get("source")))
                .toList();
    }

    public Map<String, Object> getCandidateResume(String id) {
        Map<String, Object> candidate = candidates.get(id);
        if (candidate == null) {
            return Map.of("error", "candidate not found");
        }
        // Return enriched resume data
        var resume = new java.util.LinkedHashMap<String, Object>(candidate);
        resume.put("resumeUrl", "https://demo.resume.example.com/resumes/" + id + ".pdf");
        resume.put("phone", "188****" + (int) (Math.random() * 10000));
        resume.put("email", id + "@example.com");
        resume.put("workHistory", List.of(
                Map.of("company", candidate.get("currentCompany"), "title", candidate.get("title"),
                        "startDate", "2020-01", "endDate", "至今", "description", candidate.get("summary")),
                Map.of("company", "某知名互联网公司", "title", "高级开发工程师",
                        "startDate", "2016-06", "endDate", "2020-01", "description", "负责核心模块开发")
        ));
        return resume;
    }

    // ========== Resume download ==========

    public Map<String, Object> getResumeDownloadUrl(String candidateId) {
        return Map.of(
                "candidateId", candidateId,
                "downloadUrl", "https://demo.resume.example.com/download/" + candidateId + ".pdf",
                "expiresIn", 3600
        );
    }

    // ========== Batch import ==========

    public Map<String, Object> batchImport(Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> candidatesList = (List<Map<String, Object>>) request.getOrDefault("candidates", List.of());
        return Map.of(
                "success", true,
                "importedCount", candidatesList.size(),
                "totalCount", candidatesList.size(),
                "failedCount", 0,
                "failedItems", List.of(),
                "message", "批量导入完成（demo-stub）"
        );
    }

    // ========== AI screen ==========

    public Map<String, Object> aiScreen(Map<String, Object> request) {
        String candidateId = (String) request.getOrDefault("candidateId", "bc1");
        String jobId = (String) request.getOrDefault("jobId", "bj1");
        // Return existing result or generate a mock one
        String key = candidateId + "_" + jobId;
        Map<String, Object> existing = aiScreenResults.values().stream()
                .filter(r -> candidateId.equals(r.get("candidateId")) && jobId.equals(r.get("jobId")))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            return existing;
        }
        return Map.of(
                "id", "as-" + System.nanoTime(),
                "candidateId", candidateId,
                "jobId", jobId,
                "score", 0.85,
                "summary", "AI初筛完成（demo-stub），候选人基本符合岗位要求",
                "strengths", List.of("技术栈匹配", "经验丰富"),
                "weaknesses", List.of("需要进一步沟通确认"),
                "status", "completed",
                "createdAt", Instant.now().toString()
        );
    }

    // ========== Accounts ==========

    public List<Map<String, Object>> getAccounts() {
        return new ArrayList<>(accounts.values());
    }

    public Map<String, Object> activateAccount(Map<String, Object> request) {
        String accountId = (String) request.getOrDefault("accountId", "ba1");
        Map<String, Object> account = accounts.get(accountId);
        if (account != null) {
            var updated = new java.util.LinkedHashMap<String, Object>(account);
            updated.put("status", "connected");
            accounts.put(accountId, updated);
        }
        return Map.of("success", true, "accountId", accountId, "status", "connected");
    }

    public Map<String, Object> deleteAccount(String id) {
        accounts.remove(id);
        return Map.of("success", true, "deletedId", id);
    }

    public Map<String, Object> verifyAccount(Map<String, Object> request) {
        String accountId = (String) request.getOrDefault("accountId", "ba1");
        return Map.of(
                "success", true,
                "accountId", accountId,
                "verified", true,
                "message", "账号验证成功（demo-stub）"
        );
    }

    // ========== Labels ==========

    public List<Map<String, Object>> getLabels() {
        return new ArrayList<>(labels.values());
    }

    // ========== Chat ==========

    public Map<String, Object> sendChatMessage(Map<String, Object> request) {
        String candidateId = (String) request.getOrDefault("candidateId", "bc1");
        String message = (String) request.getOrDefault("message", "");
        return Map.of(
                "success", true,
                "messageId", "m-" + System.nanoTime(),
                "candidateId", candidateId,
                "sentMessage", message,
                "status", "sent",
                "sentAt", Instant.now().toString()
        );
    }

    // ========== Export ==========

    public Map<String, Object> exportData() {
        return Map.of(
                "success", true,
                "exportUrl", "https://demo.export.example.com/exports/boss-data-" + System.currentTimeMillis() + ".csv",
                "format", "csv",
                "expiresIn", 7200,
                "message", "数据导出完成（demo-stub）"
        );
    }

    // ========== Extension download ==========

    public Map<String, Object> getExtensionDownloadInfo() {
        return Map.of(
                "name", "HireInsight BOSS直聘助手",
                "version", "1.0.0-demo",
                "downloadUrl", "https://demo.extension.example.com/hireinsight-boss-extension.zip",
                "instructions", "下载后解压，在Chrome浏览器中打开 chrome://extensions/，开启开发者模式，点击「加载已解压的扩展程序」",
                "platforms", List.of("Chrome", "Edge")
        );
    }
}
