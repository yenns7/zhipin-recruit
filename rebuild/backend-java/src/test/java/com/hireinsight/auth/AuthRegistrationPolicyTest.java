package com.hireinsight.auth;

import com.hireinsight.HireInsightApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "app.auth.public-registration-enabled=false")
class AuthRegistrationPolicyTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void disabledPublicRegistrationReturns403() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pilot@hireinsight.com\",\"password\":\"Pass1234\",\"name\":\"Pilot\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Public registration disabled"));
    }
}
