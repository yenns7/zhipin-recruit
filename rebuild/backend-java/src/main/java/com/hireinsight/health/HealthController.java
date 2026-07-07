package com.hireinsight.health;

import com.hireinsight.common.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class HealthController {

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        boolean databaseUp = databaseUp();
        Map<String, Object> payload = Map.of(
                "status", databaseUp ? "UP" : "DOWN",
                "database", databaseUp ? "UP" : "DOWN",
                "service", "hireinsight-api",
                "version", "0.1.0-SNAPSHOT",
                "checkedAt", Instant.now().toString()
        );
        if (databaseUp) {
            return ResponseEntity.ok(ApiResponse.ok(payload));
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.error(503, "Service degraded", payload));
    }

    private boolean databaseUp() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2);
        } catch (Exception ignored) {
            return false;
        }
    }
}
