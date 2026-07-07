package com.zhiping.rebuild.user;

import com.hireinsight.HireInsightApplication;
import com.hireinsight.auth.DemoAuthSessionService;
import com.hireinsight.auth.JwtTokenProvider;
import com.hireinsight.model.Event;
import com.hireinsight.model.User;
import com.hireinsight.repository.EventRepository;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = HireInsightApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.upload.max-file-size=104857600",
        "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class AdminUserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private DemoAuthSessionService demoAuthSessionService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private User adminUser;
    private User recruiterUser;
    private String adminToken;
    private String recruiterToken;

    @BeforeEach
    void setUp() {
        eventRepository.deleteAll();
        userRepository.deleteAll();

        adminUser = userRepository.save(User.builder()
                .name("系统管理员")
                .email("admin@test.com")
                .role("admin")
                .passwordHash(passwordEncoder.encode("Admin1234"))
                .isActive(true)
                .build());
        recruiterUser = userRepository.save(User.builder()
                .name("招聘专员")
                .email("recruiter@test.com")
                .role("recruiter")
                .passwordHash(passwordEncoder.encode("Recruiter1234"))
                .isActive(true)
                .build());

        adminToken = bearerToken(adminUser);
        recruiterToken = bearerToken(recruiterUser);
    }

    @Test
    void adminCanCreateUser() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"新招聘经理",
                                  "email":"manager-created@test.com",
                                  "role":"manager",
                                  "password":"Manager1234",
                                  "active":true
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.name").value("新招聘经理"))
                .andExpect(jsonPath("$.data.email").value("manager-created@test.com"))
                .andExpect(jsonPath("$.data.role").value("manager"))
                .andExpect(jsonPath("$.data.active").value(true));

        User created = userRepository.findByEmail("manager-created@test.com").orElseThrow();
        assertThat(passwordEncoder.matches("Manager1234", created.getPasswordHash())).isTrue();
        assertThat(eventRepository.findAll())
                .extracting(Event::getAction)
                .contains("admin_user_created");
    }

    @Test
    void adminCanPatchUserBasics() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/{userId}", recruiterUser.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"招聘负责人",
                                  "role":"manager",
                                  "active":false
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(recruiterUser.getId()))
                .andExpect(jsonPath("$.data.name").value("招聘负责人"))
                .andExpect(jsonPath("$.data.email").value("recruiter@test.com"))
                .andExpect(jsonPath("$.data.role").value("manager"))
                .andExpect(jsonPath("$.data.active").value(false));

        User updated = userRepository.findById(recruiterUser.getId()).orElseThrow();
        assertThat(updated.getName()).isEqualTo("招聘负责人");
        assertThat(updated.getRole()).isEqualTo("manager");
        assertThat(updated.isActive()).isFalse();
        assertThat(eventRepository.findAll())
                .extracting(Event::getAction)
                .contains("admin_user_updated");
    }

    @Test
    void adminCanResetPasswordAndLoginWithNewPassword() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users/{userId}/reset-password", recruiterUser.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "newPassword":"NewRecruiter1234"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(recruiterUser.getId()))
                .andExpect(jsonPath("$.data.email").value("recruiter@test.com"))
                .andExpect(jsonPath("$.data.passwordReset").value(true));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email":"recruiter@test.com",
                                  "password":"Recruiter1234"
                                }
                                """))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "email":"recruiter@test.com",
                                  "password":"NewRecruiter1234"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.role").value("recruiter"));

        assertThat(eventRepository.findAll())
                .extracting(Event::getAction)
                .contains("admin_user_password_reset");
    }

    @Test
    void recruiterCannotWriteAdminUsers() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"无权创建",
                                  "email":"nope@test.com",
                                  "role":"recruiter",
                                  "password":"Password1234",
                                  "active":true
                                }
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/v1/admin/users/{userId}", adminUser.getId())
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"无权修改"
                                }
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/admin/users/{userId}/reset-password", adminUser.getId())
                        .header("Authorization", "Bearer " + recruiterToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "newPassword":"Blocked1234"
                                }
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidPayloadsReturnBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name":"参数错误",
                                  "email":"not-an-email",
                                  "role":"recruiter",
                                  "password":"Password1234"
                                }
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/api/v1/admin/users/{userId}", recruiterUser.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "role":"super-admin"
                                }
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/admin/users/{userId}/reset-password", recruiterUser.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "newPassword":" "
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    private String bearerToken(User user) {
        String token = jwtTokenProvider.createToken(user.getId(), user.getRole());
        demoAuthSessionService.activate(token);
        return token;
    }
}
