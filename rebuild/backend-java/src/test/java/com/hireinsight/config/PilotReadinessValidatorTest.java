package com.hireinsight.config;

import com.hireinsight.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PilotReadinessValidatorTest {

    private AppConfig appConfig;
    private MockEnvironment environment;
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        appConfig = new AppConfig();
        appConfig.getJwt().setSecret("pilot-secret-abcdefghijklmnopqrstuvwxyz-123456");
        appConfig.getAuth().setPublicRegistrationEnabled(false);
        appConfig.getSecurity().setCorsAllowedOrigins("https://hr-pilot.example.com");
        appConfig.getUpload().setFolder("/srv/hireinsight/uploads");
        appConfig.getEncryption().setFieldEncryptionKey("pilot-enc-key-abcdef1234567890");

        environment = new MockEnvironment()
                .withProperty("DATABASE_PASSWORD", "strong-db-password")
                .withProperty("DATABASE_URL", "jdbc:postgresql://db.example.com:5432/hireinsight");
        environment.setActiveProfiles("pilot");

        userRepository = mock(UserRepository.class);
        when(userRepository.existsByEmail(anyString())).thenReturn(false);
    }

    @Test
    void acceptsHardenedPilotConfiguration() {
        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatCode(validator::validate).doesNotThrowAnyException();
    }

    @Test
    void rejectsWeakJwtSecret() {
        appConfig.getJwt().setSecret("change-me-in-prod-use-32-byte-secret");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void rejectsDefaultDatabasePassword() {
        environment.setProperty("DATABASE_PASSWORD", "hipass");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DATABASE_PASSWORD");
    }

    @Test
    void rejectsWildcardCors() {
        appConfig.getSecurity().setCorsAllowedOrigins("*");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORS");
    }

    @Test
    void rejectsPublicRegistrationInPilot() {
        appConfig.getAuth().setPublicRegistrationEnabled(true);

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PUBLIC_REGISTRATION_ENABLED");
    }

    @Test
    void rejectsTmpUploadFolder() {
        appConfig.getUpload().setFolder("/tmp/hireinsight_uploads");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("UPLOAD_FOLDER");
    }

    @Test
    void rejectsMixedDevAndPilotProfiles() {
        environment.setActiveProfiles("pilot", "dev");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("dev");
    }

    @Test
    void rejectsExistingDemoAccounts() {
        when(userRepository.existsByEmail("demo.admin@hireinsight.local")).thenReturn(true);

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("demo.admin@hireinsight.local");
    }

    @Test
    void rejectsPythonMvpTrialAccountsInPilot() {
        when(userRepository.existsByEmail("hr01@mvp.local")).thenReturn(true);

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("hr01@mvp.local");
    }

    @Test
    void rejectsMissingEncryptionKey() {
        appConfig.getEncryption().setFieldEncryptionKey("");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIELD_ENCRYPTION_KEY");
    }

    @Test
    void rejectsWeakEncryptionKey() {
        appConfig.getEncryption().setFieldEncryptionKey("short");

        PilotReadinessValidator validator = new PilotReadinessValidator(appConfig, environment, userRepository);

        assertThatThrownBy(validator::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIELD_ENCRYPTION_KEY");
    }
}
