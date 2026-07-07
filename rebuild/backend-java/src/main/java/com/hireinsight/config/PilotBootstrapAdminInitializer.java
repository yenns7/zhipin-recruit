package com.hireinsight.config;

import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@Profile("pilot")
public class PilotBootstrapAdminInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    public PilotBootstrapAdminInitializer(UserRepository userRepository,
                                          PasswordEncoder passwordEncoder,
                                          Environment environment) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
    }

    @Override
    public void run(String... args) {
        String email = trim(environment.getProperty("PILOT_BOOTSTRAP_ADMIN_EMAIL"));
        String password = trim(environment.getProperty("PILOT_BOOTSTRAP_ADMIN_PASSWORD"));
        if (email.isBlank() || password.isBlank() || userRepository.existsByEmail(email)) {
            return;
        }

        userRepository.save(User.builder()
                .name("试点初始化管理员")
                .email(email)
                .role("admin")
                .passwordHash(passwordEncoder.encode(password))
                .isActive(true)
                .build());
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
