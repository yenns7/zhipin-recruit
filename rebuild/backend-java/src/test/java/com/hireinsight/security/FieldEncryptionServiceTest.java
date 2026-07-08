package com.hireinsight.security;

import com.hireinsight.config.AppConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FieldEncryptionServiceTest {

    private FieldEncryptionService service;
    private AppConfig appConfig;
    private Environment environment;

    @BeforeEach
    void setUp() {
        appConfig = mock(AppConfig.class);
        environment = mock(Environment.class);
        AppConfig.Encryption encryption = new AppConfig.Encryption();
        encryption.setFieldEncryptionKey("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"); // 64 hex chars = 32 bytes
        when(appConfig.getEncryption()).thenReturn(encryption);
        when(environment.getActiveProfiles()).thenReturn(new String[]{"test"});
        service = new FieldEncryptionService(appConfig, environment);
        service.init();
    }

    @Test
    void shouldEncryptAndDecrypt() {
        String plaintext = "boss_cookie_value_12345";
        String encrypted = service.encrypt(plaintext);
        assertNotNull(encrypted);
        assertFalse(encrypted.isEmpty());
        assertNotEquals(plaintext, encrypted);

        String decrypted = service.decrypt(encrypted);
        assertEquals(plaintext, decrypted);
    }

    @Test
    void shouldProduceDifferentCiphertextsForSamePlaintext() {
        String plaintext = "same_value";
        String encrypted1 = service.encrypt(plaintext);
        String encrypted2 = service.encrypt(plaintext);
        assertNotEquals(encrypted1, encrypted2, "AES-GCM must produce different ciphertexts due to random IV");
    }

    @Test
    void shouldFailDecryptWithWrongKey() {
        String plaintext = "test_data";
        String encrypted = service.encrypt(plaintext);

        // Create service with different key
        AppConfig.Encryption differentKey = new AppConfig.Encryption();
        differentKey.setFieldEncryptionKey("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        when(appConfig.getEncryption()).thenReturn(differentKey);
        FieldEncryptionService wrongService = new FieldEncryptionService(appConfig, environment);
        wrongService.init();

        assertThrows(RuntimeException.class, () -> wrongService.decrypt(encrypted));
    }

    @Test
    void shouldRejectNullPlaintext() {
        assertThrows(IllegalArgumentException.class, () -> service.encrypt(null));
    }

    @Test
    void shouldRejectEmptyCiphertext() {
        assertThrows(IllegalArgumentException.class, () -> service.decrypt(""));
        assertThrows(IllegalArgumentException.class, () -> service.decrypt(null));
    }
}
