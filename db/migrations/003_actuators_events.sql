-- 003 actuators + events + commands
CREATE TABLE actuators (
  id            BIGSERIAL PRIMARY KEY,
  house_id      TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,       -- mist|heater|exhaust|light|circulation
  relay_channel INT  NOT NULL,
  name          TEXT NOT NULL,
  UNIQUE (house_id, relay_channel)
);

CREATE TABLE actuator_events (
  id           BIGSERIAL PRIMARY KEY,
  actuator_id  BIGINT NOT NULL REFERENCES actuators(id) ON DELETE CASCADE,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  state        BOOLEAN NOT NULL,
  reason       TEXT,
  source       TEXT NOT NULL DEFAULT 'auto'  -- auto|manual|safety
);
CREATE INDEX idx_evt_act_ts ON actuator_events (actuator_id, ts DESC);

CREATE TABLE commands (
  id         BIGSERIAL PRIMARY KEY,
  house_id   TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  actuator   TEXT NOT NULL,          -- kind
  action     TEXT NOT NULL,          -- on|off|auto
  ttl_sec    INT NOT NULL DEFAULT 300,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at   TIMESTAMPTZ
);
