create table telemetry_outbox (
    event_id varchar(80) primary key,
    vehicle_id varchar(32) not null,
    correlation_id varchar(80) not null,
    fingerprint char(64) not null,
    payload text not null,
    created_at timestamptz not null default now(),
    available_at timestamptz not null default now(),
    lease_until timestamptz,
    published_at timestamptz,
    attempts integer not null default 0 check (attempts >= 0),
    last_error varchar(500)
);

create index telemetry_outbox_pending_idx
    on telemetry_outbox (available_at, created_at)
    where published_at is null;
