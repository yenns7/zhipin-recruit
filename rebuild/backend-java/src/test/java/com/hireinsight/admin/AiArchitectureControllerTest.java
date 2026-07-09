package com.hireinsight.admin;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiArchitectureControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private String adminToken;
    private String recruiterToken;

    @BeforeEach
    void setUp() {
        adminToken = "Bearer " + jwtTokenProvider.createToken(1L, "admin");
        recruiterToken = "Bearer " + jwtTokenProvider.createToken(2L, "recruiter");
    }

    @Test
    void adminCanAccessAiArchitecture() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ai-architecture")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.systemPrompt").isString())
                .andExpect(jsonPath("$.data.tools").isArray())
                .andExpect(jsonPath("$.data.permissions").isMap())
                .andExpect(jsonPath("$.data.security").isMap())
                .andExpect(jsonPath("$.data.llmConfig").isMap());
    }

    @Test
    void nonAdminGets403() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ai-architecture")
                        .header("Authorization", recruiterToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedGets401() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ai-architecture"))
                .andExpect(status().isUnauthorized());
    }
}
