package com.hireinsight.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private final Jwt jwt = new Jwt();
    private final Upload upload = new Upload();
    private final Auth auth = new Auth();
    private final Security security = new Security();

    public Jwt getJwt() { return jwt; }
    public Upload getUpload() { return upload; }
    public Auth getAuth() { return auth; }
    public Security getSecurity() { return security; }

    public static class Jwt {
        private String secret = "change-me-in-prod-use-32-byte-secret";
        private int expiryHours = 8;

        public String getSecret() { return secret; }
        public void setSecret(String secret) { this.secret = secret; }
        public int getExpiryHours() { return expiryHours; }
        public void setExpiryHours(int expiryHours) { this.expiryHours = expiryHours; }
    }

    public static class Upload {
        private String folder = "/tmp/hireinsight_uploads";
        private DataSize maxFileSize = DataSize.ofMegabytes(100);

        public String getFolder() { return folder; }
        public void setFolder(String folder) { this.folder = folder; }
        public DataSize getMaxFileSize() { return maxFileSize; }
        public void setMaxFileSize(DataSize maxFileSize) { this.maxFileSize = maxFileSize; }
    }

    public static class Auth {
        private boolean publicRegistrationEnabled = true;

        public boolean isPublicRegistrationEnabled() { return publicRegistrationEnabled; }
        public void setPublicRegistrationEnabled(boolean publicRegistrationEnabled) {
            this.publicRegistrationEnabled = publicRegistrationEnabled;
        }
    }

    public static class Security {
        private String corsAllowedOrigins = "*";

        public String getCorsAllowedOrigins() { return corsAllowedOrigins; }
        public void setCorsAllowedOrigins(String corsAllowedOrigins) {
            this.corsAllowedOrigins = corsAllowedOrigins;
        }
    }
}
