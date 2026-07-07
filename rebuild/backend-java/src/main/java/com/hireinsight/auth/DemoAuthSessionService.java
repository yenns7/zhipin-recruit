package com.hireinsight.auth;

import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class DemoAuthSessionService {

    private final ConcurrentHashMap<String, Boolean> sessions = new ConcurrentHashMap<>();

    public void activate(String token) {
        sessions.put(token, true);
    }

    public boolean isActive(String token) {
        return sessions.containsKey(token) && sessions.get(token);
    }

    public boolean isValid(String token) {
        return isActive(token);
    }

    public void invalidate(String token) {
        sessions.put(token, false);
    }
}
