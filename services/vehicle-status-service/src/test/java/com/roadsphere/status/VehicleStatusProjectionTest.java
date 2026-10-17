package com.roadsphere.status;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;

class VehicleStatusProjectionTest {

    @Test
    void projectsDrivingStatusElevatedTemperatureAndProportionalRange() {
        VehicleStatusRecord previous = status(80, 400, Instant.parse("2026-10-17T08:00:00Z"));

        VehicleStatusRecord projected = VehicleStatusProjection.project(
                event("event-2", "2026-10-17T08:01:00Z", 40, "39", "50", false), Optional.of(previous));

        assertEquals("Driving", projected.status());
        assertEquals("Attention", projected.health());
        assertEquals(200, projected.rangeKm());
        assertEquals(40, projected.batteryPercent());
    }

    @Test
    void chargingTakesPriorityAndCriticalTemperatureRaisesCriticalHealth() {
        VehicleStatusRecord projected = VehicleStatusProjection.project(
                event("event-3", "2026-10-17T08:02:00Z", 65, "42", "90", true), Optional.empty());

        assertEquals("Charging", projected.status());
        assertEquals("Critical", projected.health());
    }

    @Test
    void lowBatteryWarnsAndStoppedVehicleIsParked() {
        VehicleStatusRecord projected = VehicleStatusProjection.project(
                event("event-4", "2026-10-17T08:03:00Z", 10, "25", "0", false), Optional.empty());

        assertEquals("Parked", projected.status());
        assertEquals("Attention", projected.health());
    }

    private static VehicleStatusRecord status(int battery, int range, Instant recordedAt) {
        return new VehicleStatusRecord("RS-2048", "Parked", "Healthy", battery, new BigDecimal("28"), range,
                BigDecimal.ZERO, new BigDecimal("52.52"), new BigDecimal("13.405"), false, recordedAt, "event-1");
    }

    static TelemetryEvent event(String id, String time, int battery, String temperature, String speed, boolean charging) {
        return new TelemetryEvent(id, "RS-2048", OffsetDateTime.parse(time), battery,
                new BigDecimal(temperature), new BigDecimal(speed), new BigDecimal("52.52"),
                new BigDecimal("13.405"), charging);
    }
}
