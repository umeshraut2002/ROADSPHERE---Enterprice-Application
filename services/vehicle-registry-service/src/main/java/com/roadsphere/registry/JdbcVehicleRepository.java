package com.roadsphere.registry;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcVehicleRepository implements VehicleRepository {

    private static final RowMapper<VehicleRecord> VEHICLE_ROW_MAPPER = (result, rowNumber) ->
            new VehicleRecord(
                    result.getString("vehicle_id"),
                    result.getString("owner_id"),
                    result.getString("plate"),
                    result.getString("make"),
                    result.getString("model"),
                    result.getInt("model_year"),
                    result.getTimestamp("registered_at").toInstant());

    private final JdbcTemplate jdbc;

    public JdbcVehicleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<VehicleRecord> findPage(long offset, int limit) {
        return jdbc.query("""
                        SELECT vehicle_id, owner_id, plate, make, model, model_year, registered_at
                        FROM vehicle_registry.vehicles
                        ORDER BY vehicle_id
                        LIMIT ? OFFSET ?
                        """,
                VEHICLE_ROW_MAPPER, limit, offset);
    }

    @Override
    public int count() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM vehicle_registry.vehicles", Integer.class);
        return count == null ? 0 : count;
    }

    @Override
    public Optional<VehicleRecord> findById(String id) {
        List<VehicleRecord> rows = jdbc.query("""
                        SELECT vehicle_id, owner_id, plate, make, model, model_year, registered_at
                        FROM vehicle_registry.vehicles
                        WHERE vehicle_id = ?
                        """,
                VEHICLE_ROW_MAPPER, id);
        return rows.stream().findFirst();
    }

    @Override
    public VehicleRecord insert(VehicleRecord vehicle, String normalizedPlate) {
        List<VehicleRecord> inserted = jdbc.query("""
                        INSERT INTO vehicle_registry.vehicles (
                            vehicle_id, owner_id, plate, plate_normalized, make, model, model_year, registered_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT ON CONSTRAINT uq_vehicles_owner_plate_normalized DO NOTHING
                        RETURNING vehicle_id, owner_id, plate, make, model, model_year, registered_at
                        """,
                VEHICLE_ROW_MAPPER,
                vehicle.id(), vehicle.ownerId(), vehicle.plate(), normalizedPlate, vehicle.make(), vehicle.model(),
                vehicle.modelYear(), Timestamp.from(vehicle.registeredAt()));
        if (inserted.isEmpty()) {
            throw new DuplicateVehicleException(vehicle.plate());
        }
        return inserted.get(0);
    }
}
