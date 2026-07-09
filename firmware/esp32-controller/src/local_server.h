#pragma once
#include "types.h"
#include <stddef.h>

// Web server ในตัว ESP32 (โหมด Local) — คุมตรงหน้างาน latency ~0 ผ่าน LAN
void local_server_begin();

// อัปเดต snapshot ล่าสุดให้หน้าเว็บ/JSON แสดง (เรียกใน loop ทุกรอบ control)
void local_server_update(const SensorSnapshot &s, const ActuatorState &a, Mode fsm_mode);

// ดึงคำสั่งจากปุ่มบนหน้าเว็บ 1 รายการ (คืน false ถ้าคิวว่าง) — เรียกใน loop() เพื่อ execute
// ใน task หลัก (กัน race กับ relay/control ที่ทำงานคนละ task กับ AsyncWebServer)
bool local_server_take_command(char *actuator, size_t na, char *action, size_t naa, uint32_t *ttl_sec);
