package com.hireinsight.boss;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.config.AppConfig;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.BossAccount;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.InterviewSession;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.model.UploadBatch;
import com.hireinsight.repository.BossAccountRepository;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.InterviewSessionRepository;
import com.hireinsight.repository.PipelineStageRepository;
import com.hireinsight.repository.UploadBatchRepository;
import com.hireinsight.security.FieldEncryptionService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * BOSS直聘集成服务 — 真实 boss-cli 调用 + Cookie 加密 + 批量导入 + AI 筛选。
 * <p>
 * 支持两种模式（通过 {@code app.boss.demo-mode} 控制）：
 * <ul>
 *   <li>demo 模式：回退到 {@link BossDemoService}，纯内存 mock 数据</li>
 *   <li>real 模式：使用 {@link BossCliService} 调用真实 boss-cli，数据持久化</li>
 * </ul>
 */
@Service
public class BossService {

    private static final Logger log = LoggerFactory.getLogger(BossService.class);

    private static final String BOSS_SOURCE_CHANNEL = "boss直聘";
    static final int MAX_IMPORT_LIMIT = 50;
    static final double DEFAULT_INTERVAL_SEC = 1.5;

    // Demo fallback data
    private final ConcurrentHashMap<String, Map<String, Object>> accounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> candidates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> aiScreenResults = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> labels = new ConcurrentHashMap<>();

    private final AppConfig appConfig;
    private final BossCliService bossCliService;
    private final BossDemoService bossDemoService;
    private final FieldEncryptionService fieldEncryptionService;
    private final LlmClient llmClient;
    private final ObjectMapper objectMapper;
    private final BossAccountRepository bossAccountRepository;
    private final CandidateRepository candidateRepository;
    private final InterviewSessionRepository interviewSessionRepository;
    private final PipelineStageRepository pipelineStageRepository;
    private final UploadBatchRepository uploadBatchRepository;

    public BossService(AppConfig appConfig,
                       BossCliService bossCliService,
                       BossDemoService bossDemoService,
                       FieldEncryptionService fieldEncryptionService,
                       LlmClient llmClient,
                       ObjectMapper objectMapper,
                       BossAccountRepository bossAccountRepository,
                       CandidateRepository candidateRepository,
                       InterviewSessionRepository interviewSessionRepository,
                       PipelineStageRepository pipelineStageRepository,
                       UploadBatchRepository uploadBatchRepository) {
        this.appConfig = appConfig;
        this.bossCliService = bossCliService;
        this.bossDemoService = bossDemoService;
        this.fieldEncryptionService = fieldEncryptionService;
        this.llmClient = llmClient;
        this.objectMapper = objectMapper;
        this.bossAccountRepository = bossAccountRepository;
        this.candidateRepository = candidateRepository;
        this.interviewSessionRepository = interviewSessionRepository;
        this.pipelineStageRepository = pipelineStageRepository;
        this.uploadBatchRepository = uploadBatchRepository;
    }

    @PostConstruct
    public void init() {
        if (isDemoMode()) {
            initDemoData();
        }
    }

