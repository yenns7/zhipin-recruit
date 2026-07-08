package com.hireinsight.candidate;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Candidate;
import com.hireinsight.model.Event;
import com.hireinsight.model.PipelineStage;
import com.hireinsight.model.User;
import com.hireinsight.repository.*;
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
class CandidateControllerTest {

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

    @Autowired
    private PipelineStageRepository pipelineStageRepository;

    @Autowired
    private EventRepository eventRepository;

    private String recruiterToken;
    private Long candidateId;

    @BeforeEach
    void setUp() {
        eventRepository.deleteAll();
        pipelineStageRepository.deleteAll();
        candidateRepository.deleteAll();
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("cand-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());

        User manager = userRepository.save(User.builder()
                .name("招聘经理")
                .email("cand-manager@test.com")
                .role("manager")
                .passwordHash("irrelevant")
                .build());

        recruiterToken = bearerToken(recruiter);

        Candidate candidate = candidateRepository.save(Candidate.builder()
                .nameMasked("张三")
                .emailMasked("z***@example.com")
                .phoneMasked("138****0000")
                .ownerHrId(recruiter.getId())
                .build());
        candidateId = candidate.getId();
    }

    @Test
    void listWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/candidates"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ownerOptionsReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/candidates/owner-options")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(greaterThanOrEqualTo(2)));
    }

    @Test
    void candidatePipelinesReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/candidates/{id}/pipelines", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void candidateJourneyReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/candidates/{id}/journey", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void reassignOwnerReturnsOk() throws Exception {
        User newOwner = userRepository.save(User.builder()
                .name("新负责人")
                .email("new-owner@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());

        mockMvc.perform(patch("/api/v1/candidates/{id}/owner", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerHrId\":%d}".formatted(newOwner.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.ownerHrId").value(newOwner.getId()));
    }

    @Test
    void reassignOwnerWithoutAuthReturns401() throws Exception {
        mockMvc.perform(patch("/api/v1/candidates/{id}/owner", candidateId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerHrId\":1}"))
                .andExpect(status().is(anyOf(is(401), is(403))));
    }

    @Test
    void candidateJourneyWithEventsReturnsData() throws Exception {
        // Create a pipeline stage and event for the candidate
        pipelineStageRepository.save(PipelineStage.builder()
                .candidateId(candidateId)
                .jobId(1L)
                .stage("ai_screen")
                .updatedBy(1L)
                .build());

        eventRepository.save(Event.builder()
                .actorId(1L)
                .action("candidate_created")
                .entityId(candidateId)
                .entityType("candidate")
                .payload("{\"source\":\"manual\"}")
                .build());

        mockMvc.perform(get("/api/v1/candidates/{id}/journey", candidateId)
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
