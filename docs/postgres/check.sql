-- Checks for docs/postgres/schema.sql. Load the schema first, then run:
--   psql -v ON_ERROR_STOP=1 -f docs/postgres/check.sql
-- It prints one line per case: PASS or FAIL, the case, and what the database answered.
-- Everything runs in one transaction that is rolled back at the end, so it can be run again.
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;

SELECT 'PostgreSQL version: ' || version();

-- Test data: one dealership, one customer and vehicle, and numbered bays, technicians and cars.
INSERT INTO dealership (id, name, time_zone)
  VALUES ('00000000-0000-0000-0000-00000000d001', 'Test dealership', 'Europe/London');
INSERT INTO skill VALUES ('mot', 'MOT');
INSERT INTO service_type VALUES ('00000000-0000-0000-0000-00000000e001', 'MOT test', 60, 'mot');
INSERT INTO customer VALUES ('00000000-0000-0000-0000-00000000c001', 'Test Customer', '000', NULL, now());
INSERT INTO vehicle VALUES ('00000000-0000-0000-0000-00000000f001',
  '00000000-0000-0000-0000-00000000c001', 'TEST1', 'Make', 'Model', NULL);

CREATE FUNCTION pg_temp.rid(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS
  $$ SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

INSERT INTO service_bay  SELECT pg_temp.rid(n), '00000000-0000-0000-0000-00000000d001', 'Bay ' || n  FROM generate_series(1, 30) n;
INSERT INTO technician   SELECT pg_temp.rid(n), '00000000-0000-0000-0000-00000000d001', 'Tech ' || n FROM generate_series(1, 30) n;
INSERT INTO courtesy_car SELECT pg_temp.rid(n), '00000000-0000-0000-0000-00000000d001', 'Car ' || n  FROM generate_series(1, 30) n;

-- Insert one appointment on 2 Nov 2026 (UTC). Times are 'HH:MM'. Returns 'ok' or the SQLSTATE.
-- Arguments: bay, technician, car (0 = none), transport, during text, busy text, status.
CREATE FUNCTION pg_temp.book(bay int, tech int, car int, transport text,
                             during_range text, busy_range text, status text DEFAULT 'confirmed')
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO appointment (id, dealership_id, customer_id, vehicle_id, service_type_id, technician_id,
                           service_bay_id, courtesy_car_id, transport, during, technician_busy,
                           time_zone, status, created_at, updated_at)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001',
          '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001',
          pg_temp.rid(tech), pg_temp.rid(bay), CASE WHEN car = 0 THEN NULL ELSE pg_temp.rid(car) END,
          transport, during_range::tstzrange, busy_range::tstzrange,
          'Europe/London', status, now(), now());
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;

-- A range on 2 Nov 2026 UTC, for example r('09:00','10:00') gives [09:00, 10:00).
CREATE FUNCTION pg_temp.r(a text, b text, open_b text DEFAULT '[', close_b text DEFAULT ')') RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT open_b || '2026-11-02 ' || a || '+00,2026-11-02 ' || b || '+00' || close_b $$;

CREATE FUNCTION pg_temp.report(label text, expected text, actual text) RETURNS text
LANGUAGE sql AS $$
  SELECT CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END
         || ' | ' || label || ' | expected ' || expected || ', got ' || actual $$;

