#pragma once
#include "types.h"
#include "config.h"
// โหลดค่า setpoint จาก NVS ทับลงใน sp; คีย์ไหนไม่เคยเซฟมาก่อนใช้ค่าเดิมใน sp (default จาก config.h)
void nvs_load_setpoints(Setpoints &sp);
// เซฟค่า setpoint ปัจจุบันทั้งหมดลง NVS
void nvs_save_setpoints(const Setpoints &sp);
