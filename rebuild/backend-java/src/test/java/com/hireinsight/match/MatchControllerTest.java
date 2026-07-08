package com.hireinsight.match;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Job;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.repository.CandidateRepository;
import com.hireinsight.repository.JobRepository;
import com.hireinsight.repository.PipelineStageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MatchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private CandidateRepository candidateRepository;

    @Autowired
    private PipelineStageRepository pipelineStageRepository;

    private String recruiterToken;
    private String adminToken;

    private Long jobId;
    private Long candidateId1;
    private Long candidateId2;

    @BeforeEach
    void setUp() {
        pipelineStageRepository.deleteAll();
        candidateRepository.deleteAll();
        jobRepository.deleteAll();

        recruiterToken = "Bearer " + jwtTokenProvider.createToken(1L, "recruiter");
        adminToken = "Bearer " + jwtTokenProvider.createToken(2L, "admin");

        // Create a job with JD text containing required and preferred skills
        Job job = Job.builder()
                .title("Java后端工程师")
                .jdText("岗位职责：负责后端服务开发。\n" +
                        "Required: Java, Spring Boot, PostgreSQL\n" +
                        "Preferred: Redis, Docker, Kubernetes\n" +
                        "要求：熟悉微服务架构")
                .ownerHrId(1L)
                .status("active")
                .build();
        job = jobRepository.save(job);
        jobId = job.getId();

        // Candidate 1: matches both required and preferred skills
        Candidate c1 = Candidate.builder()
                .ownerHrId(1L)
                .nameMasked("张三")
                .resumeJson("{\"skills\":[\"Java\",\"Spring Boot\",\"PostgreSQL\",\"Redis\",\"Docker\"],\"totalYearsOfExperience\":5}")
                .build();
        c1 = candidateRepository.save(c1);
        candidateId1 = c1.getId();

        // Candidate 2: only matches some required, no preferred
        Candidate c2 = Candidate.builder()
                .ownerHrId(1L)
                .nameMasked("李四")
                .resumeJson("{\"skills\":[\"Java\",\"MySQL\"],\"yearsOfExperience\":2}")
                .build();
        c2 = candidateRepository.save(c2);
        candidateId2 = c2.getId();
    }

    // --- POST /api/v1/match ---

    @Test
    void matchSingleCandidate() throws Exception {
        mockMvc.perform(post("/api/v1/match")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jobId\":" + jobId + ",\"candidateIds\":[" + candidateId1 + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].candidateId").value(candidateId1))
                .andExpect(jsonPath("$.data[0].score").isNumber())
                .andExpect(jsonPath("$.data[0].matchedRequiredSkills").isArray())
                .andExpect(jsonPath("$.data[0].summary").isString());
    }

    @Test
    void batchMatchCandidates() throws Exception {
        mockMvc.perform(post("/api/v1/match")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jobId\":" + jobId + ",\"candidateIds\":[" + candidateId1 + "," + candidateId2 + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(2))
                // Results should be sorted by score descending (candidate 1 should have higher score)
                .andExpect(jsonPath("$.data[0].candidateId").value(candidateId1))
                .andExpect(jsonPath("$.data[1].candidateId").value(candidateId2));
    }

    // --- GET /api/v1/match/jobs/{jobId}/preview ---

    @Test
    void previewMatchForJob() throws Exception {
        mockMvc.perform(get("/api/v1/match/jobs/{jobId}/preview", jobId)
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(2))
                // Sorted by score descending
                .andExpect(jsonPath("$.data[0].candidateId").value(candidateId1))
                .andExpect(jsonPath("$.data[1].candidateId").value(candidateId2));
    }

    // --- POST /api/v1/match/jobs/{jobId}/match ---

    @Test
    void matchAndAddToPipeline() throws Exception {
        mockMvc.perform(post("/api/v1/match/jobs/{jobId}/match", jobId)
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateIds\":[" + candidateId1 + "," + candidateId2 + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(2));

        // Verify pipeline entries were created
        var pipelineEntries = pipelineStageRepository.findByJobIdOrderByTsDesc(jobId);
        assert pipelineEntries.size() == 2 : "Expected 2 pipeline entries";
        assert pipelineEntries.stream().allMatch(s -> "ai_screen".equals(s.getStage())) :
                "All pipeline entries should have stage 'ai_screen'";
        assert pipelineEntries.stream().anyMatch(s -> s.getCandidateId().equals(candidateId1));
        assert pipelineEntries.stream().anyMatch(s -> s.getCandidateId().equals(candidateId2));
    }

    // --- Error cases ---

    @Test
    void invalidJobIdReturns404() throws Exception {
        mockMvc.perform(post("/api/v1/match")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jobId\":99999,\"candidateIds\":[" + candidateId1 + "]}"))
                .andExpect(status().is4xxClientError())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void invalidJobIdOnPreviewReturns404() throws Exception {
        mockMvc.perform(get("/api/v1/match/jobs/{jobId}/preview", 99999)
                        .header("Authorization", recruiterToken))
                .andExpect(status().is4xxClientError())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void unauthenticatedReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/match")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jobId\":1,\"candidateIds\":[1]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unauthenticatedPreviewReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/match/jobs/{jobId}/preview", 1))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unauthenticatedMatchToPipelineReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/match/jobs/{jobId}/match", 1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateIds\":[1]}"))
                .andExpect(status().isUnauthorized());
    }
}
