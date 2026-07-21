# ESP32 Sensor PoC (firmware เฟสแรก)

โปรเจกต์ PlatformIO แยกต่างหากจาก `firmware/esp32-controller` — ใช้สำหรับ **commissioning หน้างานเฟสแรก**
ก่อนขึ้น control loop เต็มระบบ: อ่านเซนเซอร์จริงแล้วยิงขึ้น Supabase เท่านั้น **ไม่มี control/relay/safety**

## ฮาร์ดแวร์ที่รองรับ
- DS18B20 x7 บนบัส 1-Wire เดียว (GPIO15) — 6 จุดในกอง (2 แถว x 3 ชั้น) + 1 จุดนอกโรง
  (ตำแหน่งตรงกับ seed ใน `supabase/migrations/005_real_sensors.sql`)
- RS485 XY-MD02 x2 (Modbus RTU, address ตั้งหน้างานเป็น 1 และ 2) — วัด T/RH คู่ head/tail

## 2 environments

| env | ใช้ทำอะไร |
|---|---|
| `esp32dev` (default) | firmware เฟสแรกจริง — อ่านเซนเซอร์ + ยิง Supabase ทุก ~25s |
| `romscan` | เครื่องมือหน้างาน: อ่าน ROM id ของ DS18B20 ทั้ง 7 ตัว แล้วผูกเข้าตำแหน่ง เก็บ NVS |

ทั้งสอง env ใช้โค้ดร่วมกันเกือบทั้งหมด (`config.h`, `rom_map.*`, `onewire_multi.*`, `rs485_sensors.*`,
`net.*`, `supabase_client.*`) ต่างกันแค่ตัวไหนมี `setup()/loop()` — เลือกด้วย `build_src_filter`
(`main.cpp` สำหรับ `esp32dev`, `rom_scan.cpp` สำหรับ `romscan`)

## ขั้นตอนหน้างาน

1. **เตรียม secrets** (ห้าม commit — gitignored อยู่แล้ว):
   ```
   cp src/secrets.h.example src/secrets.h
   ```
   เติม WiFi + `SECRET_SUPABASE_URL` + `SECRET_SUPABASE_SERVICE_KEY` (service_role)

2. **รัน migration** `supabase/migrations/001 → 005` ให้ครบก่อน (005 = seed ตำแหน่งจริง 7 DS18B20 + 2 air_th)

3. **Map ROM ของ DS18B20** (ต้องทำก่อน ไม่งั้น `esp32dev` จะอ่านได้แต่ไม่รู้จะ post ลง sensor ไหน):
   ```
   pio run -e romscan -t upload
   pio device monitor -e romscan
   ```
   ในหน้า monitor:
   - พิมพ์ `scan` ดูว่าเจอครบ 7 ตัวไหม (ROM แต่ละตัว)
   - จับ/อุ่นโพรบที่รู้ตำแหน่งจริง (เช่นเอามือบีบปลายโพรบที่จิ้ม row1_head_top) แล้ว `scan` อีกครั้ง
     ดูว่า `bus_idx` ไหนอุณหภูมิขึ้น — นั่นคือตัวที่ต้อง map เข้าตำแหน่งนั้น
   - พิมพ์ `list` ดู `pos_idx` ของแต่ละตำแหน่ง (0-6 ตรงกับ `DS_POSITION` ใน `src/config.h`)
   - พิมพ์ `map <pos_idx> <bus_idx>` เพื่อผูก เช่น `map 0 3`
   - ทำซ้ำจนครบ 7 ตำแหน่ง แล้ว `list` เช็คว่าไม่มีตำแหน่งไหนขึ้น "(ยังไม่ผูก)"
   - mapping เก็บใน NVS ของบอร์ด (namespace `ds_map`) — ติดอยู่กับบอร์ดถาวร ไม่ต้องทำซ้ำเวลา flash ใหม่
     (นอกจาก erase flash หรือย้าย probe ไปคนละบอร์ด)

4. **Flash firmware เฟสแรกจริง**:
   ```
   pio run
   pio run -t upload
   pio device monitor
   ```
   ควรเห็น log `[ds] row1_head_top = ..C` / `[rs485] head addr=1 T=..C RH=..%` ทุก ~25s และ
   `[supabase] post_readings ok` ถ้าต่อเน็ต + resolve id สำเร็จ

5. เช็คใน Supabase table editor / dashboard ว่ามีแถวใหม่ใน `sensor_readings` ของ `house-01`

## หมายเหตุ

- RS485 address จริงหน้างาน (1, 2) เป็นค่าอิสระ ไม่ต้องตรงกับ `address` column ใน DB — firmware
  resolve sensor_id ด้วย `location` (`head`/`tail`) ไม่ใช่เลข modbus address (ดู `supabase_client.cpp`)
- DS18B20 resolve sensor_id ด้วย `(kind, address)` โดย `address` คือ string ตำแหน่งเช่น `row1_head_top`
  (ตรงกับ `005_real_sensors.sql`) ไม่ใช่ ROM — ROM ผูกกับตำแหน่งผ่าน `rom_map` (NVS) แยกต่างหาก
- ยังไม่มี relay/control/safety ใดๆ ในโปรเจกต์นี้ — เมื่อ commissioning เซนเซอร์เสร็จแล้วค่อยย้ายไปใช้
  `firmware/esp32-controller` (เต็มระบบ) ต่อ
- TLS ใช้ `setInsecure()` เหมือน `esp32-controller` เดิม — TODO(CC): pin root CA ก่อนใช้งานจริงระยะยาว
