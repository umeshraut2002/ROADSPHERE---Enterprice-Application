package com.roadsphere.registry;

public record RegisterVehicleRequest(
        String ownerId,
        String plate,
        String make,
        String model,
        Integer modelYear) {
}
