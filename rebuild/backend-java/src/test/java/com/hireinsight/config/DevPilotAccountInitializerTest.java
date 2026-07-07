package com.hireinsight.config;

import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DevPilotAccountInitializerTest {

    @Test
    void seedsPythonMvpTrialAccountsForLocalJavaVueDev() throws Exception {
        UserRepository userRepository = mock(UserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        List<User> savedUsers = new ArrayList<>();

        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        when(passwordEncoder.encode("Zhipin2026")).thenReturn("encoded-zhipin");
        when(userRepository.save(org.mockito.ArgumentMatchers.any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            savedUsers.add(user);
            return user;
        });

        CommandLineRunner runner = new DevPilotAccountInitializer()
                .seedPilotAccounts(userRepository, passwordEncoder);

        runner.run();

        assertThat(savedUsers)
                .extracting(User::getEmail)
                .containsExactly(
                        "admin01@mvp.local",
                        "manager01@mvp.local",
                        "lead01@mvp.local",
                        "hr01@mvp.local",
                        "hr02@mvp.local",
                        "hr03@mvp.local",
                        "interviewer01@mvp.local"
                );
        assertThat(savedUsers)
                .extracting(User::getPasswordHash)
                .containsOnly("encoded-zhipin");
        assertThat(savedUsers)
                .extracting(User::getRole)
                .containsExactly("admin", "manager", "manager", "recruiter", "recruiter", "recruiter", "interviewer");
    }
}
