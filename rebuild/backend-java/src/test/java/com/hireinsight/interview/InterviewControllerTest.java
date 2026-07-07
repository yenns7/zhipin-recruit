package com.hireinsight.interview;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.InterviewFeedback;
import com.hireinsight.repository.InterviewFeedbackRepository;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InterviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private InterviewFeedbackRepository feedbackRepository;

    @BeforeEach
    void setUp() {
        feedbackRepository.deleteAll();
    }

    @Test
    void interviewerOnlySeesOwnInterviews() throws Exception {
        feedbackRepository.save(InterviewFeedback.builder()
                .candidateId(10L)
                .jobId(20L)
                .interviewerId(1L)
                .qaJson("[]")
                .aiReport("{}")
                .build());
        feedbackRepository.save(InterviewFeedback.builder()
                .candidateId(11L)
                .jobId(21L)
                .interviewerId(2L)
                .qaJson("[]")
                .aiReport("{}")
                .build());

        mockMvc.perform(get("/api/v1/interviews")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "interviewer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].interviewerId").value(1));
    }

    @Test
    void recruiterCanScheduleInterviewDraft() throws Exception {
        mockMvc.perform(post("/api/v1/interviews/schedule")
                        .header("Authorization", "Bearer " + jwtTokenProvider.createToken(1L, "recruiter"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"candidateId\":12,\"jobId\":3,\"interviewerId\":7}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.status").value("draft"));
    }
}
