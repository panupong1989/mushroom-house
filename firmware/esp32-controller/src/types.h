#pragma once
#include <Arduino.h>

struct AirReading { uint8_t addr; float temp; float rh; bool ok; };
struct BedReading { char rom[20]; float temp; bool ok; };

struct SensorSnapshot {
  AirReading air[3];
  BedReading bed[3];
  bool  water_ok;
  float air_temp_ctrl;   // ค่าอุณหภูมิที่ใช้คุม (เฉลี่ย/วิกฤต)
  float air_rh_ctrl;
  float bed_temp_max;
  uint32_t ts;
};

enum Mode { M_BOOT, M_SELFTEST, M_SPAWN_RUN, M_FRUITING, M_MANUAL, M_SAFE_HOLD };

struct ActuatorState { bool mist, heater, exhaust, light, circulation; };
