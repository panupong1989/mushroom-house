-- 001 init: houses, profiles, config
CREATE TABLE houses (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  active_profile TEXT NOT NULL DEFAULT 'fruiting',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE control_profiles (
  id         BIGSERIAL PRIMARY KEY,
  house_id   TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                       -- 'spawn_run' | 'fruiting'
  UNIQUE (house_id, name)
);

CREATE TABLE control_config (
  house_id   TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  profile    TEXT NOT NULL,                       -- profile name
  key        TEXT NOT NULL,
  value      NUMERIC NOT NULL,
  PRIMARY KEY (house_id, profile, key)
);