    private void initDemoData() {
        accounts.put("ba1", Map.of(
                "id", "ba1", "phone", "138****1234", "company", "字节跳动",
                "position", "HR总监", "status", "connected",
                "lastLoginAt", Instant.now().toString()
        ));
        accounts.put("ba2", Map.of(
                "id", "ba2", "phone", "139****5678", "company", "阿里巴巴",
                "position", "招聘经理", "status", "connected",
                "lastLoginAt", Instant.now().toString()
        ));

        jobs.put("bj1", Map.ofEntries(Map.entry("id", "bj1"), Map.entry("title", "高级Java工程师"),
                Map.entry("salary", "30K-50K"), Map.entry("city", "北京"), Map.entry("status", "active"),
                Map.entry("company", "字节跳动"), Map.entry("department", "技术中台"),
                Map.entry("experience", "3-5年"), Map.entry("education", "本科"),
                Map.entry("description", "负责核心业务系统的架构设计和开发工作"),
                Map.entry("createdAt", "2026-06-01T00:00:00Z")));
        jobs.put("bj2", Map.ofEntries(Map.entry("id", "bj2"), Map.entry("title", "前端架构师"),
                Map.entry("salary", "40K-60K"), Map.entry("city", "杭州"), Map.entry("status", "active"),
                Map.entry("company", "阿里巴巴"), Map.entry("department", "前端工程"),
                Map.entry("experience", "5-10年"), Map.entry("education", "本科"),
                Map.entry("description", "负责前端架构设计和工程效能提升"),
                Map.entry("createdAt", "2026-06-05T00:00:00Z")));
        jobs.put("bj3", Map.ofEntries(Map.entry("id", "bj3"), Map.entry("title", "产品经理"),
                Map.entry("salary", "25K-45K"), Map.entry("city", "上海"), Map.entry("status", "active"),
                Map.entry("company", "字节跳动"), Map.entry("department", "飞书"),
                Map.entry("experience", "3-5年"), Map.entry("education", "本科"),
                Map.entry("description", "负责飞书产品的规划与迭代"),
                Map.entry("createdAt", "2026-06-10T00:00:00Z")));
        jobs.put("bj4", Map.ofEntries(Map.entry("id", "bj4"), Map.entry("title", "算法工程师"),
                Map.entry("salary", "50K-80K"), Map.entry("city", "北京"), Map.entry("status", "paused"),
                Map.entry("company", "字节跳动"), Map.entry("department", "AI Lab"),
                Map.entry("experience", "3-5年"), Map.entry("education", "硕士"),
                Map.entry("description", "负责大模型训练和推理优化"),
                Map.entry("createdAt", "2026-05-20T00:00:00Z")));
        jobs.put("bj5", Map.ofEntries(Map.entry("id", "bj5"), Map.entry("title", "测试开发工程师"),
                Map.entry("salary", "20K-35K"), Map.entry("city", "深圳"), Map.entry("status", "active"),
                Map.entry("company", "阿里巴巴"), Map.entry("department", "质量保障"),
                Map.entry("experience", "1-3年"), Map.entry("education", "本科"),
                Map.entry("description", "负责自动化测试框架搭建和维护"),
                Map.entry("createdAt", "2026-06-15T00:00:00Z")));

        candidates.put("bc1", Map.ofEntries(Map.entry("id", "bc1"), Map.entry("name", "张三"),
                Map.entry("title", "Java专家"), Map.entry("salary", "45K-60K"), Map.entry("score", 0.92),
                Map.entry("source", "recommend"), Map.entry("city", "北京"), Map.entry("experience", "8年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("Java", "Spring Boot", "微服务", "Kubernetes")),
                Map.entry("currentCompany", "美团"), Map.entry("summary", "8年后端开发经验，擅长高并发系统设计"),
                Map.entry("updatedAt", "2026-07-01T00:00:00Z")));
        candidates.put("bc2", Map.ofEntries(Map.entry("id", "bc2"), Map.entry("name", "李四"),
                Map.entry("title", "高级前端工程师"), Map.entry("salary", "35K-50K"), Map.entry("score", 0.88),
                Map.entry("source", "recommend"), Map.entry("city", "杭州"), Map.entry("experience", "6年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("React", "TypeScript", "Webpack", "Node.js")),
                Map.entry("currentCompany", "网易"), Map.entry("summary", "6年前端开发，精通React生态"),
                Map.entry("updatedAt", "2026-07-02T00:00:00Z")));
        candidates.put("bc3", Map.ofEntries(Map.entry("id", "bc3"), Map.entry("name", "王五"),
                Map.entry("title", "产品总监"), Map.entry("salary", "60K-90K"), Map.entry("score", 0.85),
                Map.entry("source", "recommend"), Map.entry("city", "上海"), Map.entry("experience", "12年"),
                Map.entry("education", "硕士"), Map.entry("skills", List.of("产品规划", "数据分析", "团队管理")),
                Map.entry("currentCompany", "拼多多"), Map.entry("summary", "12年产品经验，主导过多个亿级用户产品"),
                Map.entry("updatedAt", "2026-07-03T00:00:00Z")));
        candidates.put("bc4", Map.ofEntries(Map.entry("id", "bc4"), Map.entry("name", "赵六"),
                Map.entry("title", "算法研究员"), Map.entry("salary", "60K-100K"), Map.entry("score", 0.95),
                Map.entry("source", "recommend"), Map.entry("city", "北京"), Map.entry("experience", "5年"),
                Map.entry("education", "博士"), Map.entry("skills", List.of("深度学习", "NLP", "PyTorch", "TensorFlow")),
                Map.entry("currentCompany", "百度"), Map.entry("summary", "5年NLP研究经验，发表多篇顶会论文"),
                Map.entry("updatedAt", "2026-07-04T00:00:00Z")));
        candidates.put("bc5", Map.ofEntries(Map.entry("id", "bc5"), Map.entry("name", "钱七"),
                Map.entry("title", "测试架构师"), Map.entry("salary", "40K-55K"), Map.entry("score", 0.82),
                Map.entry("source", "recommend"), Map.entry("city", "深圳"), Map.entry("experience", "9年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("自动化测试", "性能测试", "Jenkins", "Selenium")),
                Map.entry("currentCompany", "腾讯"), Map.entry("summary", "9年测试开发经验，主导过大型项目质量保障"),
                Map.entry("updatedAt", "2026-07-05T00:00:00Z")));
        candidates.put("bc6", Map.ofEntries(Map.entry("id", "bc6"), Map.entry("name", "孙八"),
                Map.entry("title", "全栈工程师"), Map.entry("salary", "30K-45K"), Map.entry("score", 0.78),
                Map.entry("source", "inbox"), Map.entry("city", "北京"), Map.entry("experience", "4年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("Java", "Vue.js", "MySQL", "Docker")),
                Map.entry("currentCompany", "京东"), Map.entry("summary", "4年全栈开发，前后端都能独立完成"),
                Map.entry("updatedAt", "2026-07-06T00:00:00Z")));
        candidates.put("bc7", Map.ofEntries(Map.entry("id", "bc7"), Map.entry("name", "周九"),
                Map.entry("title", "数据分析师"), Map.entry("salary", "25K-35K"), Map.entry("score", 0.75),
                Map.entry("source", "inbox"), Map.entry("city", "上海"), Map.entry("experience", "3年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("SQL", "Python", "Tableau", "Excel")),
                Map.entry("currentCompany", "小红书"), Map.entry("summary", "3年数据分析经验，擅长业务数据建模"),
                Map.entry("updatedAt", "2026-07-07T00:00:00Z")));
        candidates.put("bc8", Map.ofEntries(Map.entry("id", "bc8"), Map.entry("name", "吴十"),
                Map.entry("title", "技术经理"), Map.entry("salary", "50K-70K"), Map.entry("score", 0.87),
                Map.entry("source", "inbox"), Map.entry("city", "杭州"), Map.entry("experience", "10年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("团队管理", "系统架构", "项目管理")),
                Map.entry("currentCompany", "蚂蚁集团"), Map.entry("summary", "10年技术管理经验，管理过20+人团队"),
                Map.entry("updatedAt", "2026-07-07T00:00:00Z")));
        candidates.put("bc9", Map.ofEntries(Map.entry("id", "bc9"), Map.entry("name", "郑十一"),
                Map.entry("title", "DevOps工程师"), Map.entry("salary", "30K-45K"), Map.entry("score", 0.80),
                Map.entry("source", "recommend"), Map.entry("city", "北京"), Map.entry("experience", "5年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("Kubernetes", "Docker", "Jenkins", "Terraform")),
                Map.entry("currentCompany", "字节跳动"), Map.entry("summary", "5年DevOps经验，主导过CICD体系建设"),
                Map.entry("updatedAt", "2026-07-06T00:00:00Z")));
        candidates.put("bc10", Map.ofEntries(Map.entry("id", "bc10"), Map.entry("name", "陈十二"),
                Map.entry("title", "安全工程师"), Map.entry("salary", "35K-55K"), Map.entry("score", 0.83),
                Map.entry("source", "inbox"), Map.entry("city", "北京"), Map.entry("experience", "6年"),
                Map.entry("education", "本科"), Map.entry("skills", List.of("渗透测试", "安全审计", "Java", "Python")),
                Map.entry("currentCompany", "360"), Map.entry("summary", "6年安全领域经验，持有CISP认证"),
                Map.entry("updatedAt", "2026-07-05T00:00:00Z")));

        aiScreenResults.put("as1", Map.ofEntries(Map.entry("id", "as1"), Map.entry("candidateId", "bc1"),
                Map.entry("jobId", "bj1"), Map.entry("score", 0.92),
                Map.entry("summary", "候选人Java技术栈匹配度高，有大型系统设计经验"),
                Map.entry("strengths", List.of("高并发设计经验丰富", "Spring Boot生态熟练", "有团队管理经验")),
                Map.entry("weaknesses", List.of("云原生经验较少")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T08:00:00Z")));
        aiScreenResults.put("as2", Map.ofEntries(Map.entry("id", "as2"), Map.entry("candidateId", "bc4"),
                Map.entry("jobId", "bj4"), Map.entry("score", 0.95),
                Map.entry("summary", "候选人AI领域经验丰富，研究方向与岗位高度匹配"),
                Map.entry("strengths", List.of("NLP研究深入", "顶会论文多篇", "有大模型实战经验")),
                Map.entry("weaknesses", List.of("工业界经验相对较少")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T08:30:00Z")));
        aiScreenResults.put("as3", Map.ofEntries(Map.entry("id", "as3"), Map.entry("candidateId", "bc2"),
                Map.entry("jobId", "bj2"), Map.entry("score", 0.85),
                Map.entry("summary", "候选人前端技术栈全面，架构设计能力强"),
                Map.entry("strengths", List.of("React生态精通", "有架构设计经验", "工程效能意识好")),
                Map.entry("weaknesses", List.of("跨端经验不足")),
                Map.entry("status", "completed"), Map.entry("createdAt", "2026-07-07T09:00:00Z")));

        labels.put("l1", Map.of("id", "l1", "name", "高匹配度", "color", "green", "count", 3));
        labels.put("l2", Map.of("id", "l2", "name", "待沟通", "color", "yellow", "count", 5));
        labels.put("l3", Map.of("id", "l3", "name", "已面试", "color", "blue", "count", 2));
        labels.put("l4", Map.of("id", "l4", "name", "不合适", "color", "gray", "count", 1));
        labels.put("l5", Map.of("id", "l5", "name", "需跟进", "color", "red", "count", 4));
    }

    public boolean isDemoMode() {
        return appConfig.getBoss().isDemoMode();
    }

    // ========================================================================
    // BOSS connection status
    // ========================================================================

    public Map<String, Object> getStatus(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getStatus();
        }
        boolean installed = bossCliService.checkInstalled();
        long accountCount = userId != null ? bossAccountRepository.countByUserId(userId) : 0;
        List<Map<String, Object>> accountList = new ArrayList<>();
        if (userId != null) {
            accountList = bossAccountRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .map(this::accountToMap)
                    .collect(Collectors.toList());
        }
        return Map.of(
                "connected", installed && accountCount > 0,
                "platform", "zhipin",
                "cliInstalled", installed,
                "accounts", accountList
        );
    }

    // ========================================================================
    // BOSS login
    // ========================================================================

    public Map<String, Object> getLoginInfo() {
        if (isDemoMode()) {
            return bossDemoService.getLoginInfo();
        }
        boolean installed = bossCliService.checkInstalled();
        return Map.of(
                "qrCodeUrl", "https://www.zhipin.com/web/chat/",
                "expiresIn", 300,
                "cliInstalled", installed,
                "instructions", List.of(
                        "boss login 为交互式命令，需在运行后端的终端中执行：",
                        "  · 浏览器 Cookie：boss login --cookie-source chrome",
                        "  · 扫码登录：boss login --qrcode",
                        "登录成功后在本页面刷新即可"
                )
        );
    }

    // ========================================================================
    // Browser cookie import
    // ========================================================================

    @Transactional
    public Map<String, Object> importBrowserCookie(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.importBrowserCookie(request);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }

        // Parse cookies from request
        Object rawCookies = request.get("cookies");
        if (rawCookies == null) {
            rawCookies = request.get("cookie");
        }
        if (rawCookies == null) {
            return Map.of("success", false, "message", "请提供cookie信息", "errorCode", "invalid_params");
        }

        Map<String, String> parsedCookies = parseCookies(rawCookies);
        if (parsedCookies.isEmpty()) {
            return Map.of("success", false, "message", "未解析到任何cookie，请重新复制", "errorCode", "invalid_params");
        }

        // Check required cookies (wt2, wbg, zp_at)
        Set<String> required = Set.of("wt2", "wbg", "zp_at");
        List<String> missing = required.stream()
                .filter(c -> !parsedCookies.containsKey(c))
                .collect(Collectors.toList());
        if (!missing.isEmpty()) {
            return Map.of(
                    "success", false,
                    "message", "cookie不完整，缺少" + String.join(", ", missing) + "；请确认已完整登录BOSS直聘招聘端",
                    "errorCode", "incomplete_cookie",
                    "missing", missing
            );
        }

        // Build cookie string and encrypt it
        String cookieHeader = parsedCookies.entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining("; "));
        String encryptedCookie = fieldEncryptionService.encrypt(cookieHeader);

        // Deactivate other accounts and save
        List<BossAccount> existing = bossAccountRepository.findByUserIdOrderByCreatedAtDesc(userId);
        for (BossAccount acct : existing) {
            if (Boolean.TRUE.equals(acct.getIsActive())) {
                acct.setIsActive(false);
                bossAccountRepository.save(acct);
            }
        }

        BossAccount account = BossAccount.builder()
                .userId(userId)
                .bossUid(parsedCookies.getOrDefault("bossUid", ""))
                .encryptedCookie(encryptedCookie)
                .nickname(parsedCookies.getOrDefault("nickname", ""))
                .status("active")
                .isActive(true)
                .cookieCount(parsedCookies.size())
                .build();
        bossAccountRepository.save(account);

        return Map.of(
                "success", true,
                "accountId", account.getId(),
                "message", "Cookie导入成功",
                "importedAt", Instant.now().toString()
        );
    }

    // ========================================================================
    // Jobs
    // ========================================================================

    public List<Map<String, Object>> getJobs(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getJobs();
        }
        // Try to fetch from CLI
        Optional<String> cookie = getActiveCookie(userId);
        if (cookie.isPresent()) {
            try {
                return bossCliService.fetchJobList("", cookie.get());
            } catch (Exception e) {
                log.warn("Failed to fetch jobs from CLI, returning empty list", e);
            }
        }
        return List.of();
    }

    // ========================================================================
    // Candidates
    // ========================================================================

    public List<Map<String, Object>> getRecommendedCandidates(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getRecommendedCandidates();
        }
        // In real mode, query candidates from DB that came from BOSS
        List<Candidate> dbCandidates = userId != null
                ? candidateRepository.findByOwnerHrId(userId)
                : List.of();
        return dbCandidates.stream()
                .map(this::candidateToMap)
                .collect(Collectors.toList());
    }

    public List<Map<String, Object>> getInboxCandidates(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getInboxCandidates();
        }
        // Try CLI fetch
        Optional<String> cookie = getActiveCookie(userId);
        if (cookie.isPresent()) {
            try {
                return bossCliService.fetchInbox("", cookie.get());
            } catch (Exception e) {
                log.warn("Failed to fetch inbox from CLI", e);
            }
        }
        return List.of();
    }

    public Map<String, Object> getCandidateResume(String id, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getCandidateResume(id);
        }
        // Try to parse as numeric ID for DB lookup
        try {
            Long candidateId = Long.parseLong(id);
            Optional<Candidate> candidate = candidateRepository.findById(candidateId);
            if (candidate.isPresent()) {
                return candidateToDetailMap(candidate.get());
            }
        } catch (NumberFormatException ignored) {
        }
        return Map.of("error", "candidate not found");
    }

    public Map<String, Object> getResumeDownloadUrl(String candidateId, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getResumeDownloadUrl(candidateId);
        }
        Optional<String> cookie = getActiveCookie(userId);
        if (cookie.isPresent()) {
            try {
                // Download via CLI to temp location and return path
                String outputPath = getUploadDir(userId) + "/resumes/" + candidateId + ".md";
                Optional<String> path = bossCliService.downloadResume(candidateId, cookie.get(), outputPath);
                if (path.isPresent()) {
                    return Map.of(
                            "candidateId", candidateId,
                            "downloadUrl", path.get(),
                            "expiresIn", 3600,
                            "format", "markdown"
                    );
                }
            } catch (Exception e) {
                log.warn("Failed to download resume for {}", candidateId, e);
            }
        }
        return Map.of("candidateId", candidateId, "downloadUrl", "", "expiresIn", 0);
    }

    // ========================================================================
    // Batch import (rate-limited: 1.5s interval, max 50)
    // ========================================================================

    @Transactional
    public Map<String, Object> batchImport(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.batchImport(request);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) request.getOrDefault("candidates", List.of());
        if (items.isEmpty()) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> inboxItems = (List<Map<String, Object>>) request.getOrDefault("items", List.of());
            items = inboxItems;
        }
        if (items.isEmpty()) {
            return Map.of("success", false, "message", "candidates/items 不能为空", "errorCode", "invalid_params");
        }

        int limit = Math.min(MAX_IMPORT_LIMIT,
                Math.max(1, getIntParam(request, "limit", MAX_IMPORT_LIMIT)));
        double interval = getDoubleParam(request, "interval", DEFAULT_INTERVAL_SEC);
        Long targetJobId = getLongParam(request, "targetJobId");

        Optional<String> cookieOpt = getActiveCookie(userId);
        if (cookieOpt.isEmpty()) {
            return Map.of("success", false, "message", "无激活的BOSS账号，请先导入Cookie",
                    "errorCode", "not_authenticated");
        }
        String cookie = cookieOpt.get();

        // Create an upload batch
        UploadBatch batch = UploadBatch.builder()
                .ownerHrId(userId)
                .source("boss")
                .channel(BOSS_SOURCE_CHANNEL)
                .notes("BOSS收件箱批量导入")
                .build();
        uploadBatchRepository.save(batch);

        // Build set of existing geek_ids
        Set<String> existingGeekIds = getExistingGeekIds(userId);

        List<Map<String, Object>> results = new ArrayList<>();
        int imported = 0, skipped = 0, failed = 0;
        String stoppedReason = null;

        for (int idx = 0; idx < Math.min(items.size(), limit); idx++) {
            Map<String, Object> item = items.get(idx);
            String geekId = safeStr(item.get("geek_id"), 64);
            String nameHint = safeStr(item.get("name"), 100);

            if (geekId.isBlank()) {
                failed++;
                results.add(Map.of("geek_id", "", "name", nameHint, "status", "error", "reason", "缺少geek_id"));
                continue;
            }

            if (existingGeekIds.contains(geekId)) {
                skipped++;
                results.add(Map.of("geek_id", geekId, "name", nameHint, "status", "skipped", "reason", "已导入，跳过"));
                continue;
            }

            // Rate limit: sleep between requests
            if (idx > 0 && interval > 0) {
                try {
                    Thread.sleep((long) (interval * 1000));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    stoppedReason = "interrupted";
                    break;
                }
            }

            // Download resume
            String outputPath = getUploadDir(userId) + "/" + sanitizeFileName(geekId) + ".md";
            Optional<String> dlPath = bossCliService.downloadResume(geekId, cookie, outputPath);

            if (dlPath.isEmpty()) {
                failed++;
                results.add(Map.of("geek_id", geekId, "name", nameHint, "status", "error", "reason", "下载失败"));
                continue;
            }

            // Read downloaded markdown and extract basic fields
            String mdText = "";
            try {
                mdText = Files.readString(Path.of(outputPath), StandardCharsets.UTF_8);
            } catch (IOException e) {
                log.warn("Cannot read downloaded resume: {}", outputPath, e);
            }

            Map<String, String> basics = extractBasicFields(mdText);
            String displayName = !nameHint.isBlank() ? nameHint
                    : (!basics.getOrDefault("name", "").isBlank() ? basics.get("name")
                    : "BOSS候选人" + geekId.substring(0, Math.min(8, geekId.length())));

            // Build resume JSON
            Map<String, Object> bossMeta = new HashMap<>();
            bossMeta.put("geek_id", geekId);
            bossMeta.put("security_id", safeStr(item.get("security_id"), 80));
            bossMeta.put("friend_id", item.get("friend_id"));
            bossMeta.put("job", safeStr(item.get("job"), 64));

            Map<String, Object> resumeJson = new HashMap<>();
            resumeJson.put("source", "boss");
            resumeJson.put("raw_markdown", mdText);
            resumeJson.put("boss", bossMeta);

            String resumeJsonStr;
            try {
                resumeJsonStr = objectMapper.writeValueAsString(resumeJson);
            } catch (Exception e) {
                resumeJsonStr = "{}";
            }

            Candidate candidate = Candidate.builder()
                    .ownerHrId(userId)
                    .batchId(batch.getId())
                    .nameMasked(displayName.substring(0, Math.min(100, displayName.length())))
                    .emailMasked(basics.get("email"))
                    .phoneMasked(basics.get("phone"))
                    .resumeJson(resumeJsonStr)
                    .rawFilePath(outputPath)
                    .parseStatus("ok")
                    .build();
            candidateRepository.save(candidate);
            existingGeekIds.add(geekId);
            imported++;

            // Auto add to pipeline if targetJobId is set
            if (targetJobId != null) {
                PipelineStage stage = PipelineStage.builder()
                        .candidateId(candidate.getId())
                        .jobId(targetJobId)
                        .stage("pending")
                        .updatedBy(userId)
                        .build();
                pipelineStageRepository.save(stage);
            }

            Map<String, Object> resultItem = new HashMap<>();
            resultItem.put("geek_id", geekId);
            resultItem.put("name", displayName);
            resultItem.put("status", "ok");
            resultItem.put("candidate_id", candidate.getId());
            resultItem.put("target_job_id", targetJobId);
            results.add(resultItem);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("batch_id", batch.getId());
        data.put("imported", imported);
        data.put("skipped", skipped);
        data.put("failed", failed);
        data.put("stopped_reason", stoppedReason);
        data.put("results", results);
        data.put("success", true);
        data.put("importedCount", imported);
        data.put("totalCount", items.size());
        data.put("failedCount", failed);
        data.put("failedItems", List.of());
        data.put("message", "批量导入完成");

        return data;
    }

    // ========================================================================
    // AI screening
    // ========================================================================

    @Transactional
    public Map<String, Object> aiScreen(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.aiScreen(request);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }

        String candidateIdStr = (String) request.getOrDefault("candidateId", "");
        String jobIdStr = (String) request.getOrDefault("jobId", "");
        boolean useAll = Boolean.TRUE.equals(request.get("all"));

        if (candidateIdStr.isBlank() && !useAll) {
            return Map.of("success", false, "message", "candidateId 不能为空", "errorCode", "invalid_params");
        }

        List<Candidate> candidatesToScreen = new ArrayList<>();
        if (useAll) {
            candidatesToScreen = candidateRepository.findByOwnerHrId(userId);
        } else {
            try {
                Long cid = Long.parseLong(candidateIdStr);
                candidateRepository.findById(cid).ifPresent(candidatesToScreen::add);
            } catch (NumberFormatException ignored) {
            }
        }

        if (candidatesToScreen.isEmpty()) {
            return Map.of("success", false, "message", "未找到候选人", "errorCode", "not_found");
        }

        Long jobId = null;
        try {
            jobId = Long.parseLong(jobIdStr);
        } catch (NumberFormatException ignored) {
        }

        String systemPrompt = """
                你是一个专业的招聘AI助手。请根据候选人简历和岗位要求，评估候选人匹配度。
                以JSON格式返回评估结果，包含以下字段：
                - score: 匹配度评分 (0-100)
                - summary: 评估摘要
                - strengths: 候选人优势列表
                - weaknesses: 候选人不足列表
                - pass_recommended: 是否推荐进入面试 (true/false)
                """;

        List<Map<String, Object>> results = new ArrayList<>();
        int screened = 0, failedCount = 0;

        for (Candidate candidate : candidatesToScreen) {
            String resumeText = loadResumeText(candidate);
            if (resumeText.isBlank()) {
                failedCount++;
                results.add(Map.of("candidate_id", candidate.getId(), "status", "error", "reason", "无可用简历文本"));
                continue;
            }

            String userPrompt = "候选人简历：\n" + resumeText + "\n\n请评估该候选人。";
            try {
                String llmResponse = llmClient.chatJson(systemPrompt, userPrompt, "fast");
                Map<String, Object> report = objectMapper.readValue(llmResponse,
                        new TypeReference<Map<String, Object>>() {});

                Number scoreNum = (Number) report.getOrDefault("score", 0);
                Integer score = scoreNum != null ? scoreNum.intValue() : null;
                boolean passRecommended = Boolean.TRUE.equals(report.getOrDefault("pass_recommended", false));

                // Create InterviewSession record
                InterviewSession session = InterviewSession.builder()
                        .candidateId(candidate.getId())
                        .jobId(jobId != null ? jobId : 0)
                        .status("ai_screen")
                        .aiReport(llmResponse)
                        .score(score)
                        .build();
                interviewSessionRepository.save(session);

                // Advance pipeline stage to ai_screen
                if (jobId != null) {
                    PipelineStage stage = PipelineStage.builder()
                            .candidateId(candidate.getId())
                            .jobId(jobId)
                            .stage("ai_screen")
                            .updatedBy(userId)
                            .build();
                    pipelineStageRepository.save(stage);
                }

                screened++;
                Map<String, Object> result = new HashMap<>();
                result.put("candidate_id", candidate.getId());
                result.put("name", candidate.getNameMasked());
                result.put("status", "ok");
                result.put("score", score);
                result.put("pass_recommended", passRecommended);
                result.put("summary", report.getOrDefault("summary", ""));
                result.put("strengths", report.getOrDefault("strengths", List.of()));
                result.put("weaknesses", report.getOrDefault("weaknesses", List.of()));
                results.add(result);
            } catch (Exception e) {
                log.error("AI screening failed for candidate {}", candidate.getId(), e);
                failedCount++;
                results.add(Map.of("candidate_id", candidate.getId(), "name", candidate.getNameMasked(),
                        "status", "error", "reason", "AI评估失败：" + e.getMessage()));
            }
        }

        Map<String, Object> data = new HashMap<>();
        data.put("screened", screened);
        data.put("failed", failedCount);
        data.put("results", results);
        if (!results.isEmpty() && results.get(0).containsKey("score")) {
            data.put("score", results.get(0).get("score"));
            data.put("summary", results.get(0).get("summary"));
            data.put("strengths", results.get(0).get("strengths"));
            data.put("weaknesses", results.get(0).get("weaknesses"));
            data.put("status", "completed");
        }
        return data;
    }

    // ========================================================================
    // Account management
    // ========================================================================

    public List<Map<String, Object>> getAccounts(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.getAccounts();
        }
        if (userId == null) return List.of();
        return bossAccountRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::accountToMap)
                .collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> activateAccount(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.activateAccount(request);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }
        Number accountIdNum = (Number) request.get("accountId");
        if (accountIdNum == null) {
            // Try string id
            String idStr = (String) request.getOrDefault("accountId", "");
            try {
                accountIdNum = Long.parseLong(idStr);
            } catch (NumberFormatException e) {
                return Map.of("success", false, "message", "accountId 不能为空");
            }
        }
        Long accountId = accountIdNum.longValue();

        Optional<BossAccount> accountOpt = bossAccountRepository.findByIdAndUserId(accountId, userId);
        if (accountOpt.isEmpty()) {
            return Map.of("success", false, "message", "账号不存在或无权操作");
        }

        // Deactivate all, activate the specified one
        List<BossAccount> all = bossAccountRepository.findByUserIdOrderByCreatedAtDesc(userId);
        for (BossAccount acct : all) {
            acct.setIsActive(acct.getId().equals(accountId));
            bossAccountRepository.save(acct);
        }

        return Map.of("success", true, "accountId", accountId, "status", "active");
    }

    @Transactional
    public Map<String, Object> deleteAccount(String id, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.deleteAccount(id);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }
        try {
            Long accountId = Long.parseLong(id);
            Optional<BossAccount> accountOpt = bossAccountRepository.findByIdAndUserId(accountId, userId);
            if (accountOpt.isPresent()) {
                boolean wasActive = Boolean.TRUE.equals(accountOpt.get().getIsActive());
                bossAccountRepository.delete(accountOpt.get());

                // If deleted the active one, activate the most recent
                if (wasActive) {
                    List<BossAccount> remaining = bossAccountRepository.findByUserIdOrderByCreatedAtDesc(userId);
                    if (!remaining.isEmpty()) {
                        BossAccount next = remaining.get(0);
                        next.setIsActive(true);
                        bossAccountRepository.save(next);
                    }
                }
                return Map.of("success", true, "deletedId", id);
            }
        } catch (NumberFormatException ignored) {
        }
        return Map.of("success", true, "deletedId", id);
    }

