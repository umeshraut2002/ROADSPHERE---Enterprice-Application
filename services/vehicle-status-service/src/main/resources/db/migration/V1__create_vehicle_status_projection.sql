CREATE TABLE vehicle_state.telemetry_events (
    event_id varchar(80) PRIMARY KEY,
    vehicle_id varchar(32) NOT NULL,
    recorded_at timestamptz NOT NULL,
    fingerprint char(64) NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_telemetry_events_vehicle_recorded
    ON vehicle_state.telemetry_events (vehicle_id, recorded_at DESC);

CREATE TABLE vehicle_state.vehicle_status (
    vehicle_id varchar(32) PRIMARY KEY,
    vehicle_status varchar(16) NOT NULL CHECK (vehicle_status IN ('Driving', 'Parked', 'Charging')),
    health varchar(16) NOT NULL CHECK (health IN ('Healthy', 'Attention', 'Critical')),
    battery_percent smallint NOT NULL CHECK (battery_percent BETWEEN 0 AND 100),
    battery_temperature_c numeric(10, 6) NOT NULL CHECK (battery_temperature_c BETWEEN -40 AND 100),
    range_km integer NOT NULL CHECK (range_km >= 0),
    speed_kph numeric(10, 6) NOT NULL CHECK (speed_kph BETWEEN 0 AND 260),
    latitude numeric(11, 8) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(11, 8) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    charging boolean NOT NULL,
    recorded_at timestamptz NOT NULL,
    event_id varchar(80) NOT NULL
);

CREATE INDEX ix_vehicle_status_recorded_at
    ON vehicle_state.vehicle_status (recorded_at DESC);
