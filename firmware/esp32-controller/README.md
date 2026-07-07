# ESP32 Controller (firmware)

Edge controller — อ่านเซนเซอร์ RS485(Modbus)+DS18B20, รัน control FSM, คุมรีเลย์, คุย MQTT
**ทำงานเองได้แม้เน็ตหลุด** (control loop อยู่บนบอร์ด)

## โครง src/
- `config.h`        พิน/ค่าคงที่/หัวข้อ MQTT/ค่า setpoint default
- `rs485_sensors.*` อ่าน T/RH x3 ผ่าน Modbus RTU
- `onewire_bed.*`   อ่าน DS18B20 x3 (วางเป็น TODO ใน main)
- `relays.*`        คุมรีเลย์ + min-on/min-off + fail-safe
- `safety.*`        interlock (float dry-run, bed overheat, danger hot)
- `control_fsm.*`   FSM + temperature ladder + humidity + timer vent/light
- `mqtt_client.*`   publish telemetry / subscribe cmd
- `main.cpp`        setup/loop + watchdog

## หมายเหตุ
- ใช้ RS485 transceiver 3.3V; ตั้ง DE/RE ที่ `RS485_DE_RE_PIN`
- relay fail-safe: เลือกโมดูลที่ OFF เมื่อไฟหาย
- ค่า setpoint รับ override จาก backend ผ่าน `mush/<house>/cmd/config` แล้วเก็บ NVS (TODO)
