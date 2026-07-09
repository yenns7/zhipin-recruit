package com.hireinsight.offer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.OfferRecord;
import com.hireinsight.repository.OfferRecordRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OfferControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private OfferRecordRepository offerRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private String recruiterToken;

    @BeforeEach
    void setUp() {
        offerRepository.deleteAll();
        recruiterToken = "Bearer " + jwtTokenProvider.createToken(1L, "recruiter");
    }

    @Test
    void createOfferSuccess() throws Exception {
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "candidateId", 100L,
                "jobId", 200L,
                "salary", "30K*16",
                "remark", "优秀候选人"
        ));

        mockMvc.perform(post("/api/v1/offers")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.status").value("PENDING"));
    }

    @Test
    void createOfferWithOnlyRequiredFields() throws Exception {
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "candidateId", 100L,
                "jobId", 200L
        ));

        mockMvc.perform(post("/api/v1/offers")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("PENDING"));
    }

    @Test
    void createOfferMissingCandidateIdReturns400() throws Exception {
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "jobId", 200L
        ));

        mockMvc.perform(post("/api/v1/offers")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void createOfferMissingJobIdReturns400() throws Exception {
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "candidateId", 100L
        ));

        mockMvc.perform(post("/api/v1/offers")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void createOfferEmptyBodyReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/offers")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void createOfferWithoutAuthReturns401() throws Exception {
        mockMvc.perform(post("/api/v1/offers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":1,\"jobId\":2}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void approveOfferSuccess() throws Exception {
        OfferRecord offer = offerRepository.save(OfferRecord.builder()
                .candidateId(100L)
                .jobId(200L)
                .status(OfferRecord.Status.PENDING)
                .build());

        mockMvc.perform(post("/api/v1/offers/{id}/approve", offer.getId())
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(offer.getId()))
                .andExpect(jsonPath("$.data.status").value("APPROVED"));
    }

    @Test
    void withdrawOfferSuccess() throws Exception {
        OfferRecord offer = offerRepository.save(OfferRecord.builder()
                .candidateId(100L)
                .jobId(200L)
                .status(OfferRecord.Status.PENDING)
                .build());

        mockMvc.perform(post("/api/v1/offers/{id}/withdraw", offer.getId())
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(offer.getId()))
                .andExpect(jsonPath("$.data.status").value("WITHDRAWN"));
    }

    @Test
    void approveNonExistentOfferReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/offers/{id}/approve", 99999L)
                        .header("Authorization", recruiterToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void withdrawNonExistentOfferReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/offers/{id}/withdraw", 99999L)
                        .header("Authorization", recruiterToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }
}
