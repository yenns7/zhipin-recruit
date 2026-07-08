package com.hireinsight.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

import java.util.HashMap;
import java.util.Map;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private final Jwt jwt = new Jwt();
    private final Upload upload = new Upload();
    private final Auth auth = new Auth();
    private final Security security = new Security();
    private final Llm llm = new Llm();
    private final Encryption encryption = new Encryption();
    private final Boss boss = new Boss();
    private final Map<String, RateLimitConfig> rateLimit = new HashMap<>();

    public Jwt getJwt() { return jwt; }
    public Upload getUpload() { return upload; }
    public Auth getAuth() { return auth; }
    public Security getSecurity() { return security; }
    public Llm getLlm() { return llm; }
    public Encryption getEncryption() { return encryption; }
    public Boss getBoss() { return boss; }
    public Map<String, RateLimitConfig> getRateLimit() { return rateLimit; }

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
        private boolean headersEnabled = true;

        public String getCorsAllowedOrigins() { return corsAllowedOrigins; }
        public void setCorsAllowedOrigins(String corsAllowedOrigins) {
            this.corsAllowedOrigins = corsAllowedOrigins;
        }
        public boolean isHeadersEnabled() { return headersEnabled; }
        public void setHeadersEnabled(boolean headersEnabled) { this.headersEnabled = headersEnabled; }
    }

    public static class Encryption {
        private String fieldEncryptionKey = "";

        public String getFieldEncryptionKey() { return fieldEncryptionKey; }
        public void setFieldEncryptionKey(String fieldEncryptionKey) {
            this.fieldEncryptionKey = fieldEncryptionKey;
        }
    }

    public static class RateLimitConfig {
        private int limit = 20;
        private int windowSeconds = 60;

        public int getLimit() { return limit; }
        public void setLimit(int limit) { this.limit = limit; }
        public int getWindowSeconds() { return windowSeconds; }
        public void setWindowSeconds(int windowSeconds) { this.windowSeconds = windowSeconds; }
    }

    public static class Boss {
        private boolean demoMode = true;
        private String cliPath = "";
        private int maxImportLimit = 50;
        private double intervalSeconds = 1.5;
        private int cliTimeout = 60;

        public boolean isDemoMode() { return demoMode; }
        public void setDemoMode(boolean demoMode) { this.demoMode = demoMode; }
        public String getCliPath() { return cliPath; }
        public void setCliPath(String cliPath) { this.cliPath = cliPath; }
        public int getMaxImportLimit() { return maxImportLimit; }
        public void setMaxImportLimit(int maxImportLimit) { this.maxImportLimit = maxImportLimit; }
        public double getIntervalSeconds() { return intervalSeconds; }
        public void setIntervalSeconds(double intervalSeconds) { this.intervalSeconds = intervalSeconds; }
        public int getCliTimeout() { return cliTimeout; }
        public void setCliTimeout(int cliTimeout) { this.cliTimeout = cliTimeout; }
    }

    public static class Llm {
        private String provider = "openai";
        private String apiKey = "";
        private String apiUrl = "https://api.openai.com/v1/chat/completions";
        private String modelFast = "gpt-4o-mini";
        private String modelThink = "gpt-4o";
        private String modelPro = "o3-mini";
        private int timeout = 120;
        private int maxRetry = 3;
        private double temperature = 0.7;

        public String getProvider() { return provider; }
        public void setProvider(String provider) { this.provider = provider; }
        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }
        public String getApiUrl() { return apiUrl; }
        public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
        public String getModelFast() { return modelFast; }
        public void setModelFast(String modelFast) { this.modelFast = modelFast; }
        public String getModelThink() { return modelThink; }
        public void setModelThink(String modelThink) { this.modelThink = modelThink; }
        public String getModelPro() { return modelPro; }
        public void setModelPro(String modelPro) { this.modelPro = modelPro; }
        public int getTimeout() { return timeout; }
        public void setTimeout(int timeout) { this.timeout = timeout; }
        public int getMaxRetry() { return maxRetry; }
        public void setMaxRetry(int maxRetry) { this.maxRetry = maxRetry; }
        public double getTemperature() { return temperature; }
        public void setTemperature(double temperature) { this.temperature = temperature; }
    }
}
