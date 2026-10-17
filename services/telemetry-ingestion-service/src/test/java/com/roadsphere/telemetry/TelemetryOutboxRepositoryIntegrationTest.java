package com.roadsphere.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers(disabledWithoutDocker = true)
class TelemetryOutboxRepositoryIntegrationTest {

    private static final String SERVICE_PASSWORD = "test-telemetry-only";

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6")
            .withDatabaseName("roadsphere")
            .withUsername("roadsphere_admin")
            .withPassword("test-admin-only");

    private static JdbcTemplate jdbc;
    private static TelemetryOutboxRepository repository;
    private static TelemetryIngestionService service;

    @BeforeAll
    static void prepareOutboxSchema() {
        DriverManagerDataSource adminDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        JdbcTemplate adminJdbc = new JdbcTemplate(adminDataSource);
        adminJdbc.execute("CREATE ROLE roadsphere_telemetry LOGIN PASSWORD '" + SERVICE_PASSWORD + "'");
        adminJdbc.execute("CREATE SCHEMA telemetry_outbox AUTHORIZATION roadsphere_telemetry");

        DriverManagerDataSource serviceDataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), "roadsphere_telemetry", SERVICE_PASSWORD);
        jdbc = new JdbcTemplate(serviceDataSource);
        Flyway.configure()
                .dataSource(serviceDataSource)
                .schemas("telemetry_outbox")
                .defaultSchema("telemetry_outbox")
                .createSchemas(false)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        repository = new TelemetryOutboxRepository(jdbc, new ObjectMapper().findAndRegisterModules());
        service = new TelemetryIngestionService(vehicleId -> { }, repository);
    }

    @AfterEach
    void removeIntegrationRows() {
        jdbc.update("DELETE FROM telemetry_outbox.telemetry_outbox WHERE event_id LIKE 'IT-%'");
    }

    @Test
    void persistsAnIdempotentOutboxEventAndMarksSuccessfulPublication() {
        TelemetryEvent event = event("IT-EVENT-1", 61);

        TelemetryAcceptance accepted = service.accept(event, "integration-correlation");
        TelemetryAcceptance replayed = service.accept(event, "different-replay-correlation");

        assertEquals("ACCEPTED", accepted.status());
        assertEquals("DUPLICATE", replayed.status());
        assertEquals(1, repository.countPending());
        var claimed = repository.claimBatch(10);
        assertEquals(1, claimed.size());
        assertEquals("integration-correlation", claimed.get(0).correlationId());
        assertEquals(1, claimed.get(0).attempts());

        repository.markPublished(event.eventId());
        assertEquals(0, repository.countPending());
        assertEquals("DUPLICATE", service.accept(event, null).status());
    }

    @Test
    void rejectsReusingAnEventIdForDifferentTelemetry() {
        TelemetryEvent accepted = event("IT-EVENT-CONFLICT", 61);
        service.accept(accepted, null);

        assertThrows(TelemetryIngestionException.class,
                () -> service.accept(event("IT-EVENT-CONFLICT", 60), null));
        assertEquals(1, repository.countPending());
    }

    private static TelemetryEvent event(String eventId, int batteryPercent) {
        return new TelemetryEvent(eventId, "IT-VEHICLE-1", OffsetDateTime.parse("2026-10-17T08:00:00Z"),
                batteryPercent, new BigDecimal("25.0"), BigDecimal.ZERO, new BigDecimal("52.52"),
                new BigDecimal("13.405"), false);
    }
}
