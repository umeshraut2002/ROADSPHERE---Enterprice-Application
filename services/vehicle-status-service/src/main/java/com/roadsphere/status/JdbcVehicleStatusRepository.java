package com.roadsphere.status;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcVehicleStatusRepository implements VehicleStatusRepository {

    private static final RowMapper<VehicleStatusRecord> STATUS_ROW = (result, rowNumber) -> new VehicleStatusRecord(
            result.getString("vehicle_id"),
            result.getString("vehicle_status"),
            result.getString("health"),
            result.getInt("battery_percent"),
            result.getBigDecimal("battery_temperature_c"),
            result.getInt("range_km"),
            result.getBigDecimal("speed_kph"),
            result.getBigDecimal("latitude"),
            result.getBigDecimal("longitude"),
            result.getBoolean("charging"),
            result.getTimestamp("recorded_at").toInstant(),
            result.getString("event_id"));

    private final JdbcTemplate jdbc;

    public JdbcVehicleStatusRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<String> findEventFingerprint(String eventId) {
        List<String> values = jdbc.query("""
                SELECT fingerprint
                FROM vehicle_state.telemetry_events
                WHERE event_id = ?
                """, (result, rowNumber) -> result.getString("fingerprint"), eventId);
        return values.stream().findFirst();
    }

    @Override
    public int deleteExpiredEvents(Instant receivedBefore) {
        return jdbc.update("DELETE FROM vehicle_state.telemetry_events WHERE received_at < ?", Timestamp.from(receivedBefore));
    }

    @Override
    public boolean insertEventIfAbsent(TelemetryEvent event, String fingerprint) {
        return jdbc.update("""
                INSERT INTO vehicle_state.telemetry_events (event_id, vehicle_id, recorded_at, fingerprint)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (event_id) DO NOTHING
                """, event.eventId(), event.vehicleId(), Timestamp.from(event.recordedAt().toInstant()), fingerprint) == 1;
    }

    @Override
    public Optional<VehicleStatusRecord> findByVehicleId(String vehicleId) {
        return findStatus(vehicleId, false);
    }

    @Override
    public Optional<VehicleStatusRecord> findByVehicleIdForUpdate(String vehicleId) {
        return findStatus(vehicleId, true);
    }

    @Override
    public int saveIfNewer(VehicleStatusRecord status) {
        return jdbc.update("""
                INSERT INTO vehicle_state.vehicle_status AS current_status (
                    vehicle_id, vehicle_status, health, battery_percent, battery_temperature_c,
                    range_km, speed_kph, latitude, longitude, charging, recorded_at, event_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (vehicle_id) DO UPDATE SET
                    vehicle_status = EXCLUDED.vehicle_status,
                    health = EXCLUDED.health,
                    battery_percent = EXCLUDED.battery_percent,
                    battery_temperature_c = EXCLUDED.battery_temperature_c,
                    range_km = EXCLUDED.range_km,
                    speed_kph = EXCLUDED.speed_kph,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    charging = EXCLUDED.charging,
                    recorded_at = EXCLUDED.recorded_at,
                    event_id = EXCLUDED.event_id
                WHERE current_status.recorded_at < EXCLUDED.recorded_at
                """, status.vehicleId(), status.status(), status.health(), status.batteryPercent(),
                status.batteryTemperatureC(), status.rangeKm(), status.speedKph(), status.latitude(),
                status.longitude(), status.charging(), Timestamp.from(status.recordedAt()), status.eventId());
    }

    @Override
    public VehicleStatusPage findPage(long offset, int limit, int page) {
        List<VehicleStatusRecord> items = jdbc.query("""
                SELECT vehicle_id, vehicle_status, health, battery_percent, battery_temperature_c,
                       range_km, speed_kph, latitude, longitude, charging, recorded_at, event_id
                FROM vehicle_state.vehicle_status
                ORDER BY vehicle_id
                LIMIT ? OFFSET ?
                """, STATUS_ROW, limit, offset);
        Integer total = jdbc.queryForObject("SELECT count(*) FROM vehicle_state.vehicle_status", Integer.class);
        return new VehicleStatusPage(items, page, limit, total == null ? 0 : total);
    }

    private Optional<VehicleStatusRecord> findStatus(String vehicleId, boolean forUpdate) {
        String sql = """
                SELECT vehicle_id, vehicle_status, health, battery_percent, battery_temperature_c,
                       range_km, speed_kph, latitude, longitude, charging, recorded_at, event_id
                FROM vehicle_state.vehicle_status
                WHERE vehicle_id = ?
                """ + (forUpdate ? " FOR UPDATE" : "");
        return jdbc.query(sql, STATUS_ROW, vehicleId).stream().findFirst();
    }
}
