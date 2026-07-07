#pragma once
#include "types.h"
#include "config.h"
// คืน true ถ้ามี safety trip (เรียกก่อน control ทุกรอบ) + สั่ง relay ที่จำเป็นเอง
// เขียน alert code ลง out_alert (ว่าง = ไม่มี)
bool safety_check(const SensorSnapshot &s, const Setpoints &sp, char *out_alert, size_t n);