    public Map<String, Object> verifyAccount(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.verifyAccount(request);
        }
        if (userId == null) {
            return Map.of("success", false, "message", "未获取到用户信息");
        }

        Number accountIdNum = (Number) request.get("accountId");
        if (accountIdNum == null) {
            return Map.of("success", false, "message", "accountId 不能为空");
        }
        Long accountId = accountIdNum.longValue();

        Optional<BossAccount> accountOpt = bossAccountRepository.findByIdAndUserId(accountId, userId);
        if (accountOpt.isEmpty()) {
            return Map.of("success", false, "message", "账号不存在或无权操作");
        }

        BossAccount account = accountOpt.get();
        boolean verified = false;

        if (account.getEncryptedCookie() != null && !account.getEncryptedCookie().isBlank()) {
            try {
                String cookie = fieldEncryptionService.decrypt(account.getEncryptedCookie());
                verified = bossCliService.checkInstalled();
                if (verified) {
                    // Try a simple CLI call to verify
                    List<Map<String, Object>> inbox = bossCliService.fetchInbox("", cookie);
                    verified = true; // If no exception, assume valid
                }
            } catch (Exception e) {
                log.warn("Account verification failed for {}", accountId, e);
                verified = false;
            }
        }

        account.setLastVerifiedAt(Instant.now());
        account.setLastVerifiedOk(verified);
        bossAccountRepository.save(account);

