CREATE ROLE roadsphere_status LOGIN PASSWORD 'roadsphere-status-local-only';
CREATE SCHEMA vehicle_state AUTHORIZATION roadsphere_status;
CREATE ROLE roadsphere_telemetry LOGIN PASSWORD 'roadsphere-telemetry-local-only';
CREATE SCHEMA telemetry_outbox AUTHORIZATION roadsphere_telemetry;
