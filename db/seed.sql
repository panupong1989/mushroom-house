-- seed: โรงเดียว + เซนเซอร์ + actuator + config (fruiting/spawn_run)
INSERT INTO houses (id,name) VALUES ('house-01','โรงเห็ดฟาง 01') ON CONFLICT DO NOTHING;
INSERT INTO control_profiles (house_id,name) VALUES
  ('house-01','fruiting'),('house-01','spawn_run') ON CONFLICT DO NOTHING;

-- sensors: RS485 air x3 (addr 1..3), bed DS18B20 x3, water float
INSERT INTO sensors (house_id,kind,address,location,unit) VALUES
  ('house-01','air_th','1','head','C/%'),
  ('house-01','air_th','2','mid','C/%'),
  ('house-01','air_th','3','tail','C/%'),
  ('house-01','bed_temp','28-0000-01','head','C'),
  ('house-01','bed_temp','28-0000-02','mid','C'),
  ('house-01','bed_temp','28-0000-03','tail','C'),
  ('house-01','water_level','float-1','tank','bool')
ON CONFLICT DO NOTHING;

-- actuators (relay channels)
INSERT INTO actuators (house_id,kind,relay_channel,name) VALUES
  ('house-01','mist',1,'ปั๊มพ่นหมอก'),
  ('house-01','heater',2,'ฮีทเตอร์'),
  ('house-01','exhaust',3,'พัดลมดูด'),
  ('house-01','light',4,'หลอดไฟ'),
  ('house-01','circulation',5,'พัดลมหมุนเวียน')
ON CONFLICT DO NOTHING;

-- config (fruiting)
INSERT INTO control_config (house_id,profile,key,value) VALUES
  ('house-01','fruiting','temp_fruit_min',28),
  ('house-01','fruiting','temp_fruit_max',32),
  ('house-01','fruiting','temp_floor',27),
  ('house-01','fruiting','temp_heater_on',27.5),
  ('house-01','fruiting','temp_heater_off',29.5),
  ('house-01','fruiting','temp_exhaust_on',33),
  ('house-01','fruiting','temp_exhaust_off',31),
  ('house-01','fruiting','temp_danger_hot',38),
  ('house-01','fruiting','rh_min',85),
  ('house-01','fruiting','rh_max',90),
  ('house-01','fruiting','rh_high',92),
  ('house-01','fruiting','vent_period_min',120),
  ('house-01','fruiting','vent_duration_min',10),
  ('house-01','fruiting','mist_burst_sec',20),
  ('house-01','fruiting','mist_gap_sec',180),
  ('house-01','spawn_run','bed_spawn_min',32),
  ('house-01','spawn_run','bed_spawn_max',35),
  ('house-01','spawn_run','bed_danger',40)
ON CONFLICT DO NOTHING;
