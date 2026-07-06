package com.hireinsight.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private final Jwt jwt = new Jwt();
    private final Upload upload = new Upload();

    public Jwt getJwt() { return jwt; }
    public Upload getUpload() { return upload; }

    public static class Jwt {
        private String secret = "change-me-in-prod";
        private int expiryHours = 8;

        public String getSecret() { return secret; }
        public void setSecret(String secret) { this.secret = secret; }
        public int getExpiryHours() { return expiryHours; }
        public void setExpiryHours(int expiryHours) { this.expiryHours = expiryHours; }
    }

    public static class Upload {
        private String folder = "/tmp/hireinsight_uploads";
        private long maxFileSize = 100 * 1024 * 1024;

        public String getFolder() { return folder; }
        public void setFolder(String folder) { this.folder = folder; }
        public long getMaxFileSize() { return maxFileSize; }
        public void setMaxFileSize(long maxFileSize) { this.maxFileSize = maxFileSize; }
    }
}
