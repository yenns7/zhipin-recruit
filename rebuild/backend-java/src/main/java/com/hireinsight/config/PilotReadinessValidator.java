package com.hireinsight.config;

import com.hireinsight.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Component
@Profile("pilot")
public class PilotReadinessValidator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PilotReadinessValidator.class);

    private static final List<String> WEAK_JWT_SECRETS = List.of(
            "",
            "change-me-in-prod-use-32-byte-secret",
            "change-me-in-production",
            "dev-secret",
            "dev-secret-change-in-prod",
            "test-secret"
    );

    private static final List<String> DEMO_EMAILS = List.of(
            "demo.recruiter@hireinsight.local",
            "demo.manager@hireinsight.local",
            "demo.interviewer@hireinsight.local",
            "demo.admin@hireinsight.local",
            "demo@hireinsight.local",
            "admin01@mvp.local",
            "manager01@mvp.local",
            "lead01@mvp.local",
            "hr01@mvp.local",
            "hr02@mvp.local",
            "hr03@mvp.local",
            "interviewer01@mvp.local"
    );

    private final AppConfig appConfig;
    private final Environment environment;
    private final UserRepository userRepository;

    public PilotReadinessValidator(AppConfig appConfig, Environment environment, UserRepository userRepository) {
        this.appConfig = appConfig;
        this.environment = environment;
        this.userRepository = userRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        validate();
    }

    void validate() {
        List<String> failures = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        String jwtSecret = trim(appConfig.getJwt().getSecret());
        String dbPassword = trim(firstPresent("DATABASE_PASSWORD", "spring.datasource.password"));
        String corsOrigins = trim(appConfig.getSecurity().getCorsAllowedOrigins());
        String uploadFolder = trim(appConfig.getUpload().getFolder());
        String llmApiKey = trim(appConfig.getLlm().getApiKey());
        List<String> activeProfiles = Arrays.asList(environment.getActiveProfiles());

        if (activeProfiles.contains("dev")) {
            failures.add("pilot profile must not be mixed with dev profile");
        }
        if (jwtSecret.length() < 32 || WEAK_JWT_SECRETS.contains(jwtSecret)) {
            failures.add("JWT_SECRET must be a strong non-default value with length >= 32");
        }
        if (dbPassword.isBlank() || "hipass".equals(dbPassword)) {
            failures.add("DATABASE_PASSWORD must be set and must not use the local demo password");
        }
        if (corsOrigins.isBlank() || corsOrigins.contains("*")) {
            failures.add("CORS origins must be explicit company/server origins, not *");
        }
        if (appConfig.getAuth().isPublicRegistrationEnabled()) {
            failures.add("PUBLIC_REGISTRATION_ENABLED must be false for pilot");
        }
        if (uploadFolder.isBlank() || uploadFolder.equals("/tmp") || uploadFolder.startsWith("/tmp/")) {
            failures.add("UPLOAD_FOLDER must be a persistent server directory, not /tmp");
        }
        String encryptionKey = trim(appConfig.getEncryption().getFieldEncryptionKey());
        if (encryptionKey.isBlank() || encryptionKey.length() < 16) {
            failures.add("FIELD_ENCRYPTION_KEY must be set and have sufficient length (>= 16 chars)");
        }
        if (appConfig.getBoss().isDemoMode()) {
            warnings.add("BOSS_DEMO_MODE is enabled; BOSS Zhipin integration will use mock data. "
                    + "Set BOSS_DEMO_MODE=false and configure BOSS_CLI_PATH for real BOSS data in pilot.");
        }
        if (llmApiKey.isBlank()) {
            warnings.add("LLM_API_KEY is not configured; AI features will use mock responses. "
                    + "Configure LLM_API_KEY for real LLM-powered features in pilot.");
        }
        for (String email : DEMO_EMAILS) {
            if (userRepository.existsByEmail(email)) {
                failures.add("demo account must be removed before pilot: " + email);
            }
        }

        if (!warnings.isEmpty()) {
            for (String w : warnings) {
                log.warn("Pilot readiness warning: {}", w);
            }
        }
        if (!failures.isEmpty()) {
            throw new IllegalStateException("Pilot readiness check failed: " + String.join("; ", failures));
        }
    }

    private String firstPresent(String... keys) {
        for (String key : keys) {
            String value = environment.getProperty(key);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
