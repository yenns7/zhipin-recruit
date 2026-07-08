package com.hireinsight.pipeline;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class PipelineControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private UserRepository userRepository;

    private String recruiterToken;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("pipe-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());
        recruiterToken = bearerToken(recruiter);
    }

    @Test
    void moveWithInvalidStageReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/pipeline/move")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":1,\"jobId\":1,\"toStage\":\"invalid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void getOfferReturns404WhenNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/pipeline/999/candidates/999/offer")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void saveOfferReturnsOk() throws Exception {
        mockMvc.perform(put("/api/v1/pipeline/{jobId}/candidates/{candidateId}/offer", 10L, 10L)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"salary":"50-60万","onboardDate":"2026-08-01","notes":"候选人已确认"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.salary").value("50-60万"))
                .andExpect(jsonPath("$.data.onboardDate").value("2026-08-01"))
                .andExpect(jsonPath("$.data.notes").value("候选人已确认"));
    }

    @Test
    void saveAndGetOfferReturnsData() throws Exception {
        // Save offer
        mockMvc.perform(put("/api/v1/pipeline/{jobId}/candidates/{candidateId}/offer", 20L, 20L)
                .header("Authorization", "Bearer " + recruiterToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"salary\":\"80万\",\"onboardDate\":\"2026-09-01\",\"notes\":\"\"}"))
                .andExpect(status().isOk());

        // Get offer
        mockMvc.perform(get("/api/v1/pipeline/20/candidates/20/offer")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.salary").value("80万"))
                .andExpect(jsonPath("$.data.onboardDate").value("2026-09-01"))
                .andExpect(jsonPath("$.data.candidateId").value(20))
                .andExpect(jsonPath("$.data.jobId").value(20));
    }

    @Test
    void saveOfferWithoutAuthReturns401() throws Exception {
        mockMvc.perform(put("/api/v1/pipeline/1/candidates/1/offer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salary\":\"50万\"}"))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
