package com.roadsphere.status;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class VehicleStatusQueryService {

    private final VehicleStatusRepository repository;

    public VehicleStatusQueryService(VehicleStatusRepository repository) {
        this.repository = repository;
    }

    public VehicleStatusPage list(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new VehicleStatusException(HttpStatus.BAD_REQUEST, "Invalid pagination",
                    "page must be non-negative and size must be between 1 and 100.");
        }
        long offset = (long) page * size;
        return repository.findPage(offset, size, page);
    }

    public VehicleStatusRecord get(String vehicleId) {
        if (vehicleId == null || vehicleId.isBlank() || vehicleId.length() > 32) {
            throw new VehicleStatusException(HttpStatus.BAD_REQUEST, "Invalid vehicle ID",
                    "vehicleId must be a non-empty value of at most 32 characters.");
        }
        return repository.findByVehicleId(vehicleId)
                .orElseThrow(() -> new VehicleStatusException(HttpStatus.NOT_FOUND, "Vehicle status not found",
                        "No status projection exists for this vehicle."));
    }
}
