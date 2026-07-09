#pragma once
#include "types.h"
#include "config.h"
// โหลดค่า setpoint จาก NVS ทับลงใน sp; คีย์ไหนไม่เคยเซฟมาก่อนใช้ค่าเดิมใน sp (default จาก config.h)
void nvs_load_setpoints(Setpoints &sp);
// เซฟค่า setpoint ปัจจุบันทั้งหมดลง NVS
void nvs_save_setpoints(const Setpoints &sp);

// app mode (Internet/Local) — ค่าตั้งใจของผู้ใช้ (คนละเรื่องกับ fallback อัตโนมัติตอนเน็ตหลุด)
AppMode nvs_load_mode(AppMode def);
void    nvs_save_mode(AppMode m);
