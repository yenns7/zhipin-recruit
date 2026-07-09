package com.hireinsight.demand;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.RecruitmentDemand;
import com.hireinsight.repository.DemandRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DemandControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemandRepository demandRepository;

    private String recruiterToken;
    private String managerToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        demandRepository.deleteAll();
        recruiterToken = "Bearer " + jwtTokenProvider.createToken(1L, "recruiter");
        managerToken = "Bearer " + jwtTokenProvider.createToken(2L, "manager");
        adminToken = "Bearer " + jwtTokenProvider.createToken(3L, "admin");
    }

    @Test
    void createDemandSuccess() throws Exception {
        mockMvc.perform(post("/api/v1/demands")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "requestNo": "DEM-2024-001",
                                    "requesterName": "张三",
                                    "department": "技术部",
                                    "hiringManagerName": "李四",
                                    "priority": "high",
                                    "headcount": 2
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.id").isNumber());
    }

    @Test
    void listDemands() throws Exception {
        demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());
        demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-002")
                .requesterName("王五")
                .department("产品部")
                .hiringManagerName("赵六")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());

        mockMvc.perform(get("/api/v1/demands")
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void listDemandsFilterByStatus() throws Exception {
        demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .status("open")
                .build());
        demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-002")
                .requesterName("王五")
                .department("产品部")
                .hiringManagerName("赵六")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .status("closed")
                .build());

        mockMvc.perform(get("/api/v1/demands?status=open")
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].status").value("open"));
    }

    @Test
    void getDemandDetail() throws Exception {
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());

        mockMvc.perform(get("/api/v1/demands/{id}", demand.getId())
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.requestNo").value("DEM-001"))
                .andExpect(jsonPath("$.data.metrics").exists())
                .andExpect(jsonPath("$.data.riskFlags").isArray())
                .andExpect(jsonPath("$.data.metrics.recommendedCount").isNumber())
                .andExpect(jsonPath("$.data.metrics.interviewCount").isNumber())
                .andExpect(jsonPath("$.data.metrics.offerCount").isNumber());
    }

    @Test
    void updateDemand() throws Exception {
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());

        mockMvc.perform(patch("/api/v1/demands/{id}", demand.getId())
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "priority": "high",
                                    "headcount": 3,
                                    "note": "紧急招聘"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(demand.getId()));
    }

    @Test
    void closeDemand() throws Exception {
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());

        mockMvc.perform(post("/api/v1/demands/{id}/close", demand.getId())
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closeReason\": \"已招满\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("closed"));
    }

    @Test
    void restoreClosedDemand() throws Exception {
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .status("closed")
                .closeReason("已招满")
                .build());

        mockMvc.perform(post("/api/v1/demands/{id}/restore", demand.getId())
                        .header("Authorization", recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("open"));
    }

    @Test
    void downgradeDemand() throws Exception {
        RecruitmentDemand demand = demandRepository.save(RecruitmentDemand.builder()
                .requestNo("DEM-001")
                .requesterName("张三")
                .department("技术部")
                .hiringManagerName("李四")
                .ownerHrId(1L)
                .requestedAt(Instant.now())
                .build());

        mockMvc.perform(post("/api/v1/demands/{id}/downgrade", demand.getId())
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"downgradeReason\": \"预算缩减\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("downgraded"));
    }

    @Test
    void withoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/demands"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createDemandWithInvalidPayloadReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/demands")
                        .header("Authorization", recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }
}
