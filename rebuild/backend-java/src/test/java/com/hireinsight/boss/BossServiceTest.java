package com.hireinsight.boss;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.config.AppConfig;
import com.hireinsight.llm.LlmClient;
import com.hireinsight.model.BossAccount;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.InterviewSession;
import com.hireinsight.repository.BossAccountRepository;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.InterviewSessionRepository;
import com.hireinsight.repository.PipelineStageRepository;
import com.hireinsight.repository.UploadBatchRepository;
import com.hireinsight.security.FieldEncryptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for BossService in real (non-demo) mode.
 * All CLI, encryption, and LLM dependencies are mocked.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BossServiceTest {

    @Mock
    private AppConfig appConfig;
    @Mock
    private AppConfig.Boss bossConfig;
    @Mock
    private AppConfig.Upload uploadConfig;
    @Mock
    private BossCliService bossCliService;
    @Mock
    private BossDemoService bossDemoService;
    @Mock
    private FieldEncryptionService fieldEncryptionService;
    @Mock
    private LlmClient llmClient;
    @Mock
    private BossAccountRepository bossAccountRepository;
    @Mock
    private CandidateRepository candidateRepository;
    @Mock
    private InterviewSessionRepository interviewSessionRepository;
    @Mock
    private PipelineStageRepository pipelineStageRepository;
    @Mock
    private UploadBatchRepository uploadBatchRepository;

    private ObjectMapper objectMapper;
    private BossService bossService;

    @Captor
    private ArgumentCaptor<BossAccount> accountCaptor;
    @Captor
    private ArgumentCaptor<Candidate> candidateCaptor;
    @Captor
    private ArgumentCaptor<InterviewSession> sessionCaptor;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        when(appConfig.getBoss()).thenReturn(bossConfig);
        when(appConfig.getUpload()).thenReturn(uploadConfig);
        when(uploadConfig.getFolder()).thenReturn("/tmp/hireinsight_uploads");
        // Real mode (not demo)
        when(bossConfig.isDemoMode()).thenReturn(false);

        // Default empty repository returns
        when(bossAccountRepository.findByUserIdOrderByCreatedAtDesc(anyLong())).thenReturn(List.of());
        when(candidateRepository.findByOwnerHrId(anyLong())).thenReturn(List.of());
        when(uploadBatchRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        bossService = new BossService(
                appConfig, bossCliService, bossDemoService,
                fieldEncryptionService, llmClient, objectMapper,
                bossAccountRepository, candidateRepository,
                interviewSessionRepository, pipelineStageRepository,
                uploadBatchRepository
        );
    }

    // ── Status ─────────────────────────────────────────────────────────────

    @Test
    void getStatusWithNoAccounts() {
        when(bossCliService.checkInstalled()).thenReturn(true);
        when(bossAccountRepository.countByUserId(1L)).thenReturn(0L);

        Map<String, Object> status = bossService.getStatus(1L);

        assertEquals("zhipin", status.get("platform"));
        assertTrue((Boolean) status.get("cliInstalled"));
        assertFalse((Boolean) status.get("connected"));
    }

    @Test
    void getStatusWithActiveAccount() {
        when(bossCliService.checkInstalled()).thenReturn(true);
        when(bossAccountRepository.countByUserId(1L)).thenReturn(1L);

        Map<String, Object> status = bossService.getStatus(1L);

        assertTrue((Boolean) status.get("connected"));
        assertTrue((Boolean) status.get("cliInstalled"));
    }

    // ── Cookie Import ──────────────────────────────────────────────────────

    @Test
    void importBrowserCookieWithValidCookies() {
        Map<String, Object> request = Map.of(
                "cookies", Map.of("wt2", "val1", "wbg", "val2", "zp_at", "val3")
        );
        when(fieldEncryptionService.encrypt(anyString())).thenReturn("encrypted_cookie_value");
        when(bossAccountRepository.save(any())).thenAnswer(i -> {
            BossAccount a = i.getArgument(0);
            if (a.getId() == null) a.setId(1L);
            return a;
        });

        Map<String, Object> result = bossService.importBrowserCookie(request, 1L);

        assertTrue((Boolean) result.get("success"));
        assertNotNull(result.get("accountId"));
        assertTrue(((String) result.get("message")).contains("成功"));

        verify(bossAccountRepository).save(accountCaptor.capture());
        BossAccount saved = accountCaptor.getValue();
        assertEquals(1L, saved.getUserId());
        assertEquals("encrypted_cookie_value", saved.getEncryptedCookie());
        assertTrue(saved.getIsActive());
        assertEquals(3, saved.getCookieCount());
    }

    @Test
    void importBrowserCookieMissingRequired() {
        Map<String, Object> request = Map.of(
                "cookies", Map.of("wt2", "val1")
        );

        Map<String, Object> result = bossService.importBrowserCookie(request, 1L);

        assertFalse((Boolean) result.get("success"));
        assertEquals("incomplete_cookie", result.get("errorCode"));
    }

    @Test
    void importBrowserCookieEmptyRequest() {
        Map<String, Object> result = bossService.importBrowserCookie(Map.of(), 1L);

        assertFalse((Boolean) result.get("success"));
        assertEquals("invalid_params", result.get("errorCode"));
    }

    @Test
    void importBrowserCookieStringFormat() {
        Map<String, Object> request = Map.of(
                "cookie", "wt2=val1; wbg=val2; zp_at=val3"
        );
        when(fieldEncryptionService.encrypt(anyString())).thenReturn("enc");
        when(bossAccountRepository.save(any())).thenAnswer(i -> {
            BossAccount a = i.getArgument(0);
            if (a.getId() == null) a.setId(2L);
            return a;
        });

        Map<String, Object> result = bossService.importBrowserCookie(request, 1L);

        assertTrue((Boolean) result.get("success"));
    }

    // ── Account Management ─────────────────────────────────────────────────

    @Test
    void getAccountsReturnsEmptyWhenNoAccounts() {
        List<Map<String, Object>> accounts = bossService.getAccounts(1L);

        assertTrue(accounts.isEmpty());
    }

    @Test
    void getAccountsReturnsMappedAccounts() {
        when(bossAccountRepository.findByUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(createTestAccount(1L, 1L, "active", true)));

        List<Map<String, Object>> accounts = bossService.getAccounts(1L);

        assertEquals(1, accounts.size());
        assertEquals("1", accounts.get(0).get("id"));
        assertEquals("active", accounts.get(0).get("status"));
        assertTrue((Boolean) accounts.get(0).get("isActive"));
    }

    @Test
    void activateAccountNotFound() {
        when(bossAccountRepository.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        Map<String, Object> result = bossService.activateAccount(Map.of("accountId", 99), 1L);

        assertFalse((Boolean) result.get("success"));
    }

    @Test
    void activateAccountSuccess() {
        BossAccount account = createTestAccount(1L, 1L, "inactive", false);
        when(bossAccountRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(account));
        when(bossAccountRepository.findByUserIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(account));

        Map<String, Object> result = bossService.activateAccount(Map.of("accountId", 1), 1L);

        assertTrue((Boolean) result.get("success"));
        verify(bossAccountRepository, atLeastOnce()).save(any());
    }

    @Test
    void deleteAccountSuccess() {
        BossAccount account = createTestAccount(1L, 1L, "active", true);
        when(bossAccountRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(account));

        Map<String, Object> result = bossService.deleteAccount("1", 1L);

        assertTrue((Boolean) result.get("success"));
        assertEquals("1", result.get("deletedId"));
        verify(bossAccountRepository).delete(account);
    }

    @Test
    void verifyAccountSuccess() {
        BossAccount account = createTestAccount(1L, 1L, "active", true);
        account.setEncryptedCookie("encrypted_cookie");
        when(bossAccountRepository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(account));
        when(fieldEncryptionService.decrypt("encrypted_cookie")).thenReturn("wt2=val1; wbg=val2; zp_at=val3");
        when(bossCliService.checkInstalled()).thenReturn(true);
        when(bossCliService.fetchInbox(anyString(), anyString())).thenReturn(List.of());
        when(bossAccountRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        Map<String, Object> result = bossService.verifyAccount(Map.of("accountId", 1), 1L);

        assertTrue((Boolean) result.get("success"));
        assertTrue((Boolean) result.get("verified"));
    }

    // ── Batch Import ───────────────────────────────────────────────────────

    @Test
    void batchImportRequiresActiveAccount() {
        // Without stubbing, findByUserIdAndIsActiveTrue returns empty by default
        Map<String, Object> request = Map.of("candidates", List.of(
                Map.of("geek_id", "g123", "name", "Test")
        ));

        Map<String, Object> result = bossService.batchImport(request, 1L);

        assertEquals("not_authenticated", result.get("errorCode"));
    }

    @Test
    void batchImportNotAuthenticatedWithoutActiveAccount() {
        Map<String, Object> request = Map.of("candidates", List.of(
                Map.of("geek_id", "some_gid", "name", "Test")
        ));

        Map<String, Object> result = bossService.batchImport(request, 1L);

        assertEquals("not_authenticated", result.get("errorCode"));
    }

    @Test
    void batchImportEmptyItems() {
        when(bossAccountRepository.findByUserIdAndIsActiveTrue(1L))
                .thenReturn(Optional.of(createTestAccount(1L, 1L, "active", true)));
        when(fieldEncryptionService.decrypt(anyString())).thenReturn("cookie_string");

        Map<String, Object> result = bossService.batchImport(Map.of(), 1L);

        assertEquals("invalid_params", result.get("errorCode"));
    }

    // ── AI Screen ──────────────────────────────────────────────────────────

    @Test
    void aiScreenRequiresCandidate() {
        Map<String, Object> result = bossService.aiScreen(Map.of(), 1L);

        assertEquals("invalid_params", result.get("errorCode"));
    }

    @Test
    void aiScreenWithValidCandidate() throws Exception {
        Candidate candidate = Candidate.builder()
                .id(1L)
                .ownerHrId(1L)
                .nameMasked("张三")
                .resumeJson(objectMapper.writeValueAsString(Map.of(
                        "raw_markdown", "简历文本内容"
                )))
                .parseStatus("ok")
                .build();

        when(candidateRepository.findById(1L)).thenReturn(Optional.of(candidate));
        when(candidateRepository.findByOwnerHrId(1L)).thenReturn(List.of(candidate));

        String mockLlmResponse = """
                {
                    "score": 85,
                    "summary": "候选人技术栈匹配",
                    "pass_recommended": true,
                    "strengths": ["Java经验丰富"],
                    "weaknesses": ["英语能力待确认"]
                }
                """;
        when(llmClient.chatJson(anyString(), anyString(), anyString())).thenReturn(mockLlmResponse);
        when(interviewSessionRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        Map<String, Object> request = Map.of(
                "candidateId", "1",
                "jobId", "1",
                "all", false
        );

        Map<String, Object> result = bossService.aiScreen(request, 1L);

        assertEquals(1, result.get("screened"));
        assertEquals(0, result.get("failed"));

        verify(interviewSessionRepository).save(sessionCaptor.capture());
        InterviewSession session = sessionCaptor.getValue();
        assertEquals(1L, session.getCandidateId());
        assertEquals(85, session.getScore().intValue());
        assertEquals("ai_screen", session.getStatus());
    }

    // ── Candidate Resume ──────────────────────────────────────────────────

    @Test
    void getCandidateResumeReturnsDetail() {
        Candidate candidate = Candidate.builder()
                .id(1L)
                .ownerHrId(1L)
                .nameMasked("张三")
                .resumeJson("{\"source\":\"boss\"}")
                .parseStatus("ok")
                .build();

        when(candidateRepository.findById(1L)).thenReturn(Optional.of(candidate));

        Map<String, Object> result = bossService.getCandidateResume("1", 1L);

        assertEquals("张三", result.get("name"));
        assertNotNull(result.get("resumeData"));
    }

    @Test
    void getCandidateResumeNotFound() {
        when(candidateRepository.findById(999L)).thenReturn(Optional.empty());

        Map<String, Object> result = bossService.getCandidateResume("999", 1L);

        assertEquals("candidate not found", result.get("error"));
    }

    // ── Login Info (demo mode) ─────────────────────────────────────────────

    @Test
    void getLoginInfoInDemoModeReturnsQrCode() {
        when(bossConfig.isDemoMode()).thenReturn(true);
        when(bossDemoService.getLoginInfo()).thenReturn(Map.of(
                "qrCodeUrl", "https://demo.qr.example.com/boss-login",
                "expiresIn", 300
        ));

        // Re-create with demo mode
        bossService = new BossService(
                appConfig, bossCliService, bossDemoService,
                fieldEncryptionService, llmClient, objectMapper,
                bossAccountRepository, candidateRepository,
                interviewSessionRepository, pipelineStageRepository,
                uploadBatchRepository
        );

        Map<String, Object> result = bossService.getLoginInfo();

        assertNotNull(result.get("qrCodeUrl"));
        assertEquals(300, result.get("expiresIn"));
    }

    @Test
    void getLoginInfoInRealModeReturnsInstructions() {
        when(bossCliService.checkInstalled()).thenReturn(true);

        Map<String, Object> result = bossService.getLoginInfo();

        assertNotNull(result.get("qrCodeUrl"));
        assertTrue((Boolean) result.get("cliInstalled"));
    }

    // ── Chat (demo mode) ───────────────────────────────────────────────────

    @Test
    void sendChatMessageInDemoModeReturnsSuccess() {
        when(bossConfig.isDemoMode()).thenReturn(true);
        when(bossDemoService.sendChatMessage(any())).thenReturn(Map.of(
                "success", true,
                "messageId", "m-123",
                "status", "sent"
        ));
        bossService = new BossService(
                appConfig, bossCliService, bossDemoService,
                fieldEncryptionService, llmClient, objectMapper,
                bossAccountRepository, candidateRepository,
                interviewSessionRepository, pipelineStageRepository,
                uploadBatchRepository
        );

        Map<String, Object> result = bossService.sendChatMessage(
                Map.of("candidateId", "bc1", "message", "您好"),
                1L
        );

        assertTrue((Boolean) result.get("success"));
        assertEquals("sent", result.get("status"));
    }

    // ── Test helpers ───────────────────────────────────────────────────────

    private BossAccount createTestAccount(Long id, Long userId, String status, boolean isActive) {
        return BossAccount.builder()
                .id(id)
                .userId(userId)
                .bossUid("boss_uid_" + id)
                .nickname("测试账号" + id)
                .status(status)
                .isActive(isActive)
                .cookieCount(3)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
