-- 002 sensors + time-series readings
CREATE TABLE sensors (
  id         BIGSERIAL PRIMARY KEY,
  house_id   TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,          -- 'air_th' | 'bed_temp' | 'water_level'
  address    TEXT NOT NULL,          -- modbus addr (1..) or 1-wire ROM
  location   TEXT,                   -- 'head' | 'mid' | 'tail' ...
  unit       TEXT,
  UNIQUE (house_id, kind, address)
);

CREATE TABLE sensor_readings (
  sensor_id  BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric     TEXT NOT NULL,          -- 'temp' | 'rh'
  value      DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_readings_sensor_ts ON sensor_readings (sensor_id, ts DESC);

-- TODO(CC): ถ้ามี TimescaleDB:
--   SELECT create_hypertable('sensor_readings','ts');
--   + retention policy (เช่น เก็บ raw 90 วัน, rollup รายชม.)
