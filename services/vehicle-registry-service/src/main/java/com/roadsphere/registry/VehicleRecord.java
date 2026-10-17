package com.roadsphere.registry;

import java.time.Instant;

public record VehicleRecord(
        String id,
        String ownerId,
        String plate,
        String make,
        String model,
        int modelYear,
        Instant registeredAt) {
}
