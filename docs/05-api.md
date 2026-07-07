# 05 — API (REST + MQTT)

## REST (backend :3000)
```
GET  /health                         สถานะระบบ
GET  /houses/:id                     ข้อมูลโรง + เฟสปัจจุบัน
GET  /houses/:id/latest              ค่าปัจจุบันทุกเซนเซอร์ + สถานะ actuator
GET  /sensors/:id/readings?from&to   time-series
GET  /houses/:id/config              setpoint ปัจจุบัน
PUT  /houses/:id/config              แก้ setpoint (validate ช่วงค่า)
POST /houses/:id/profile             สลับเฟส spawn_run/fruiting
POST /actuators/:id/command          สั่ง manual {action:on|off|auto, ttl_sec}
GET  /houses/:id/alerts?resolved     รายการแจ้งเตือน
POST /alerts/:id/resolve             เคลียร์ alert
```

## MQTT topics (base = MQTT_BASE_TOPIC/house_id)
ขาขึ้น (ESP32 -> backend):
```
mush/<house>/telemetry        {ts, air:[{addr,temp,rh}], bed:[{addr,temp}], water_ok, mode}
mush/<house>/actuator/state   {ts, mist,heater,exhaust,light,circulation}
mush/<house>/alert            {ts, code, severity, message}
mush/<house>/heartbeat        {ts, uptime, rssi, fw}
```
ขาลง (backend -> ESP32):
```
mush/<house>/cmd/actuator     {actuator, action, ttl_sec}
mush/<house>/cmd/config       {key:value,...}   sync setpoint
mush/<house>/cmd/profile      {profile:"fruiting"}
```
QoS 1, retained เฉพาะ config/heartbeat. TODO(CC): per-device auth + ACL