        return Map.of(
                "success", true,
                "accountId", accountId,
                "verified", verified,
                "message", verified ? "账号验证成功" : "账号验证失败，cookie可能已过期"
        );
    }

    // ========================================================================
    // Labels
    // ========================================================================

    public List<Map<String, Object>> getLabels() {
        if (isDemoMode()) {
            return bossDemoService.getLabels();
        }
        return new ArrayList<>(labels.values());
    }

    // ========================================================================
    // Chat
    // ========================================================================

    public Map<String, Object> sendChatMessage(Map<String, Object> request, Long userId) {
        if (isDemoMode()) {
            return bossDemoService.sendChatMessage(request);
        }
        String candidateId = (String) request.getOrDefault("candidateId", "");
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

    // ========================================================================
    // Export
    // ========================================================================

    public Map<String, Object> exportData(Long userId) {
        if (isDemoMode()) {
            return bossDemoService.exportData();
        }
        return Map.of(
                "success", true,
                "exportUrl", "/api/v1/boss/export/data",
                "format", "json",
                "expiresIn", 7200,
                "message", "数据导出接口已准备"
        );
    }

    // ========================================================================
    // Extension download info
    // ========================================================================

    public Map<String, Object> getExtensionDownloadInfo() {
        if (isDemoMode()) {
            return bossDemoService.getExtensionDownloadInfo();
        }
        return Map.of(
                "name", "HireInsight BOSS直聘助手",
                "version", "1.0.0",
                "downloadUrl", "/api/v1/boss/extension/download/file",
                "instructions", "下载后解压，在Chrome浏览器中打开 chrome://extensions/，开启开发者模式，点击「加载已解压的扩展程序」",
                "platforms", List.of("Chrome", "Edge")
        );
    }

    // ========================================================================
    // Helper methods
    // ========================================================================

    private boolean isDemoModeOrFallback() {
        return isDemoMode() || !bossCliService.checkInstalled();
    }

    private Optional<String> getActiveCookie(Long userId) {
        if (userId == null) return Optional.empty();
        Optional<BossAccount> active = bossAccountRepository.findByUserIdAndIsActiveTrue(userId);
        if (active.isPresent() && active.get().getEncryptedCookie() != null) {
            try {
                return Optional.of(fieldEncryptionService.decrypt(active.get().getEncryptedCookie()));
            } catch (Exception e) {
                log.warn("Failed to decrypt cookie for account {}", active.get().getId(), e);
            }
        }
        return Optional.empty();
    }

    private Set<String> getExistingGeekIds(Long userId) {
        List<Candidate> candidates = candidateRepository.findByOwnerHrId(userId);
        Set<String> ids = new java.util.HashSet<>();
        for (Candidate c : candidates) {
            if (c.getResumeJson() != null && !c.getResumeJson().isBlank()) {
                try {
                    Map<String, Object> json = objectMapper.readValue(c.getResumeJson(),
                            new TypeReference<Map<String, Object>>() {});
                    Map<String, Object> boss = (Map<String, Object>) json.get("boss");
                    if (boss != null) {
                        Object gid = boss.get("geek_id");
                        if (gid instanceof String) {
                            ids.add((String) gid);
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }
        return ids;
    }

    private String loadResumeText(Candidate candidate) {
        // Try raw_markdown from resume_json
        if (candidate.getResumeJson() != null && !candidate.getResumeJson().isBlank()) {
            try {
                Map<String, Object> json = objectMapper.readValue(candidate.getResumeJson(),
                        new TypeReference<Map<String, Object>>() {});
                Object raw = json.get("raw_markdown");
                if (raw instanceof String && !((String) raw).isBlank()) {
                    return (String) raw;
                }
            } catch (Exception ignored) {
            }
        }
        // Try reading from file
        if (candidate.getRawFilePath() != null) {
            try {
                return Files.readString(Path.of(candidate.getRawFilePath()), StandardCharsets.UTF_8);
            } catch (IOException ignored) {
            }
        }
        return "";
    }

    private Map<String, String> extractBasicFields(String mdText) {
        Map<String, String> result = new HashMap<>();
        if (mdText == null || mdText.isBlank()) return result;
        // Extract name from first heading
        java.util.regex.Matcher nameM = java.util.regex.Pattern
                .compile("^#{1,2}\\s*(.+)$", java.util.regex.Pattern.MULTILINE)
                .matcher(mdText);
        if (nameM.find()) {
            result.put("name", nameM.group(1).trim());
        }
        // Extract email
        java.util.regex.Matcher emailM = java.util.regex.Pattern
                .compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+")
                .matcher(mdText);
        if (emailM.find()) {
            result.put("email", emailM.group());
        }
        // Extract phone
        java.util.regex.Matcher phoneM = java.util.regex.Pattern
                .compile("(?<!\\d)(1[3-9]\\d{9})(?!\\d)")
                .matcher(mdText);
        if (phoneM.find()) {
            result.put("phone", phoneM.group());
        }
        return result;
    }

    private Map<String, String> parseCookies(Object raw) {
        Map<String, String> result = new LinkedHashMap<>();
        if (raw instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<Object, Object> map = (Map<Object, Object>) raw;
            for (Map.Entry<Object, Object> entry : map.entrySet()) {
                String k = String.valueOf(entry.getKey()).trim();
                if (!k.isBlank()) {
                    result.put(k, String.valueOf(entry.getValue()));
                }
            }
        } else if (raw instanceof String) {
            String s = (String) raw;
            for (String part : s.split(";")) {
                part = part.trim();
                if (!part.contains("=")) continue;
                int eqIdx = part.indexOf('=');
                String k = part.substring(0, eqIdx).trim();
                String v = part.substring(eqIdx + 1).trim();
                if (!k.isBlank()) {
                    result.put(k, v);
                }
            }
        }
        return result;
    }

    private Map<String, Object> accountToMap(BossAccount acct) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", String.valueOf(acct.getId()));
        map.put("userId", acct.getUserId());
        map.put("bossUid", acct.getBossUid() != null ? acct.getBossUid() : "");
        map.put("nickname", acct.getNickname() != null ? acct.getNickname() : "");
        map.put("avatar", acct.getAvatar() != null ? acct.getAvatar() : "");
        map.put("status", acct.getStatus() != null ? acct.getStatus() : "active");
        map.put("isActive", Boolean.TRUE.equals(acct.getIsActive()));
        map.put("cookieCount", acct.getCookieCount() != null ? acct.getCookieCount() : 0);
        map.put("lastVerifiedAt", acct.getLastVerifiedAt() != null ? acct.getLastVerifiedAt().toString() : null);
        map.put("lastVerifiedOk", acct.getLastVerifiedOk());
        map.put("createdAt", acct.getCreatedAt() != null ? acct.getCreatedAt().toString() : null);
        return map;
    }

    private Map<String, Object> candidateToMap(Candidate c) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", String.valueOf(c.getId()));
        map.put("name", c.getNameMasked() != null ? c.getNameMasked() : "");
        map.put("email", c.getEmailMasked() != null ? c.getEmailMasked() : "");
        map.put("phone", c.getPhoneMasked() != null ? c.getPhoneMasked() : "");
        map.put("source", "boss");
        map.put("parseStatus", c.getParseStatus());
        map.put("createdAt", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
        return map;
    }

    private Map<String, Object> candidateToDetailMap(Candidate c) {
        Map<String, Object> map = candidateToMap(c);
        map.put("rawFilePath", c.getRawFilePath());
        if (c.getResumeJson() != null && !c.getResumeJson().isBlank()) {
            try {
                Map<String, Object> json = objectMapper.readValue(c.getResumeJson(),
                        new TypeReference<Map<String, Object>>() {});
                map.put("resumeData", json);
            } catch (Exception ignored) {
            }
        }
        return map;
    }

    private String getUploadDir(Long userId) {
        String base = appConfig.getUpload().getFolder();
        return base + "/boss/" + (userId != null ? userId : "unknown");
    }

    private String sanitizeFileName(String name) {
        return name.replaceAll("[^a-zA-Z0-9_\\-]", "_").substring(0, Math.min(48, name.length()));
    }

    private static String safeStr(Object value, int maxLen) {
        if (value == null) return "";
        String s = value.toString().trim();
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }

    private static int getIntParam(Map<String, Object> map, String key, int defaultValue) {
        Object v = map.get(key);
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try {
                return Integer.parseInt((String) v);
            } catch (NumberFormatException ignored) {
            }
        }
        return defaultValue;
    }

    private static double getDoubleParam(Map<String, Object> map, String key, double defaultValue) {
        Object v = map.get(key);
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof String) {
            try {
                return Double.parseDouble((String) v);
            } catch (NumberFormatException ignored) {
            }
        }
        return defaultValue;
    }

    private static Long getLongParam(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) {
            try {
                return Long.parseLong((String) v);
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }
}
