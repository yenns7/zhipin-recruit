package com.hireinsight.llm;

import com.hireinsight.config.AppConfig;
import org.springframework.stereotype.Component;

/**
 * Configuration facade for LLM settings read from app.llm.* properties.
 */
@Component
public class LlmConfig {

    private final AppConfig appConfig;

    public LlmConfig(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    public String getProvider() {
        return appConfig.getLlm().getProvider();
    }

    public String getApiKey() {
        return appConfig.getLlm().getApiKey();
    }

    public String getApiUrl() {
        return appConfig.getLlm().getApiUrl();
    }

    public String getModelFast() {
        return appConfig.getLlm().getModelFast();
    }

    public String getModelThink() {
        return appConfig.getLlm().getModelThink();
    }

    public String getModelPro() {
        return appConfig.getLlm().getModelPro();
    }

    public int getTimeout() {
        return appConfig.getLlm().getTimeout();
    }

    public int getMaxRetry() {
        return appConfig.getLlm().getMaxRetry();
    }

    public double getTemperature() {
        return appConfig.getLlm().getTemperature();
    }
}
