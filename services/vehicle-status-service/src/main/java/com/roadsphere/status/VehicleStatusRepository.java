package com.roadsphere.status;

import java.time.Instant;
import java.util.Optional;

public interface VehicleStatusRepository {

    Optional<String> findEventFingerprint(String eventId);

    int deleteExpiredEvents(Instant receivedBefore);

    boolean insertEventIfAbsent(TelemetryEvent event, String fingerprint);

    Optional<VehicleStatusRecord> findByVehicleId(String vehicleId);

    Optional<VehicleStatusRecord> findByVehicleIdForUpdate(String vehicleId);

    int saveIfNewer(VehicleStatusRecord status);

    VehicleStatusPage findPage(long offset, int limit, int page);
}
