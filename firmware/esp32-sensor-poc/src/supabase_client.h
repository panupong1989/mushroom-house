#pragma once
#include "types.h"
#include "config.h"

// Client REST ของ Supabase (PostgREST) สำหรับ edge — ใช้ service_role key (bypass RLS)
// เฟสแรก: มีแค่ resolve id + insert sensor_readings (ยังไม่มี actuators/commands/control)

void supabase_begin();

// GET sensors ของโรงนี้ (kind air_th/bed_temp/outside_temp) ครั้งเดียว -> map เข้า id ไว้ใช้ post
// resolve DS18B20 ด้วย (kind,address) ตรงกับ DS_KIND/DS_POSITION ; RS485 ด้วย (kind=air_th,location)
// คืน true ถ้า resolve ได้อย่างน้อย 1 จุด (ต้องมี WiFi ก่อน)
bool supabase_resolve_ids();
bool supabase_ids_ready();

// insert ค่าเซนเซอร์ล่าสุดทั้งชุด (bed/outside temp x7, air temp+rh x2) ลง sensor_readings
// ข้ามจุดที่ยังไม่ resolve id หรืออ่านไม่ได้ (ok=false) — คืน true ถ้า insert อย่างน้อย 1 แถว
bool supabase_post_readings(const DsReading ds[DS18B20_COUNT], const AirReading air[RS485_COUNT]);
