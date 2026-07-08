package com.hireinsight.job;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Job;
import com.hireinsight.model.User;
import com.hireinsight.repository.JobRepository;
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
class JobControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JobRepository jobRepository;

    private String recruiterToken;
    private Long jobId;

    @BeforeEach
    void setUp() {
        jobRepository.deleteAll();
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("job-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());

        recruiterToken = bearerToken(recruiter);

        Job job = jobRepository.save(Job.builder()
                .title("测试岗位")
                .jdText("测试岗位描述")
                .ownerHrId(recruiter.getId())
                .status("active")
                .build());
        jobId = job.getId();
    }

    @Test
    void updateJobReturnsOk() throws Exception {
        mockMvc.perform(put("/api/v1/jobs/{id}", jobId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"更新后的岗位\",\"jdText\":\"更新后的描述\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.title").value("更新后的岗位"))
                .andExpect(jsonPath("$.data.jdText").value("更新后的描述"));
    }

    @Test
    void updateJobPartialFields() throws Exception {
        mockMvc.perform(put("/api/v1/jobs/{id}", jobId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"仅更新标题\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("仅更新标题"))
                .andExpect(jsonPath("$.data.jdText").value("测试岗位描述"));
    }

    @Test
    void closeJobReturnsOk() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/{id}/close", jobId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("closed"));
    }

    @Test
    void restoreJobReturnsOk() throws Exception {
        // First close
        mockMvc.perform(post("/api/v1/jobs/{id}/close", jobId)
                .header("Authorization", "Bearer " + recruiterToken));
        // Then restore
        mockMvc.perform(post("/api/v1/jobs/{id}/restore", jobId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("active"));
    }

    @Test
    void updateJobWithoutAuthReturns401() throws Exception {
        mockMvc.perform(put("/api/v1/jobs/{id}", jobId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"test\"}"))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    @Test
    void closeJobWithoutAuthReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/jobs/{id}/close", jobId))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
