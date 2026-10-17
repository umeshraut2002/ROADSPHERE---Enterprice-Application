package com.roadsphere.status;

import java.util.Optional;

public final class VehicleStatusProjection {

    private VehicleStatusProjection() {
    }

    public static VehicleStatusRecord project(TelemetryEvent event, Optional<VehicleStatusRecord> previous) {
        String status = Boolean.TRUE.equals(event.charging())
                ? "Charging"
                : event.speedKph().doubleValue() > 2.0 ? "Driving" : "Parked";
        String health = event.batteryTemperatureC().doubleValue() >= 42.0
                ? "Critical"
                : event.batteryTemperatureC().doubleValue() >= 38.0 || event.batteryPercent() < 20
                        ? "Attention"
                        : "Healthy";
        int previousBattery = previous.map(VehicleStatusRecord::batteryPercent).orElse(78);
        int previousRange = previous.map(VehicleStatusRecord::rangeKm).orElse(366);
        int rangeKm = (int) Math.max(0, Math.round((double) previousRange * event.batteryPercent() / Math.max(previousBattery, 1)));
        return new VehicleStatusRecord(
                event.vehicleId(), status, health, event.batteryPercent(), event.batteryTemperatureC(), rangeKm,
                event.speedKph(), event.latitude(), event.longitude(), Boolean.TRUE.equals(event.charging()),
                event.recordedAt().toInstant(), event.eventId());
    }
}
