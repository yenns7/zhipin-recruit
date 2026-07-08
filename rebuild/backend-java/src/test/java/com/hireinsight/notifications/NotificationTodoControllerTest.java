package com.hireinsight.notifications;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.User;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class NotificationTodoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private UserRepository userRepository;

    private String recruiterToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        User recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("notif-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());
        recruiterToken = bearerToken(recruiter);

        User admin = userRepository.save(User.builder()
                .name("管理员")
                .email("notif-admin@test.com")
                .role("admin")
                .passwordHash("irrelevant")
                .build());
        adminToken = bearerToken(admin);
    }

    @Test
    void unreadCountReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/todos/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.count").isNumber());
    }

    @Test
    void unreadCountReturnsPositiveCount() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/todos/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(greaterThanOrEqualTo(0)));
    }

    @Test
    void unreadCountAdminReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/todos/unread-count")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.count").isNumber());
    }

    @Test
    void unreadCountAfterCompleteIsZero() throws Exception {
        // Complete the default todo
        mockMvc.perform(post("/api/v1/notifications/todos/recruiter-1/complete")
                .header("Authorization", "Bearer " + recruiterToken));

        mockMvc.perform(get("/api/v1/notifications/todos/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(0));
    }

    @Test
    void unreadCountWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/todos/unread-count"))
                .andExpect(status().isUnauthorized());
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
