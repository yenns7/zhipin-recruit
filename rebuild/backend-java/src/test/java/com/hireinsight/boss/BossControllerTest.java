package com.hireinsight.boss;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BossControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private String recruiterToken() {
        return "Bearer " + jwtTokenProvider.createToken(1L, "recruiter");
    }

    @Test
    void getStatusReturnsConnectionStatus() throws Exception {
        mockMvc.perform(get("/api/v1/boss/status")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.connected").value(true))
                .andExpect(jsonPath("$.data.platform").value("zhipin"))
                .andExpect(jsonPath("$.data.accounts").isArray());
    }

    @Test
    void getJobsReturnsJobList() throws Exception {
        mockMvc.perform(get("/api/v1/boss/jobs")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(5))
                .andExpect(jsonPath("$.data[0].id").value("bj1"))
                .andExpect(jsonPath("$.data[0].title").isString());
    }

    @Test
    void getRecommendedCandidatesReturnsList() throws Exception {
        mockMvc.perform(get("/api/v1/boss/candidates/recommend")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].source").value("recommend"))
                .andExpect(jsonPath("$.data[0].score").isNumber());
    }

    @Test
    void getInboxCandidatesReturnsList() throws Exception {
        mockMvc.perform(get("/api/v1/boss/candidates/inbox")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].source").value("inbox"));
    }

    @Test
    void getAccountsReturnsAccountList() throws Exception {
        mockMvc.perform(get("/api/v1/boss/accounts")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
    }

    @Test
    void loginReturnsQrCode() throws Exception {
        mockMvc.perform(post("/api/v1/boss/login")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.qrCodeUrl").isString())
                .andExpect(jsonPath("$.data.expiresIn").value(300));
    }

    @Test
    void batchImportReturnsResult() throws Exception {
        String body = """
                {
                    "candidates": [
                        {"name": "测试候选人", "title": "Java工程师", "phone": "13800138000"}
                    ]
                }
                """;
        mockMvc.perform(post("/api/v1/boss/batch-import")
                        .header("Authorization", recruiterToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.importedCount").value(1));
    }

    @Test
    void aiScreenReturnsResult() throws Exception {
        String body = """
                {
                    "candidateId": "bc1",
                    "jobId": "bj1"
                }
                """;
        mockMvc.perform(post("/api/v1/boss/ai-screen")
                        .header("Authorization", recruiterToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.score").isNumber())
                .andExpect(jsonPath("$.data.status").value("completed"));
    }

    @Test
    void getLabelsReturnsLabels() throws Exception {
        mockMvc.perform(get("/api/v1/boss/labels")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(5));
    }

    @Test
    void unauthorizedReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/boss/status"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deleteAccountReturnsSuccess() throws Exception {
        mockMvc.perform(delete("/api/v1/boss/accounts/ba1")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.deletedId").value("ba1"));
    }

    @Test
    void getCandidateResumeReturnsData() throws Exception {
        mockMvc.perform(get("/api/v1/boss/candidates/bc1/resume")
                        .header("Authorization", recruiterToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.name").value("张三"))
                .andExpect(jsonPath("$.data.resumeUrl").isString());
    }

    @Test
    void sendChatMessageReturnsSuccess() throws Exception {
        String body = """
                {
                    "candidateId": "bc1",
                    "message": "您好，方便聊聊吗？"
                }
                """;
        mockMvc.perform(post("/api/v1/boss/chat")
                        .header("Authorization", recruiterToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.status").value("sent"));
    }
}
