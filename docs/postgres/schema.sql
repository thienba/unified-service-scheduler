-- Design for the real backend. NOT used by the demo (the demo keeps its data in the browser).
-- Source: architecture.md section 7.8, AD-18, D-0000-8.
-- The database itself refuses double booking: one exclusion constraint each for the bay,
-- the technician (job plus break) and the courtesy car. Cancelled appointments do not block.
-- Load with: psql -v ON_ERROR_STOP=1 -f docs/postgres/schema.sql

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lets GiST compare ids with = (research.md F3.1)

CREATE TABLE dealership (
  id               uuid PRIMARY KEY,
  name             text NOT NULL,
  time_zone        text NOT NULL,                 -- IANA name, e.g. 'Europe/London'
  grid_minutes     int  NOT NULL DEFAULT 15,
  min_lead_minutes int  NOT NULL DEFAULT 120,
  horizon_days     int  NOT NULL DEFAULT 30,
  break_minutes    int  NOT NULL DEFAULT 15
);
CREATE TABLE opening_hours (                       -- weekly pattern; no row = closed that weekday
  dealership_id uuid     NOT NULL REFERENCES dealership,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens         time     NOT NULL,
  closes        time     NOT NULL CHECK (closes > opens),
  PRIMARY KEY (dealership_id, weekday)
);
CREATE TABLE opening_hours_override (              -- both times NULL = closed that date
  dealership_id uuid NOT NULL REFERENCES dealership,
  on_date       date NOT NULL,
  opens         time NULL,
  closes        time NULL,
  PRIMARY KEY (dealership_id, on_date)
);
CREATE TABLE skill        (code text PRIMARY KEY, name text NOT NULL);
CREATE TABLE service_type (id uuid PRIMARY KEY, name text NOT NULL,
                           duration_minutes int NOT NULL CHECK (duration_minutes > 0),
                           required_skill_code text NOT NULL REFERENCES skill);
CREATE TABLE service_bay  (id uuid PRIMARY KEY, dealership_id uuid NOT NULL REFERENCES dealership,
                           name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE courtesy_car (id uuid PRIMARY KEY, dealership_id uuid NOT NULL REFERENCES dealership,
                           label text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE technician   (id uuid PRIMARY KEY, dealership_id uuid NOT NULL REFERENCES dealership,
                           name text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE technician_skill (technician_id uuid REFERENCES technician, skill_code text REFERENCES skill,
                               PRIMARY KEY (technician_id, skill_code));
CREATE TABLE shift_pattern (technician_id uuid REFERENCES technician, weekday smallint,
                            starts time NOT NULL, ends time NOT NULL,
                            break_starts time NULL, break_ends time NULL,
                            PRIMARY KEY (technician_id, weekday));
CREATE TABLE shift_exception (technician_id uuid REFERENCES technician, on_date date,
                              kind text NOT NULL CHECK (kind IN ('leave', 'changed')),
                              starts time NULL, ends time NULL, break_starts time NULL, break_ends time NULL,
                              PRIMARY KEY (technician_id, on_date));
CREATE TABLE customer (id uuid PRIMARY KEY, full_name text NOT NULL, phone text NOT NULL,
                       email text NULL, created_at timestamptz NOT NULL);       -- personal data
CREATE TABLE vehicle  (id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customer,
                       registration text NOT NULL, make text NOT NULL, model text NOT NULL, year smallint NULL);

CREATE TABLE appointment (
  id              uuid PRIMARY KEY,
  dealership_id   uuid NOT NULL REFERENCES dealership,
  customer_id     uuid NOT NULL REFERENCES customer,
  vehicle_id      uuid NOT NULL REFERENCES vehicle,
  service_type_id uuid NOT NULL REFERENCES service_type,
  technician_id   uuid NOT NULL REFERENCES technician,
  service_bay_id  uuid NOT NULL REFERENCES service_bay,
  courtesy_car_id uuid NULL     REFERENCES courtesy_car,
  transport       text NOT NULL CHECK (transport IN ('wait', 'drop_off', 'courtesy_car')),
  during          tstzrange NOT NULL CHECK (lower_inc(during) AND NOT upper_inc(during)),  -- [start, end)
  technician_busy tstzrange NOT NULL,   -- [start, end + the break at booking time)
  time_zone       text NOT NULL,
  status          text NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  flags           text[] NOT NULL DEFAULT '{}',
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  cancelled_at    timestamptz NULL,
  CHECK ((transport = 'courtesy_car') = (courtesy_car_id IS NOT NULL)),

  CONSTRAINT appointment_bay_no_overlap
    EXCLUDE USING gist (service_bay_id WITH =, during WITH &&)
    WHERE (status <> 'cancelled'),
  CONSTRAINT appointment_technician_no_overlap
    EXCLUDE USING gist (technician_id WITH =, technician_busy WITH &&)
    WHERE (status <> 'cancelled'),
  CONSTRAINT appointment_courtesy_car_no_overlap
    EXCLUDE USING gist (courtesy_car_id WITH =, during WITH &&)
    WHERE (status <> 'cancelled' AND courtesy_car_id IS NOT NULL)
);
CREATE INDEX appointment_customer ON appointment (customer_id);

CREATE TABLE idempotency_key (
  actor_id text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
  status_code int NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, key)
);
CREATE TABLE outbox_message (
  id uuid PRIMARY KEY, appointment_id uuid NOT NULL REFERENCES appointment,
  kind text NOT NULL, send_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  dedupe_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL    -- ids only; contact details looked up at send time
);
