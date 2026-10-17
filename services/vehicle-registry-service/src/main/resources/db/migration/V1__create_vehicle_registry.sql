CREATE TABLE vehicle_registry.vehicles (
    vehicle_id varchar(40) PRIMARY KEY,
    owner_id varchar(80) NOT NULL,
    plate varchar(20) NOT NULL,
    plate_normalized varchar(20) NOT NULL,
    make varchar(80) NOT NULL,
    model varchar(100) NOT NULL,
    model_year smallint NOT NULL CHECK (model_year BETWEEN 1990 AND 2100),
    registered_at timestamptz NOT NULL,
    CONSTRAINT uq_vehicles_owner_plate_normalized UNIQUE (owner_id, plate_normalized)
);

CREATE INDEX ix_vehicles_owner_id_vehicle_id
    ON vehicle_registry.vehicles (owner_id, vehicle_id);

INSERT INTO vehicle_registry.vehicles (
    vehicle_id, owner_id, plate, plate_normalized, make, model, model_year, registered_at
) VALUES
    ('RS-2048', 'fleet-demo', 'M-TR 4821', 'MTR4821', 'Volvo', 'EX90', 2025, '2026-10-16T08:00:00Z'),
    ('RS-2037', 'fleet-demo', 'B-RS 1934', 'BRS1934', 'Polestar', '3', 2025, '2026-10-16T08:00:00Z'),
    ('RS-2022', 'fleet-demo', 'HH-VE 7021', 'HHVE7021', 'Mercedes-Benz', 'EQE SUV', 2024, '2026-10-16T08:00:00Z'),
    ('RS-2019', 'fleet-demo', 'F-RS 4418', 'FRS4418', 'BMW', 'iX', 2024, '2026-10-16T08:00:00Z'),
    ('RS-2011', 'fleet-demo', 'M-AB 8510', 'MAB8510', 'Audi', 'Q8 e-tron', 2024, '2026-10-16T08:00:00Z'),
    ('RS-2006', 'fleet-demo', 'S-TR 2082', 'STR2082', 'Porsche', 'Taycan', 2025, '2026-10-16T08:00:00Z'),
    ('RS-1998', 'fleet-demo', 'D-VE 1196', 'DVE1196', 'Volkswagen', 'ID.7', 2025, '2026-10-16T08:00:00Z'),
    ('RS-1984', 'fleet-demo', 'L-RS 6384', 'LRS6384', 'Tesla', 'Model Y', 2024, '2026-10-16T08:00:00Z')
ON CONFLICT (vehicle_id) DO NOTHING;
