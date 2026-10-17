package com.roadsphere.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class VehicleStatusProjectionServiceTest {

    @Test
    void acceptsOneEventReplaysIdenticalBodyAndRejectsChangedDuplicate() {
        InMemoryVehicleStatusRepository repository = new InMemoryVehicleStatusRepository();
        VehicleStatusProjectionService service = new VehicleStatusProjectionService(repository, new ObjectMapper().findAndRegisterModules());
        TelemetryEvent event = VehicleStatusProjectionTest.event("event-unit-1", "2026-10-17T08:00:00Z", 60, "30", "0", false);

        TelemetryResult accepted = service.project(event);
        TelemetryResult duplicate = service.project(event);

        assertEquals("ACCEPTED", accepted.status());
        assertEquals("DUPLICATE", duplicate.status());
        assertEquals(accepted.vehicle(), duplicate.vehicle());
        assertEquals(1, repository.events.size());
        assertThrows(VehicleStatusException.class,
                () -> service.project(VehicleStatusProjectionTest.event("event-unit-1", "2026-10-17T08:00:00Z", 59, "30", "0", false)));
    }

    private static final class InMemoryVehicleStatusRepository implements VehicleStatusRepository {

        private final Map<String, String> events = new HashMap<>();
        private final Map<String, VehicleStatusRecord> statuses = new HashMap<>();

        @Override
        public Optional<String> findEventFingerprint(String eventId) {
            return Optional.ofNullable(events.get(eventId));
        }

        @Override
        public int deleteExpiredEvents(Instant receivedBefore) {
            return 0;
        }

        @Override
        public boolean insertEventIfAbsent(TelemetryEvent event, String fingerprint) {
            return events.putIfAbsent(event.eventId(), fingerprint) == null;
        }

        @Override
        public Optional<VehicleStatusRecord> findByVehicleId(String vehicleId) {
            return Optional.ofNullable(statuses.get(vehicleId));
        }

        @Override
        public Optional<VehicleStatusRecord> findByVehicleIdForUpdate(String vehicleId) {
            return findByVehicleId(vehicleId);
        }

        @Override
        public int saveIfNewer(VehicleStatusRecord status) {
            VehicleStatusRecord previous = statuses.get(status.vehicleId());
            if (previous != null && !status.recordedAt().isAfter(previous.recordedAt())) return 0;
            statuses.put(status.vehicleId(), status);
            return 1;
        }

        @Override
        public VehicleStatusPage findPage(long offset, int limit, int page) {
            List<VehicleStatusRecord> all = new ArrayList<>(statuses.values());
            all.sort(Comparator.comparing(VehicleStatusRecord::vehicleId));
            int start = (int) Math.min(offset, all.size());
            int end = Math.min(start + limit, all.size());
            return new VehicleStatusPage(all.subList(start, end), page, limit, all.size());
        }
    }
}
