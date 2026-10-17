package com.roadsphere.telemetry;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;
import java.util.Optional;

@Service
public class TelemetryIngestionService {

    private static final java.util.regex.Pattern VALID_CORRELATION_ID =
            java.util.regex.Pattern.compile("^[A-Za-z0-9._:-]{1,80}$");

    private final RegisteredVehicleLookup vehicleLookup;
    private final TelemetryOutboxRepository outboxRepository;

    public TelemetryIngestionService(RegisteredVehicleLookup vehicleLookup, TelemetryOutboxRepository outboxRepository) {
        this.vehicleLookup = vehicleLookup;
        this.outboxRepository = outboxRepository;
    }

    public TelemetryAcceptance accept(TelemetryEvent request, String correlationId) {
        TelemetryEvent event = request.normalized();
        Optional<String> existing = outboxRepository.findFingerprint(event.eventId());
        if (existing.isPresent()) {
            verifySameEvent(event, existing.get());
            return new TelemetryAcceptance(event.eventId(), "DUPLICATE", Instant.now());
        }
        vehicleLookup.requireRegistered(event.vehicleId());
        String resolvedCorrelationId = correlationId == null || !VALID_CORRELATION_ID.matcher(correlationId).matches()
                ? UUID.randomUUID().toString() : correlationId;
        if (outboxRepository.insert(event, resolvedCorrelationId) == 0) {
            String existingFingerprint = outboxRepository.findFingerprint(event.eventId())
                    .orElseThrow(() -> new IllegalStateException("A concurrent telemetry event could not be read."));
            verifySameEvent(event, existingFingerprint);
            return new TelemetryAcceptance(event.eventId(), "DUPLICATE", Instant.now());
        }
        return new TelemetryAcceptance(event.eventId(), "ACCEPTED", Instant.now());
    }

    private void verifySameEvent(TelemetryEvent event, String fingerprint) {
        if (!outboxRepository.matchesFingerprint(event, fingerprint)) {
            throw new TelemetryIngestionException(HttpStatus.CONFLICT, "Event ID conflict",
                    "This eventId has already been used with a different telemetry body.");
        }
    }
}
