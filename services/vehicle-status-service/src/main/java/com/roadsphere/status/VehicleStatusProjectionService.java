package com.roadsphere.status;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class VehicleStatusProjectionService {

    private final VehicleStatusRepository repository;
    private final ObjectMapper objectMapper;

    public VehicleStatusProjectionService(VehicleStatusRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public TelemetryResult project(TelemetryEvent event) {
        event = event.normalized();
        repository.deleteExpiredEvents(Instant.now().minus(30, ChronoUnit.DAYS));
        String fingerprint = fingerprint(event);
        Optional<String> existing = repository.findEventFingerprint(event.eventId());
        if (existing.isPresent()) return duplicateOrConflict(event, fingerprint, existing.get());

        if (!repository.insertEventIfAbsent(event, fingerprint)) {
            String storedFingerprint = repository.findEventFingerprint(event.eventId())
                    .orElseThrow(() -> new IllegalStateException("A concurrent telemetry event could not be read."));
            return duplicateOrConflict(event, fingerprint, storedFingerprint);
        }

        Optional<VehicleStatusRecord> previous = repository.findByVehicleIdForUpdate(event.vehicleId());
        if (previous.isPresent() && !event.recordedAt().toInstant().isAfter(previous.get().recordedAt())) {
            throw new VehicleStatusException(HttpStatus.CONFLICT, "Stale telemetry",
                    "recordedAt must be newer than the latest vehicle status projection.");
        }

        VehicleStatusRecord projected = VehicleStatusProjection.project(event, previous);
        if (repository.saveIfNewer(projected) != 1) {
            throw new VehicleStatusException(HttpStatus.CONFLICT, "Stale telemetry",
                    "A newer vehicle status projection was stored before this event.");
        }
        return new TelemetryResult(event.eventId(), "ACCEPTED", projected);
    }

    private TelemetryResult duplicateOrConflict(TelemetryEvent event, String fingerprint, String storedFingerprint) {
        if (!MessageDigest.isEqual(fingerprint.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                storedFingerprint.getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw new VehicleStatusException(HttpStatus.CONFLICT, "Event ID conflict",
                    "This eventId has already been used with a different telemetry body.");
        }
        VehicleStatusRecord latest = repository.findByVehicleId(event.vehicleId())
                .orElseThrow(() -> new IllegalStateException("A stored telemetry event has no vehicle status projection."));
        return new TelemetryResult(event.eventId(), "DUPLICATE", latest);
    }

    private String fingerprint(TelemetryEvent event) {
        try {
            byte[] serialized = objectMapper.writeValueAsBytes(event);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(serialized));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Telemetry event fingerprint could not be created.", exception);
        }
    }
}
