package com.roadsphere.registry;

import java.util.List;
import java.util.Optional;

public interface VehicleRepository {

    List<VehicleRecord> findPage(long offset, int limit);

    int count();

    Optional<VehicleRecord> findById(String id);

    VehicleRecord insert(VehicleRecord vehicle, String normalizedPlate);
}
