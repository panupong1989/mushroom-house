-- 004 alerts
CREATE TABLE alerts (
  id          BIGSERIAL PRIMARY KEY,
  house_id    TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity    TEXT NOT NULL,         -- info|warn|critical
  code        TEXT NOT NULL,         -- LOW_WATER|BED_OVERHEAT|HOT|SENSOR_LOST...
  message     TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_house_ts ON alerts (house_id, ts DESC);
