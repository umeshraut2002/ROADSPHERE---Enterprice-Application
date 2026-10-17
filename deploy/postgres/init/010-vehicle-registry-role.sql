CREATE ROLE roadsphere_registry LOGIN PASSWORD 'roadsphere-local-only';
CREATE SCHEMA vehicle_registry AUTHORIZATION roadsphere_registry;
