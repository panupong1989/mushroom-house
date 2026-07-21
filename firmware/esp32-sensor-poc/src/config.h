#pragma once
#include <stdint.h>

// secrets.h ถูก gitignore (มี service_role key) — ใช้ __has_include ให้ CI/checkout ใหม่ build ผ่านด้วยค่า
// placeholder ได้เสมอ (ดู firmware/esp32-controller/src/config.h ที่ใช้ pattern เดียวกัน)
#if defined(__has_include)
#  if __has_include("secrets.h")
#    include "secrets.h"
#  endif
#endif
#ifndef SECRET_WIFI_SSID
#  warning "secrets.h not found - building with CHANGEME placeholders. Copy secrets.h.example to src/secrets.h ก่อนใช้งานหน้างาน"
#  define SECRET_WIFI_SSID            "CHANGEME"
#  define SECRET_WIFI_PASS            "CHANGEME"
#  define SECRET_SUPABASE_URL         "https://CHANGEME.supabase.co"
#  define SECRET_SUPABASE_SERVICE_KEY "CHANGEME"
#endif

// ---------- Identity ----------
#define HOUSE_ID    "house-01"
#define FW_VERSION  "sensor-poc-0.1.0"

// ---------- WiFi / Supabase ----------
#define WIFI_SSID             SECRET_WIFI_SSID
#define WIFI_PASS             SECRET_WIFI_PASS
#define SUPABASE_URL          SECRET_SUPABASE_URL
#define SUPABASE_SERVICE_KEY  SECRET_SUPABASE_SERVICE_KEY

// ---------- 1-wire (DS18B20 x7) ----------
#define ONEWIRE_PIN     15
#define DS18B20_COUNT   7

// ตำแหน่งตรงกับ address ที่ seed ไว้แล้วใน supabase/migrations/005_real_sensors.sql —
// 6 จุดในกอง (2 แถว x 3 ชั้น) + 1 จุดนอกโรง อย่าย้ายลำดับโดยไม่แก้ rom_map ที่ผูกไว้แล้วหน้างาน
static const char *const DS_POSITION[DS18B20_COUNT] = {
  "row1_head_top", "row1_mid_mid", "row1_tail_bottom",
  "row2_head_top", "row2_mid_mid", "row2_tail_bottom",
  "outside",
};
// kind ต่อ position (index ตรงกับ DS_POSITION) — 6 ตัวแรก bed_temp, ตัวสุดท้าย outside_temp
static const char *const DS_KIND[DS18B20_COUNT] = {
  "bed_temp", "bed_temp", "bed_temp", "bed_temp", "bed_temp", "bed_temp", "outside_temp",
};

// ---------- RS485 (Modbus RTU) — XY-MD02 x2 ----------
#define RS485_RX_PIN     16
#define RS485_TX_PIN     17
#define RS485_DE_RE_PIN  4          // -1 ถ้าใช้บอร์ด auto-direction
#define RS485_BAUD       9600
#define RS485_COUNT      2
static const uint8_t RS485_ADDR[RS485_COUNT] = {1, 2};   // modbus slave address จริงหน้างาน (อิสระ ไม่ต้องตรง DB)
// location ตรงกับ air_th ที่ seed ไว้แล้วใน 001_init.sql (addr='1' head, addr='3' tail) —
// resolve sensor_id ด้วย location ไม่ใช่เลข address จึงตั้ง modbus addr เป็น 1,2 หน้างานได้อิสระ
static const char *const RS485_LOC[RS485_COUNT] = {"head", "tail"};

// ---------- Timing ----------
#define READINGS_POST_PERIOD_MS  25000UL   // 20-30s
#define RESOLVE_RETRY_PERIOD_MS  10000UL
#define HEARTBEAT_PERIOD_MS      30000UL
