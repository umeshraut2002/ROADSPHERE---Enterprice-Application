package com.roadsphere.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers(disabledWithoutDocker = true)
class JdbcVehicleStatusRepositoryIntegrationTest {

    private static final String STATUS_PASSWORD = "test-status-only";

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6")
            .withDatabaseName("roadsphere")
            .withUsername("roadsphere_admin")
            .withPassword("test-admin-only");

    private static JdbcTemplate statusJdbc;
    private static JdbcVehicleStatusRepository repository;
    private static VehicleStatusProjectionService projectionService;
    private static TransactionTemplate transactions;

    @BeforeAll
    static void prepareStatusSchema() {
        DriverManagerDataSource adminDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        JdbcTemplate adminJdbc = new JdbcTemplate(adminDataSource);
        adminJdbc.execute("CREATE ROLE roadsphere_status LOGIN PASSWORD '" + STATUS_PASSWORD + "'");
        adminJdbc.execute("CREATE SCHEMA vehicle_state AUTHORIZATION roadsphere_status");

        DriverManagerDataSource statusDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), "roadsphere_status", STATUS_PASSWORD);
        statusJdbc = new JdbcTemplate(statusDataSource);
        Flyway.configure()
                .dataSource(statusDataSource)
                .schemas("vehicle_state")
                .defaultSchema("vehicle_state")
                .createSchemas(false)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        repository = new JdbcVehicleStatusRepository(statusJdbc);
        projectionService = new VehicleStatusProjectionService(repository, new ObjectMapper().findAndRegisterModules());
        transactions = new TransactionTemplate(new DataSourceTransactionManager(statusDataSource));
    }

    @AfterEach
    void removeIntegrationRows() {
        statusJdbc.update("DELETE FROM vehicle_state.telemetry_events WHERE event_id LIKE 'IT-%'");
        statusJdbc.update("DELETE FROM vehicle_state.vehicle_status WHERE vehicle_id LIKE 'IT-%'");
    }

    @Test
    void appliesMigrationAndPersistsTheLatestVehicleProjection() {
        assertEquals(0, repository.findPage(0, 10, 0).total());
        TelemetryEvent event = event("IT-EVENT-1", "IT-VEHICLE-1", "2026-10-17T08:00:00Z", 50, "39", "40", false);

        TelemetryResult accepted = transactions.execute(status -> projectionService.project(event));
        TelemetryResult replayed = transactions.execute(status -> projectionService.project(event));
        VehicleStatusRecord stored = repository.findByVehicleId("IT-VEHICLE-1").orElseThrow();

        assertEquals("ACCEPTED", accepted.status());
        assertEquals("DUPLICATE", replayed.status());
        assertEquals("Driving", stored.status());
        assertEquals("Attention", stored.health());
        assertEquals(50, stored.batteryPercent());
        assertEquals(1, repository.findPage(0, 10, 0).total());
    }

    @Test
    void staleTelemetryRollsBackItsIdempotencyReceipt() {
        TelemetryEvent latest = event("IT-LATEST", "IT-VEHICLE-2", "2026-10-17T09:00:00Z", 70, "25", "0", false);
        TelemetryEvent stale = event("IT-STALE", "IT-VEHICLE-2", "2026-10-17T08:59:00Z", 69, "25", "0", false);
        transactions.execute(status -> projectionService.project(latest));

        assertThrows(VehicleStatusException.class,
                () -> transactions.execute(status -> projectionService.project(stale)));
        assertFalse(repository.findEventFingerprint("IT-STALE").isPresent());
        assertEquals("IT-LATEST", repository.findByVehicleId("IT-VEHICLE-2").orElseThrow().eventId());
    }

    private static TelemetryEvent event(String eventId, String vehicleId, String recordedAt, int battery,
                                        String temperature, String speed, boolean charging) {
        return new TelemetryEvent(eventId, vehicleId, OffsetDateTime.parse(recordedAt), battery,
                new BigDecimal(temperature), new BigDecimal(speed), new BigDecimal("52.52"),
                new BigDecimal("13.405"), charging);
    }
}
