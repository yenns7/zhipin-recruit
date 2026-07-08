package com.hireinsight.resume;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.User;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
class ResumeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CandidateRepository candidateRepository;

    private String recruiterToken;
    private Long candidateId;

    @BeforeEach
    void setUp() {
        candidateRepository.deleteAll();
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("resume-recruiter")
                .email("resume-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());

        recruiterToken = bearerToken(recruiter);

        Candidate candidate = candidateRepository.save(Candidate.builder()
                .nameMasked("测试简历")
                .emailMasked("t***@example.com")
                .phoneMasked("138****0001")
                .ownerHrId(recruiter.getId())
                .rawFilePath("/tmp/test_resume.txt")
                .resumeJson("{}")
                .parseStatus("failed")
                .parseError("Previous error")
                .build());
        candidateId = candidate.getId();
    }

    @Test
    void retryParse_returnsProcessing() throws Exception {
        mockMvc.perform(post("/api/v1/resumes/{candidateId}/retry-parse", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.candidateId").value(candidateId))
                .andExpect(jsonPath("$.data.parseStatus").value("processing"));
    }

    @Test
    void retryParse_returns403_whenNotOwner() throws Exception {
        // Create a different user
        User otherUser = userRepository.save(User.builder()
                .name("other-user")
                .email("other@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());
        String otherToken = bearerToken(otherUser);

        mockMvc.perform(post("/api/v1/resumes/{candidateId}/retry-parse", candidateId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(403));
    }

    @Test
    void retryParse_returns401_whenNoAuth() throws Exception {
        mockMvc.perform(post("/api/v1/resumes/{candidateId}/retry-parse", candidateId))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    @Test
    void retryParse_returns404_whenCandidateNotFound() throws Exception {
        mockMvc.perform(post("/api/v1/resumes/{candidateId}/retry-parse", 99999L)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().is(anyOf(is(404), is(400))));
    }

    @Test
    void parseStatus_returnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/resumes/{candidateId}/parse-status", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.candidateId").value(candidateId))
                .andExpect(jsonPath("$.data.parseStatus").value("failed"))
                .andExpect(jsonPath("$.data.parseError").value("Previous error"));
    }

    @Test
    void parseStatus_returns404_whenCandidateNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/resumes/{candidateId}/parse-status", 99999L)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().is(anyOf(is(404), is(400))));
    }

    @Test
    void parseStatus_returnsFailed_whenCandidateHasFailedStatus() throws Exception {
        // Verify the initial failed status is preserved until async parse runs
        mockMvc.perform(get("/api/v1/resumes/{candidateId}/parse-status", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(jsonPath("$.data.parseStatus").value("failed"))
                .andExpect(jsonPath("$.data.parseError").value("Previous error"));
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
