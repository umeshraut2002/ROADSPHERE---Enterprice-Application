package com.roadsphere.telemetry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TelemetryIngestionApplication {

    public static void main(String[] args) {
        SpringApplication.run(TelemetryIngestionApplication.class, args);
    }
}
