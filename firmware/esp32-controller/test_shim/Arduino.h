#pragma once
// Arduino shim ขั้นต่ำสำหรับ native unit test (env:native) — ให้ types.h/control_fsm.cpp compile บน host
// millis() ถูก define ในไฟล์เทสต์ (คุมเวลาจำลองได้) ไม่พึ่ง framework จริง
#include <stdint.h>
#include <math.h>
#include <string.h>

unsigned long millis();
