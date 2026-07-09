#pragma once
#include <stdint.h>

// secrets.h ถูก gitignore (มี service_role key) — มีเฉพาะเครื่อง dev ที่ cp มาจาก secrets.h.example
// ใช้ __has_include เพื่อให้ CI / checkout ใหม่ (ไม่มี secrets.h) ยัง build ผ่านด้วยค่า placeholder
// ตอนใช้งานจริงหน้างานต้องมี secrets.h จริง ไม่งั้นจะต่อ WiFi/Supabase ไม่ได้ (ค่า CHANGEME)
#if defined(__has_include)
#  if __has_include("secrets.h")
#    include "secrets.h"
#  endif
#endif
#ifndef SECRET_WIFI_SSID
#  warning "secrets.h not found - building with CHANGEME placeholders. Copy secrets.h.example to src/secrets.h and fill real WiFi/Supabase creds before deploying (device will NOT connect otherwise)."
#  define SECRET_WIFI_SSID            "CHANGEME"
#  define SECRET_WIFI_PASS            "CHANGEME"
#  define SECRET_SUPABASE_URL         "https://CHANGEME.supabase.co"
#  define SECRET_SUPABASE_SERVICE_KEY "CHANGEME"
#endif

// ---------- Identity ----------
#define HOUSE_ID        "house-01"
#define FW_VERSION      "0.2.0"

// ---------- WiFi (ค่าจาก secrets.h) ----------
#define WIFI_SSID       SECRET_WIFI_SSID
#define WIFI_PASS       SECRET_WIFI_PASS

// ---------- Supabase (โหมด Internet — ค่าจาก secrets.h) ----------
// REST base = <url>/rest/v1 ; ใช้ service_role key (bypass RLS) เฉพาะบน edge เท่านั้น
#define SUPABASE_URL          SECRET_SUPABASE_URL
#define SUPABASE_SERVICE_KEY  SECRET_SUPABASE_SERVICE_KEY

// ---------- App mode (Internet vs Local) ----------
// ค่าเริ่มต้นเมื่อ NVS ยังไม่เคยตั้ง — auto fallback เป็น Local ถ้าต่อเน็ต/Supabase ไม่ได้ (ดู main.cpp)
#define DEFAULT_APP_MODE       APP_INTERNET
#define LOCAL_HTTP_PORT        80

// ---------- MQTT (legacy — ปิดโดย default; เปิดด้วย -DUSE_MQTT=1) ----------
#ifndef USE_MQTT
#define USE_MQTT        0
#endif
#define MQTT_HOST       "192.168.1.10"
#define MQTT_PORT       1883
#define MQTT_BASE       "mush"      // -> mush/house-01/...

// ---------- RS485 (Modbus RTU) ----------
#define RS485_RX_PIN    16
#define RS485_TX_PIN    17
#define RS485_DE_RE_PIN 4          // -1 if auto-direction board
#define RS485_BAUD      9600
static const uint8_t RS485_ADDR[3] = {1, 2, 3};   // head, mid, tail
// location string ต่อจุด (ตรงกับ sensors.location ใน supabase/migrations/001_init.sql) —
// ใช้ resolve sensor_id ตอน boot + label
static const char *const SENSOR_LOC[3] = {"head", "mid", "tail"};

// ---------- 1-wire (DS18B20 x3) ----------
#define ONEWIRE_PIN     15

// ---------- Float switch ----------
#define FLOAT_PIN       34         // input, LOW = water low (adjust to wiring)

// ---------- Relay channels (active-high; use fail-safe module) ----------
#define RELAY_MIST        25
#define RELAY_HEATER      26
#define RELAY_EXHAUST     27
#define RELAY_LIGHT       32
#define RELAY_CIRCULATION 33

// ---------- Setpoints (defaults; override via cmd/config -> NVS) ----------
struct Setpoints {
  float temp_heater_on   = 27.5f;
  float temp_heater_off  = 29.5f;
  float temp_exhaust_on  = 33.0f;
  float temp_exhaust_off = 31.0f;
  float temp_floor       = 27.0f;
  float temp_danger_hot  = 38.0f;
  float rh_min           = 85.0f;
  float rh_max           = 90.0f;
  float rh_high          = 92.0f;
  float bed_danger       = 40.0f;
  uint32_t vent_period_ms   = 120UL*60*1000;
  uint32_t vent_duration_ms = 10UL*60*1000;
  uint32_t mist_burst_ms    = 20UL*1000;
  uint32_t mist_gap_ms      = 180UL*1000;
  uint8_t  light_on_hour    = 6;
  uint8_t  light_off_hour   = 18;
};

// ---------- Timing ----------
#define CONTROL_PERIOD_MS      2000     // control loop (edge-autonomous)
#define READINGS_POST_PERIOD_MS 20000   // insert sensor_readings ขึ้น Supabase (15-30s)
#define COMMAND_POLL_PERIOD_MS  4000    // poll ตาราง commands (3-5s) — โหมด Internet
#define HEARTBEAT_PERIOD_MS     30000
#define TELEMETRY_PERIOD_MS     15000   // (legacy MQTT)
