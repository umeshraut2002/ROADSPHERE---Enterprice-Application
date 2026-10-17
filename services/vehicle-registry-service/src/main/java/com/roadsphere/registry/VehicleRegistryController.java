package com.roadsphere.registry;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/vehicles")
public class VehicleRegistryController {

    private final VehicleRegistry registry;

    public VehicleRegistryController(VehicleRegistry registry) {
        this.registry = registry;
    }

    @GetMapping
    public VehiclePage list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return registry.list(page, size);
    }

    @GetMapping("/{vehicleId}")
    public VehicleRecord get(@PathVariable String vehicleId) {
        return registry.get(vehicleId);
    }

    @PostMapping
    public ResponseEntity<VehicleRecord> register(@RequestBody RegisterVehicleRequest request) {
        VehicleRecord created = registry.register(request);
        return ResponseEntity.created(URI.create("/api/v1/vehicles/" + created.id())).body(created);
    }
}
