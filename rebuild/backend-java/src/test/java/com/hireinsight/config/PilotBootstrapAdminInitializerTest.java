package com.hireinsight.config;

import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PilotBootstrapAdminInitializerTest {

    @Test
    void createsBootstrapAdminOnlyWhenMissingAndFullyConfigured() throws Exception {
        UserRepository userRepository = mock(UserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        MockEnvironment environment = new MockEnvironment()
                .withProperty("PILOT_BOOTSTRAP_ADMIN_EMAIL", "admin@company.example")
                .withProperty("PILOT_BOOTSTRAP_ADMIN_PASSWORD", "AdminStrongPassword2026");

        when(userRepository.existsByEmail("admin@company.example")).thenReturn(false);
        when(passwordEncoder.encode("AdminStrongPassword2026")).thenReturn("encoded-password");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        new PilotBootstrapAdminInitializer(userRepository, passwordEncoder, environment).run();

        verify(userRepository).save(org.mockito.ArgumentMatchers.argThat(user ->
                user.getEmail().equals("admin@company.example")
                        && user.getRole().equals("admin")
                        && user.isActive()
                        && user.getPasswordHash().equals("encoded-password")));
    }

    @Test
    void doesNotOverwriteExistingBootstrapAdmin() throws Exception {
        UserRepository userRepository = mock(UserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        MockEnvironment environment = new MockEnvironment()
                .withProperty("PILOT_BOOTSTRAP_ADMIN_EMAIL", "admin@company.example")
                .withProperty("PILOT_BOOTSTRAP_ADMIN_PASSWORD", "AdminStrongPassword2026");

        when(userRepository.existsByEmail("admin@company.example")).thenReturn(true);

        new PilotBootstrapAdminInitializer(userRepository, passwordEncoder, environment).run();

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void doesNothingWhenBootstrapConfigIsIncomplete() throws Exception {
        UserRepository userRepository = mock(UserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        MockEnvironment environment = new MockEnvironment()
                .withProperty("PILOT_BOOTSTRAP_ADMIN_EMAIL", "admin@company.example");

        new PilotBootstrapAdminInitializer(userRepository, passwordEncoder, environment).run();

        verify(userRepository, never()).save(any(User.class));
        assertThat(environment.getProperty("PILOT_BOOTSTRAP_ADMIN_PASSWORD")).isNull();
    }
}
