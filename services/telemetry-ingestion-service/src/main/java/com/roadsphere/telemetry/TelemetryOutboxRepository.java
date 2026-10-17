package com.roadsphere.telemetry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

@Repository
public class TelemetryOutboxRepository {

    private static final RowMapper<OutboxMessage> MESSAGE_MAPPER = (result, row) -> new OutboxMessage(
            result.getString("event_id"), result.getString("vehicle_id"), result.getString("payload"),
            result.getString("correlation_id"), result.getInt("attempts"));

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public TelemetryOutboxRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<String> findFingerprint(String eventId) {
        return jdbcTemplate.query("select fingerprint from telemetry_outbox.telemetry_outbox where event_id = ?",
                result -> result.next() ? Optional.of(result.getString(1)) : Optional.empty(), eventId);
    }

    public long countPending() {
        Long count = jdbcTemplate.queryForObject(
                "select count(*) from telemetry_outbox.telemetry_outbox where published_at is null", Long.class);
        return count == null ? 0L : count;
    }

    public int deletePublishedBefore(Instant receivedBefore) {
        return jdbcTemplate.update("""
                delete from telemetry_outbox.telemetry_outbox
                 where published_at is not null and published_at < ?
                """, java.sql.Timestamp.from(receivedBefore));
    }

    public int insert(TelemetryEvent event) {
        return insert(event, event.eventId());
    }

    public int insert(TelemetryEvent event, String correlationId) {
        String payload = serialize(event);
        return jdbcTemplate.update("""
                insert into telemetry_outbox.telemetry_outbox (event_id, vehicle_id, correlation_id, fingerprint, payload)
                values (?, ?, ?, ?, ?)
                on conflict (event_id) do nothing
                """, event.eventId(), event.vehicleId(), correlationId, fingerprint(payload), payload);
    }

    public boolean matchesFingerprint(TelemetryEvent event, String expected) {
        return MessageDigest.isEqual(fingerprint(serialize(event)).getBytes(StandardCharsets.US_ASCII),
                expected.getBytes(StandardCharsets.US_ASCII));
    }

    private String serialize(TelemetryEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Telemetry event could not be serialized.", exception);
        }
    }

    public List<OutboxMessage> claimBatch(int limit) {
        return jdbcTemplate.query("""
                update telemetry_outbox.telemetry_outbox
                   set lease_until = now() + interval '2 minutes', attempts = attempts + 1
                 where event_id in (
                       select event_id from telemetry_outbox.telemetry_outbox
                        where published_at is null and available_at <= now()
                          and (lease_until is null or lease_until < now())
                        order by created_at
                        for update skip locked
                        limit ?
                 )
                returning event_id, vehicle_id, correlation_id, payload, attempts
                """, MESSAGE_MAPPER, limit);
    }

    public void markPublished(String eventId) {
        jdbcTemplate.update("update telemetry_outbox.telemetry_outbox set published_at = now(), lease_until = null, last_error = null where event_id = ?",
                eventId);
    }

    public void scheduleRetry(OutboxMessage message, Exception exception) {
        long delaySeconds = Math.min(300, 1L << Math.min(message.attempts(), 8));
        String detail = exception.getClass().getSimpleName() + ": " + String.valueOf(exception.getMessage());
        jdbcTemplate.update("""
                update telemetry_outbox.telemetry_outbox
                   set lease_until = null,
                       available_at = now() + (? * interval '1 second'),
                       last_error = left(?, 500)
                 where event_id = ?
                """, delaySeconds, detail, message.eventId());
    }

    private String fingerprint(String payload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Telemetry event fingerprint could not be created.", exception);
        }
    }

    public record OutboxMessage(String eventId, String vehicleId, String payload, String correlationId, int attempts) {
    }
}
