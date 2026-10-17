package com.roadsphere.status;

public record TelemetryResult(String eventId, String status, VehicleStatusRecord vehicle) {
}
