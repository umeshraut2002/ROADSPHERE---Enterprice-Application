package com.roadsphere.registry;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers(disabledWithoutDocker = true)
class JdbcVehicleRepositoryIntegrationTest {

    private static final String REGISTRY_PASSWORD = "test-registry-only";

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6")
            .withDatabaseName("roadsphere")
            .withUsername("roadsphere_admin")
            .withPassword("test-admin-only");

    private static JdbcTemplate registryJdbc;
    private static JdbcVehicleRepository repository;
    private static Flyway flyway;

    @BeforeAll
    static void prepareRegistrySchema() {
        DriverManagerDataSource adminDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        JdbcTemplate adminJdbc = new JdbcTemplate(adminDataSource);
        adminJdbc.execute("CREATE ROLE roadsphere_registry LOGIN PASSWORD '" + REGISTRY_PASSWORD + "'");
        adminJdbc.execute("CREATE SCHEMA vehicle_registry AUTHORIZATION roadsphere_registry");

        DriverManagerDataSource registryDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), "roadsphere_registry", REGISTRY_PASSWORD);
        registryJdbc = new JdbcTemplate(registryDataSource);
        flyway = Flyway.configure()
                .dataSource(registryDataSource)
                .schemas("vehicle_registry")
                .defaultSchema("vehicle_registry")
                .createSchemas(false)
                .locations("classpath:db/migration")
                .load();
        flyway.migrate();
        repository = new JdbcVehicleRepository(registryJdbc);
    }

    @AfterEach
    void removeTestVehicles() {
        registryJdbc.update("DELETE FROM vehicle_registry.vehicles WHERE vehicle_id LIKE 'IT-%'");
    }

    @Test
    void appliesFlywayMigrationAndSeedsBrowsableVehicles() {
        assertEquals(8, repository.count());
        List<VehicleRecord> firstPage = repository.findPage(0, 3);
        assertEquals(3, firstPage.size());
        assertEquals("RS-1984", firstPage.get(0).id());
        assertEquals("RS-2048", repository.findById("RS-2048").orElseThrow().id());

        flyway.migrate();
        assertEquals(8, repository.count());
    }

    @Test
    void persistsRegisteredVehiclesAndReturnsTheirStoredValues() {
        VehicleRecord vehicle = vehicle("IT-INSERT-1", "owner-integration", "AB-123");

        VehicleRecord inserted = repository.insert(vehicle, "AB123");

        assertEquals(vehicle, inserted);
        assertEquals(vehicle, repository.findById(vehicle.id()).orElseThrow());
    }

    @Test
    void databaseRejectsNormalizedDuplicatePlateForSameOwner() {
        repository.insert(vehicle("IT-DUPLICATE-1", "owner-integration", "AB 123"), "AB123");

        assertThrows(DuplicateVehicleException.class,
                () -> repository.insert(vehicle("IT-DUPLICATE-2", "owner-integration", "AB-123"), "AB123"));
    }

    @Test
    void sameNormalizedPlateCanBelongToDifferentOwners() {
        VehicleRecord first = repository.insert(vehicle("IT-OWNER-1", "owner-one", "AB 123"), "AB123");
        VehicleRecord second = repository.insert(vehicle("IT-OWNER-2", "owner-two", "AB-123"), "AB123");

        assertEquals("owner-one", first.ownerId());
        assertEquals("owner-two", second.ownerId());
        assertEquals(10, repository.count());
    }

    private static VehicleRecord vehicle(String id, String ownerId, String plate) {
        return new VehicleRecord(id, ownerId, plate, "Synthetic", "Integration", 2025,
                Instant.parse("2026-10-17T00:00:00Z"));
    }
}
