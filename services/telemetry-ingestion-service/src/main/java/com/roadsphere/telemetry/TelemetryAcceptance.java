package com.roadsphere.telemetry;

import java.time.Instant;

public record TelemetryAcceptance(String eventId, String status, Instant receivedAt) {
}
