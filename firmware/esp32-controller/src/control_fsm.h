#pragma once
#include "types.h"
#include "config.h"
void control_begin(const Setpoints &sp);
void control_set_mode(Mode m);
Mode control_mode();
// เรียกทุก CONTROL_PERIOD_MS หลังผ่าน safety แล้ว
void control_step(const SensorSnapshot &s);
