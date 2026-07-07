# 03 — Control Logic (FSM + setpoints)

## ค่าตั้งต้น (config — เก็บใน DB `control_config` + sync ลง ESP32 NVS)
```
temp_fruit_min      = 28.0   # โซนทองล่าง
temp_fruit_max      = 32.0   # โซนทองบน
temp_floor          = 27.0   # ต่ำกว่านี้ = อันตราย (ตุ่มดอกตาย <25)
temp_heater_on      = 27.5   # เปิดฮีทเตอร์
temp_heater_off     = 29.5   # ปิดฮีทเตอร์ (hysteresis)
temp_exhaust_on     = 33.0   # เปิดพัดลมดูด (ร้อนไป)
temp_exhaust_off    = 31.0
temp_danger_hot     = 38.0
rh_min              = 85.0
rh_max              = 90.0
rh_high             = 92.0   # เกินนี้ไล่ชื้น
bed_spawn_min       = 32.0   # เดินเส้นใย
bed_spawn_max       = 35.0
bed_danger          = 40.0   # เกิน = เชื้อตาย -> alert + ดูด/หยุดฮีทเตอร์
vent_period_min     = 120    # รอบระบายอากาศ (นาที) — ใช้แทนเซนเซอร์ CO2 (v1)
vent_duration_min   = 10
light_on_hour       = 6
light_off_hour      = 18
mist_burst_sec      = 20     # พ่นเป็น burst สั้น
mist_gap_sec        = 180
```

## ลำดับการตัดสินใจ (priority — temp เป็น master)
```
อ่าน: T_air (เฉลี่ย/วิกฤตจาก RS485 x3), RH, T_bed x3, water_ok(float)

1) SAFETY ก่อนเสมอ
   - water_ok == false            -> ปั๊ม/หมอก LOCK OFF, alert LOW_WATER
   - T_bed_any >= bed_danger      -> heater OFF, exhaust ON, alert BED_OVERHEAT
   - T_air >= temp_danger_hot     -> exhaust ON เต็มที่ + mist ON, alert HOT

2) โหมดตามเฟส
   SPAWN_RUN: คุม T_bed ให้อยู่ 32–35 (ฮีทเตอร์ถ้าต่ำ), ยังไม่ออกดอก
   FRUITING : ใช้ ladder ด้านล่าง

3) TEMPERATURE ladder (FRUITING)
   T_air < temp_heater_on(27.5)   -> HEATER ON  ; MIST OFF (ห้ามพ่น!) ; exhaust OFF
   temp_heater_off..temp_exhaust_on (โซนทอง) -> HEATER OFF ; คุม RH (ด้านล่าง)
   T_air >= temp_exhaust_on(33)   -> EXHAUST ON ; MIST allow (ช่วยเย็น) ; HEATER OFF

4) HUMIDITY (เฉพาะโซนทอง และ T_air >= 27.5)
   RH < rh_min      -> MIST burst (mist_burst_sec / mist_gap_sec)
   rh_min..rh_max   -> คงไว้
   RH > rh_high     -> circulation fan / exhaust สั้นๆ ไล่ชื้น

5) VENTILATION (CO2 proxy, timer) : ทุก vent_period_min เปิด exhaust vent_duration_min
6) LIGHT (timer) : ON ช่วง light_on_hour..light_off_hour
7) CIRCULATION fan : ON เป็นรอบเพื่อเกลี่ยชั้นบน/ล่าง (หรือเมื่อ |T_top - T_bottom| สูง)

## INTERLOCK เหล็ก
- ถ้า T_air < 27.5  -> ห้าม MIST เด็ดขาด (แม้ RH ต่ำ)
- HEATER และ MIST ห้าม ON แรงพร้อมกัน
- ทุก actuator มี hysteresis / min-on / min-off กัน relay กระตุก
- โหมด MANUAL override จาก backend มี TTL (หมดเวลา -> กลับ AUTO)

## FSM (operational)
BOOT -> SELFTEST -> (AUTO: SPAWN_RUN | FRUITING) <-> MANUAL_OVERRIDE ; ANY -> SAFE_HOLD (เมื่อ safety trip)
