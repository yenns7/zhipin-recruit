package com.hireinsight.bi;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Job;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.JobRepository;
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
class BiControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private CandidateRepository candidateRepository;

    @Autowired
    private JobRepository jobRepository;

    @BeforeEach
    void setUp() {
        candidateRepository.deleteAll();
        jobRepository.deleteAll();

        jobRepository.save(Job.builder()
                .title("Java 后端工程师")
                .jdText("负责核心业务系统")
                .ownerHrId(1L)
                .status("active")
                .build());
        jobRepository.save(Job.builder()
                .title("前端工程师")
                .jdText("负责 Vue 前端")
                .ownerHrId(2L)
                .status("active")
                .build());

        candidateRepository.save(Candidate.builder()
                .ownerHrId(1L)
                .nameMasked("候选人甲")
                .resumeJson("{}")
                .build());
        candidateRepository.save(Candidate.builder()
                .ownerHrId(2L)
                .nameMasked("候选人乙")
                .resumeJson("{}")
                .build());
    }

    @Test
    void recruiterOverviewUsesOwnOwnershipScope() throws Exception {
        mockMvc.perform(get("/api/v1/bi/overview")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeJobs").value(1))
                .andExpect(jsonPath("$.data.candidateTotal").value(1))
                .andExpect(jsonPath("$.data.parsedCandidates").value(1))
                .andExpect(jsonPath("$.data.adminOrManager").value(false));
    }

    @Test
    void recruiterOverviewReturnsZeroMetricsForEmptyLocalTrialData() throws Exception {
        candidateRepository.deleteAll();
        jobRepository.deleteAll();

        mockMvc.perform(get("/api/v1/bi/overview")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeJobs").value(0))
                .andExpect(jsonPath("$.data.candidateTotal").value(0))
                .andExpect(jsonPath("$.data.parsedCandidates").value(0))
                .andExpect(jsonPath("$.data.adminOrManager").value(false));
    }

    @Test
    void managerOverviewUsesTeamScope() throws Exception {
        mockMvc.perform(get("/api/v1/bi/overview")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(9L, "manager")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeJobs").value(2))
                .andExpect(jsonPath("$.data.candidateTotal").value(2))
                .andExpect(jsonPath("$.data.parsedCandidates").value(2))
                .andExpect(jsonPath("$.data.adminOrManager").value(true));
    }
}
