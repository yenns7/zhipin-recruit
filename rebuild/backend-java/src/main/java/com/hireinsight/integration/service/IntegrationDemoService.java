package com.hireinsight.integration.service;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class IntegrationDemoService {

    public static final String ACCOUNT_TABLE = "integration_accounts";
    public static final String CRAWL_TASK_TABLE = "integration_crawl_tasks";

    private final ConcurrentHashMap<String, Map<String, Object>> integrationAccounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> integrationCrawlTasks = new ConcurrentHashMap<>();

    public IntegrationDemoService() {
        integrationAccounts.put("boss-demo", Map.of(
                "id", "boss-demo",
                "provider", "boss",
                "displayName", "BOSS 直聘 demo 账号",
                "status", "demo_connected",
                "createdAt", Instant.now().toString()
        ));
        integrationCrawlTasks.put("crawl-demo-1", Map.of(
                "id", "crawl-demo-1",
                "provider", "boss",
                "keyword", "Java 后端工程师",
                "status", "queued",
                "createdAt", Instant.now().toString()
        ));
    }

    public Map<String, Object> snapshot() {
        return Map.of(
                "demoNotice", "非真实第三方授权，只写本地扩展上下文表。",
                "accounts", List.copyOf(integrationAccounts.values()),
                "crawlTasks", List.copyOf(integrationCrawlTasks.values())
        );
    }
}
