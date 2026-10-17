package com.roadsphere.status;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Component
public class TelemetryReceiptCleanup {

    private final VehicleStatusRepository repository;

    public TelemetryReceiptCleanup(VehicleStatusRepository repository) {
        this.repository = repository;
    }

    @Scheduled(cron = "0 0 3 * * *", zone = "UTC")
    public void removeExpiredReceipts() {
        repository.deleteExpiredEvents(Instant.now().minus(30, ChronoUnit.DAYS));
    }
}
