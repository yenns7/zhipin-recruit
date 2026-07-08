package com.hireinsight.security;

import com.hireinsight.config.AppConfig;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * AES-GCM field-level symmetric encryption for sensitive fields
 * (e.g., BOSS cookies, tokens).
 * <p>
 * Reads the key from {@code app.encryption.field-encryption-key}.
 * In dev, auto-generates a temporary key if missing (logged warning).
 * In pilot/production, throws an error if the key is missing.
 */
@Service
public class FieldEncryptionService {

    private static final Logger log = LoggerFactory.getLogger(FieldEncryptionService.class);

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int GCM_IV_LENGTH_BYTES = 12;
    private static final int AES_KEY_LENGTH_BYTES = 32; // 256-bit

    private final AppConfig appConfig;
    private final Environment environment;

    private SecretKeySpec key;
    private boolean devKeyUsed = false;

    public FieldEncryptionService(AppConfig appConfig, Environment environment) {
        this.appConfig = appConfig;
        this.environment = environment;
    }

    @PostConstruct
    public void init() {
        String keyStr = appConfig.getEncryption().getFieldEncryptionKey();
        if (keyStr == null || keyStr.isBlank()) {
            String[] activeProfiles = environment.getActiveProfiles();
            boolean isPilotOrProduction = Arrays.asList(activeProfiles).contains("pilot")
                    || Arrays.asList(activeProfiles).contains("production");
            if (isPilotOrProduction) {
                throw new IllegalStateException(
                        "app.encryption.field-encryption-key must be set in pilot/production mode. "
                                + "Generate a 32-byte hex key: openssl rand -hex 32");
            }
            // Dev mode: generate temp key
            byte[] tempKey = new byte[AES_KEY_LENGTH_BYTES];
            new SecureRandom().nextBytes(tempKey);
            this.key = new SecretKeySpec(tempKey, "AES");
            this.devKeyUsed = true;
            log.warn("FIELD_ENCRYPTION_KEY not set; using temporary dev key. "
                    + "Encrypted data will be lost on restart. "
                    + "Set app.encryption.field-encryption-key in production.");
            return;
        }

        byte[] keyBytes;
        if (keyStr.length() == 64) {
            // 32-byte hex-encoded key
            keyBytes = hexToBytes(keyStr);
        } else {
            // Raw bytes from base64 or direct string
            keyBytes = keyStr.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }

        if (keyBytes.length != AES_KEY_LENGTH_BYTES) {
            // Hash to correct length using SHA-256
            try {
                java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                keyBytes = md.digest(keyBytes);
            } catch (Exception e) {
                throw new RuntimeException("Failed to process encryption key", e);
            }
        }

        this.key = new SecretKeySpec(keyBytes, "AES");
        log.info("Field encryption key initialized successfully ({} bytes)", keyBytes.length);
    }

    /**
     * Encrypt plaintext to base64-encoded ciphertext (IV + ciphertext + tag).
     */
    public String encrypt(String plaintext) {
        if (plaintext == null) {
            throw new IllegalArgumentException("plaintext must not be null");
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH_BYTES];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.ENCRYPT_MODE, key, spec);

            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            // Prepend IV to ciphertext
            byte[] combined = new byte[GCM_IV_LENGTH_BYTES + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, GCM_IV_LENGTH_BYTES);
            System.arraycopy(ciphertext, 0, combined, GCM_IV_LENGTH_BYTES, ciphertext.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }

    /**
     * Decrypt base64-encoded ciphertext (IV + ciphertext + tag).
     */
    public String decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.isBlank()) {
            throw new IllegalArgumentException("ciphertext must not be empty");
        }
        try {
            byte[] combined = Base64.getDecoder().decode(ciphertext);

            byte[] iv = Arrays.copyOfRange(combined, 0, GCM_IV_LENGTH_BYTES);
            byte[] encrypted = Arrays.copyOfRange(combined, GCM_IV_LENGTH_BYTES, combined.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv);
            cipher.init(Cipher.DECRYPT_MODE, key, spec);

            byte[] decrypted = cipher.doFinal(encrypted);
            return new String(decrypted, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed: invalid ciphertext or wrong key", e);
        }
    }

    /**
     * Whether a dev-generated temporary key is in use.
     */
    public boolean isDevKey() {
        return devKeyUsed;
    }

    private byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }
}
