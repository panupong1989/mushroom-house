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

// โหมดการ "รับคำสั่ง/แสดงผล" (คนละแกนกับ Mode ของ FSM):
//  - APP_INTERNET: คุมผ่าน dashboard (Supabase) — ESP32 post readings + poll ตาราง commands
//  - APP_LOCAL   : คุมผ่าน web server ในตัว ESP32 (LAN, latency ~0) ตอนอยู่หน้างาน
// กฎเหล็ก: ทั้ง 2 โหมด persist sensor_readings + actuator_events ขึ้น Supabase เสมอถ้ามีเน็ต
// (Supabase = single source of truth) — control FSM + safety เป็น edge-autonomous ทั้งคู่
enum AppMode { APP_INTERNET, APP_LOCAL };

// callback สั่ง actuator (manual) — ผ่าน control_manual_set ที่เคารพ interlock เหล็กเสมอ
// action: "on"|"off"|"auto" — ใช้ร่วมทั้ง command จาก Supabase (supabase.cpp) และปุ่ม local web (local_server.cpp)
typedef void (*CommandExec)(const char *actuator, const char *action, uint32_t ttl_sec);
