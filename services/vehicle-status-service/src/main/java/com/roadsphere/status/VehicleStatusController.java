package com.roadsphere.status;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/vehicle-status")
public class VehicleStatusController {

    private final VehicleStatusQueryService queryService;
    private final VehicleStatusService statusService;

    public VehicleStatusController(VehicleStatusQueryService queryService, VehicleStatusService statusService) {
        this.queryService = queryService;
        this.statusService = statusService;
    }

    @GetMapping
    public VehicleStatusPage list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return queryService.list(page, size);
    }

    @GetMapping("/{vehicleId}")
    public VehicleStatusRecord get(@PathVariable String vehicleId) {
        return queryService.get(vehicleId);
    }

    @PostMapping("/events/telemetry-received")
    public ResponseEntity<TelemetryResult> accept(@Valid @RequestBody TelemetryEvent event) {
        TelemetryResult result = statusService.accept(event);
        return ResponseEntity.status("ACCEPTED".equals(result.status()) ? 202 : 200).body(result);
    }
}
