package com.roadsphere.registry;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class VehicleRegistryTest {

    @Test
    void listsBoundedPagesFromRepository() {
        VehicleRegistry registry = registry();

        VehiclePage firstPage = registry.list(0, 3);
        VehiclePage pastEnd = registry.list(20, 3);

        assertEquals(8, firstPage.total());
        assertEquals(3, firstPage.items().size());
        assertEquals(0, pastEnd.items().size());
        assertThrows(IllegalArgumentException.class, () -> registry.list(0, 101));
    }

    @Test
    void rejectsDuplicateNormalizedPlateForSameOwner() {
        VehicleRegistry registry = registry();
        RegisterVehicleRequest first = new RegisterVehicleRequest("owner-1", "xy 123", "Volvo", "EX30", 2025);
        RegisterVehicleRequest duplicate = new RegisterVehicleRequest("owner-1", "XY-123", "Polestar", "2", 2025);

        registry.register(first);

        assertThrows(DuplicateVehicleException.class, () -> registry.register(duplicate));
    }

    @Test
    void allowsTheSamePlateForDifferentSyntheticOwners() {
        VehicleRegistry registry = registry();

        VehicleRecord first = registry.register(new RegisterVehicleRequest("owner-1", "xy 123", "Volvo", "EX30", 2025));
        VehicleRecord second = registry.register(new RegisterVehicleRequest("owner-2", "XY-123", "Polestar", "2", 2025));

        assertEquals("owner-1", first.ownerId());
        assertEquals("owner-2", second.ownerId());
    }

    @Test
    void rejectsInvalidVehicleFields() {
        VehicleRegistry registry = registry();

        assertThrows(IllegalArgumentException.class,
                () -> registry.register(new RegisterVehicleRequest(" ", "xy123", "Volvo", "EX30", 2025)));
        assertThrows(IllegalArgumentException.class,
                () -> registry.register(new RegisterVehicleRequest("owner-1", "xy123", "Volvo", "EX30", 1800)));
    }

    private static VehicleRegistry registry() {
        return new VehicleRegistry(new InMemoryVehicleRepository());
    }

    private static final class InMemoryVehicleRepository implements VehicleRepository {

        private final Map<String, VehicleRecord> vehicles = new HashMap<>();
        private final Map<String, String> ownerPlateKeys = new HashMap<>();

        private InMemoryVehicleRepository() {
            seed("RS-2048", "M-TR 4821", "Volvo", "EX90", 2025);
            seed("RS-2037", "B-RS 1934", "Polestar", "3", 2025);
            seed("RS-2022", "HH-VE 7021", "Mercedes-Benz", "EQE SUV", 2024);
            seed("RS-2019", "F-RS 4418", "BMW", "iX", 2024);
            seed("RS-2011", "M-AB 8510", "Audi", "Q8 e-tron", 2024);
            seed("RS-2006", "S-TR 2082", "Porsche", "Taycan", 2025);
            seed("RS-1998", "D-VE 1196", "Volkswagen", "ID.7", 2025);
            seed("RS-1984", "L-RS 6384", "Tesla", "Model Y", 2024);
        }

        @Override
        public List<VehicleRecord> findPage(long offset, int limit) {
            List<VehicleRecord> all = vehicles.values().stream()
                    .sorted(Comparator.comparing(VehicleRecord::id))
                    .toList();
            int start = (int) Math.min(offset, all.size());
            int end = Math.min(start + limit, all.size());
            return all.subList(start, end);
        }

        @Override
        public int count() {
            return vehicles.size();
        }

        @Override
        public Optional<VehicleRecord> findById(String id) {
            return Optional.ofNullable(vehicles.get(id));
        }

        @Override
        public VehicleRecord insert(VehicleRecord vehicle, String normalizedPlate) {
            String ownerPlateKey = vehicle.ownerId() + ":" + normalizedPlate;
            if (ownerPlateKeys.containsKey(ownerPlateKey)) {
                throw new DuplicateVehicleException(vehicle.plate());
            }
            vehicles.put(vehicle.id(), vehicle);
            ownerPlateKeys.put(ownerPlateKey, vehicle.id());
            return vehicle;
        }

        private void seed(String id, String plate, String make, String model, int year) {
            VehicleRecord vehicle = new VehicleRecord(id, "fleet-demo", plate, make, model, year,
                    Instant.parse("2026-10-16T08:00:00Z"));
            vehicles.put(id, vehicle);
            ownerPlateKeys.put("fleet-demo:" + plate.replaceAll("[^A-Za-z0-9]", "").toUpperCase(), id);
        }
    }
}
