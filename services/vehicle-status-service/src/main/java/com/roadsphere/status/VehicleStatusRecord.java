package com.roadsphere.status;

import java.math.BigDecimal;
import java.time.Instant;

public record VehicleStatusRecord(
        String vehicleId,
        String status,
        String health,
        int batteryPercent,
        BigDecimal batteryTemperatureC,
        int rangeKm,
        BigDecimal speedKph,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean charging,
        Instant recordedAt,
        String eventId) {
}
