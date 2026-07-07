package com.hireinsight;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {"com.hireinsight", "com.zhiping.rebuild"})
public class HireInsightApplication {

    public static void main(String[] args) {
        SpringApplication.run(HireInsightApplication.class, args);
    }
}
