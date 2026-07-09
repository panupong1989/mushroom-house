#pragma once
#include "types.h"
#include "config.h"
void control_begin(const Setpoints &sp);
void control_set_mode(Mode m);
Mode control_mode();
// เรียกทุก CONTROL_PERIOD_MS หลังผ่าน safety แล้ว
void control_step(const SensorSnapshot &s);

// อัปเดตแคช snapshot (air/น้ำ/กอง) สำหรับเช็ค interlock ตอนสั่ง manual — main เรียกทุกรอบ "ก่อน"
// safety_check เพื่อให้ cache สดแม้รอบนั้น trip (control_step ไม่ถูกเรียก) ปิดช่อง manual ชนะ safety
void control_cache_snapshot(const SensorSnapshot &s);

// ---- cmd/config: อัปเดต setpoint ทีละคีย์ (ชื่อคีย์ตาม docs/03-control-logic.md) ----
// คืน true ถ้ารู้จัก key (ค่าที่ไม่รู้จักจะถูกข้าม)
bool control_set_setpoint(const char *key, float value);
const Setpoints &control_get_setpoints();

// ---- cmd/actuator: manual override ต่อ actuator เดียว มี TTL ----
// actuator: "mist"|"heater"|"exhaust"|"light"|"circulation"; action: "on"|"off"|"auto"
// เคารพ INTERLOCK เหล็ก (ห้าม mist ON ตอนอากาศเย็น, heater/mist ห้าม ON พร้อมกัน) แม้เป็นคำสั่ง manual
// TTL หมดอายุ -> actuator นั้นกลับ AUTO (ถ้าไม่มีตัวไหน manual ค้างแล้ว โหมดรวมกลับ AUTO ด้วย)
void control_manual_set(const char *actuator, const char *action, uint32_t ttl_sec);
