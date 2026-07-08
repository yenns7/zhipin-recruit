package com.hireinsight.notifications;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Notification;
import com.hireinsight.model.User;
import com.hireinsight.repository.NotificationRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    private String recruiterToken;
    private User recruiter;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        notificationRepository.deleteAll();

        recruiter = userRepository.save(User.builder()
                .name("招聘专员")
                .email("notif-recruiter@test.com")
                .role("recruiter")
                .passwordHash("irrelevant")
                .build());
        recruiterToken = bearerToken(recruiter);
    }

    @Test
    void listNotificationsReturnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/v1/notifications")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.notifications").isArray())
                .andExpect(jsonPath("$.data.total").value(0));
    }

    @Test
    void listNotificationsReturnsNotifications() throws Exception {
        notificationRepository.save(Notification.builder()
                .userId(recruiter.getId())
                .title("Test notification")
                .message("Test body")
                .type("system")
                .isRead(false)
                .build());

        mockMvc.perform(get("/api/v1/notifications")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.notifications").isArray())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.notifications[0].title").value("Test notification"))
                .andExpect(jsonPath("$.data.notifications[0].is_read").value(false));
    }

    @Test
    void unreadCountReturnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.count").isNumber());
    }

    @Test
    void unreadCountReturnsPositiveCount() throws Exception {
        notificationRepository.save(Notification.builder()
                .userId(recruiter.getId())
                .title("Unread test")
                .message("Body")
                .type("system")
                .isRead(false)
                .build());

        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(greaterThanOrEqualTo(1)));
    }

    @Test
    void unreadCountWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/notifications/unread-count"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void markReadReturnsOk() throws Exception {
        Notification n = notificationRepository.save(Notification.builder()
                .userId(recruiter.getId())
                .title("Mark read test")
                .message("Body")
                .type("system")
                .isRead(false)
                .build());

        mockMvc.perform(put("/api/v1/notifications/{id}/read", n.getId())
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.is_read").value(true));
    }

    @Test
    void markAllReadReturnsOk() throws Exception {
        notificationRepository.save(Notification.builder()
                .userId(recruiter.getId())
                .title("Test 1")
                .message("Body 1")
                .type("system")
                .isRead(false)
                .build());
        notificationRepository.save(Notification.builder()
                .userId(recruiter.getId())
                .title("Test 2")
                .message("Body 2")
                .type("system")
                .isRead(false)
                .build());

        mockMvc.perform(put("/api/v1/notifications/read-all")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        // Verify all are read
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header("Authorization", "Bearer " + recruiterToken))
                .andExpect(jsonPath("$.data.count").value(0));
    }

    @Test
    void listNotificationsUnauthenticatedReturns401() throws Exception {
        mockMvc.perform(get("/api/v1/notifications"))
                .andExpect(status().isUnauthorized());
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