-- 1. Same bay, overlapping, both confirmed: the second is refused with 23P01.
SELECT pg_temp.report('bay overlap, first insert', 'ok',
  pg_temp.book(1, 1, 0, 'wait', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('bay overlap, second insert refused', '23P01',
  pg_temp.book(1, 2, 0, 'wait', pg_temp.r('09:30','10:30'), pg_temp.r('09:30','10:45')));

-- 2. Same bay, one ends at 10:00 and the next starts at 10:00: both accepted.
SELECT pg_temp.report('bay touching, first ends 10:00', 'ok',
  pg_temp.book(2, 3, 0, 'wait', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('bay touching, second starts 10:00', 'ok',
  pg_temp.book(2, 4, 0, 'wait', pg_temp.r('10:00','11:00'), pg_temp.r('10:00','11:15')));

-- 3. Cancelled rows do not block (bay, technician and car), and a cancelled one frees the slot.
SELECT pg_temp.report('cancelled: confirmed one first', 'ok',
  pg_temp.book(3, 5, 1, 'courtesy_car', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('cancelled: overlapping cancelled one on same bay, technician and car', 'ok',
  pg_temp.book(3, 5, 1, 'courtesy_car', pg_temp.r('09:30','10:30'), pg_temp.r('09:30','10:45'), 'cancelled'));
UPDATE appointment SET status = 'cancelled', cancelled_at = now()
  WHERE service_bay_id = pg_temp.rid(3) AND status = 'confirmed';
SELECT pg_temp.report('cancelled: new overlapping booking after the first is cancelled', 'ok',
  pg_temp.book(3, 5, 1, 'courtesy_car', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));

-- 4. Technician: the job plus the 15-minute break counts.
SELECT pg_temp.report('technician: first job 09:00-10:00 (busy until 10:15)', 'ok',
  pg_temp.book(4, 6, 0, 'wait', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('technician: job starts 10:00, jobs only touch but the break overlaps', '23P01',
  pg_temp.book(5, 6, 0, 'wait', pg_temp.r('10:00','11:00'), pg_temp.r('10:00','11:15')));
SELECT pg_temp.report('technician: job starts 10:15, exactly when the break ends', 'ok',
  pg_temp.book(5, 6, 0, 'wait', pg_temp.r('10:15','11:15'), pg_temp.r('10:15','11:30')));

-- 5. Courtesy car: overlap refused; no car (NULL) never conflicts.
SELECT pg_temp.report('car: first booking', 'ok',
  pg_temp.book(6, 7, 2, 'courtesy_car', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('car: same car, overlapping, refused', '23P01',
  pg_temp.book(7, 8, 2, 'courtesy_car', pg_temp.r('09:30','10:30'), pg_temp.r('09:30','10:45')));
SELECT pg_temp.report('car: no car, first', 'ok',
  pg_temp.book(8, 9, 0, 'drop_off', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('car: no car, second overlapping', 'ok',
  pg_temp.book(9, 10, 0, 'drop_off', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));

-- 6. Transport and car must agree (table CHECK, SQLSTATE 23514).
SELECT pg_temp.report('transport courtesy_car without a car', '23514',
  pg_temp.book(10, 11, 0, 'courtesy_car', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('a car with transport wait', '23514',
  pg_temp.book(11, 12, 3, 'wait', pg_temp.r('09:00','10:00'), pg_temp.r('09:00','10:15')));

-- 7. The during range must be half-open [start, end).
SELECT pg_temp.report('during (start, end] refused', '23514',
  pg_temp.book(12, 13, 0, 'wait', pg_temp.r('09:00','10:00','(',']'), pg_temp.r('09:00','10:15')));
SELECT pg_temp.report('during [start, end] refused', '23514',
  pg_temp.book(13, 14, 0, 'wait', pg_temp.r('09:00','10:00','[',']'), pg_temp.r('09:00','10:15')));

-- 8. Duplicates (SQLSTATE 23505 = unique violation).
INSERT INTO idempotency_key VALUES ('actor-1', 'key-1', 'hash', 201, '{}', now());
CREATE FUNCTION pg_temp.dup_idem() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO idempotency_key VALUES ('actor-1', 'key-1', 'hash2', 201, '{}', now());
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
SELECT pg_temp.report('idempotency: same (actor_id, key) twice', '23505', pg_temp.dup_idem());

INSERT INTO outbox_message
  SELECT gen_random_uuid(), id, 'confirmation', now(), 'scheduled', 'dedupe-1', now()
  FROM appointment LIMIT 1;
CREATE FUNCTION pg_temp.dup_outbox() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO outbox_message
    SELECT gen_random_uuid(), id, 'confirmation', now(), 'scheduled', 'dedupe-1', now()
    FROM appointment LIMIT 1;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
SELECT pg_temp.report('outbox: same dedupe_key twice', '23505', pg_temp.dup_outbox());

ROLLBACK;
