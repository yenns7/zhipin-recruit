package com.hireinsight.config;

import com.hireinsight.model.User;
import com.hireinsight.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

@Configuration
@Profile("dev")
public class DevPilotAccountInitializer {

    private static final String DEFAULT_PASSWORD = "Zhipin2026";

    @Bean
    CommandLineRunner seedPilotAccounts(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            List<PilotAccount> accounts = List.of(
                    new PilotAccount("admin01@mvp.local", "系统管理员", "admin"),
                    new PilotAccount("manager01@mvp.local", "招聘经理01", "manager"),
                    new PilotAccount("lead01@mvp.local", "招聘负责人01", "manager"),
                    new PilotAccount("hr01@mvp.local", "招聘专员01", "recruiter"),
                    new PilotAccount("hr02@mvp.local", "招聘专员02", "recruiter"),
                    new PilotAccount("hr03@mvp.local", "招聘专员03", "recruiter"),
                    new PilotAccount("interviewer01@mvp.local", "面试官01", "interviewer")
            );
            for (PilotAccount account : accounts) {
                if (userRepository.existsByEmail(account.email())) {
                    continue;
                }
                userRepository.save(User.builder()
                        .name(account.name())
                        .email(account.email())
                        .role(account.role())
                        .passwordHash(passwordEncoder.encode(DEFAULT_PASSWORD))
                        .isActive(true)
                        .build());
            }
        };
    }

    private record PilotAccount(String email, String name, String role) {}
}
