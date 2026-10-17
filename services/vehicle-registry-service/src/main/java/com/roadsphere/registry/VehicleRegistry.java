package com.roadsphere.registry;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Year;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class VehicleRegistry {

    private final VehicleRepository repository;

    public VehicleRegistry(VehicleRepository repository) {
        this.repository = repository;
    }

    public VehiclePage list(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new IllegalArgumentException("page must be non-negative and size must be between 1 and 100.");
        }
        long offset = (long) page * size;
        return new VehiclePage(repository.findPage(offset, size), page, size, repository.count());
    }

    public VehicleRecord get(String id) {
        Optional<VehicleRecord> vehicle = repository.findById(id);
        if (vehicle.isEmpty()) {
            throw new NoSuchElementException("No synthetic vehicle exists with this ID.");
        }
        return vehicle.get();
    }

    public VehicleRecord register(RegisterVehicleRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request body must be a JSON object.");
        }
        String ownerId = requiredText(request.ownerId(), "ownerId", 80);
        String plate = requiredText(request.plate(), "plate", 20);
        String make = requiredText(request.make(), "make", 80);
        String model = requiredText(request.model(), "model", 100);
        if (!plate.matches("[A-Za-z0-9 -]+")) {
            throw new IllegalArgumentException("plate may contain only letters, numbers, spaces, and hyphens.");
        }
        if (request.modelYear() == null || request.modelYear() < 1990 || request.modelYear() > Year.now().getValue() + 1) {
            throw new IllegalArgumentException("modelYear must be between 1990 and next year.");
        }
        String normalizedPlate = normalizePlate(plate);
        if (normalizedPlate.isEmpty()) {
            throw new IllegalArgumentException("plate must contain at least one letter or number.");
        }
        VehicleRecord vehicle = new VehicleRecord(
                "VH-" + UUID.randomUUID(), ownerId, plate.trim().toUpperCase(Locale.ROOT),
                make, model, request.modelYear(), Instant.now());
        return repository.insert(vehicle, normalizedPlate);
    }

    private static String requiredText(String value, String field, int maxLength) {
        if (value == null || value.isBlank() || value.trim().length() > maxLength) {
            throw new IllegalArgumentException(field + " must be non-empty and at most " + maxLength + " characters.");
        }
        return value.trim();
    }

    private static String normalizePlate(String plate) {
        return plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }
}
