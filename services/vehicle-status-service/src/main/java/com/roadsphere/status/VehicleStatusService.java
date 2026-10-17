package com.roadsphere.status;

import org.springframework.stereotype.Service;

@Service
public class VehicleStatusService {

    private final RegisteredVehicleLookup registeredVehicleLookup;
    private final VehicleStatusProjectionService projectionService;

    public VehicleStatusService(RegisteredVehicleLookup registeredVehicleLookup,
                                VehicleStatusProjectionService projectionService) {
        this.registeredVehicleLookup = registeredVehicleLookup;
        this.projectionService = projectionService;
    }

    public TelemetryResult accept(TelemetryEvent request) {
        TelemetryEvent event = request.normalized();
        registeredVehicleLookup.requireRegistered(event.vehicleId());
        return projectionService.project(event);
    }
}
