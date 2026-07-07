package com.hireinsight;

import com.hireinsight.config.AppConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class HireInsightApplicationTests {

    @Autowired
    private AppConfig appConfig;

    @Test
    void contextLoads() {
    }

    @Test
    void bindsReadableUploadSize() {
        assertThat(appConfig.getUpload().getMaxFileSize().toBytes()).isEqualTo(100L * 1024 * 1024);
    }
}
