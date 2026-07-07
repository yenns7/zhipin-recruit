package com.hireinsight.pipeline;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PipelineControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void moveWithInvalidStageReturns400() throws Exception {
        mockMvc.perform(post("/api/v1/pipeline/move")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":1,\"jobId\":1,\"toStage\":\"invalid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }
}
