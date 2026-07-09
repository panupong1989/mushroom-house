#pragma once
#include "types.h"

// Client REST ของ Supabase (PostgREST) สำหรับ edge — ใช้ service_role key (bypass RLS)
// กฎเหล็ก: persist sensor_readings + actuator_events เสมอถ้ามีเน็ต (Supabase = single source of truth)

// CommandExec (typedef ใน types.h) = callback เอา command ที่ poll มา execute ผ่าน control_manual_set

void supabase_begin();

// GET sensors/actuators ของโรงนี้ครั้งเดียว -> map (kind,location)->id ไว้ใช้ post
// คืน true ถ้า resolve ได้ครบพอใช้งาน (ต้องมี WiFi ก่อน)
bool supabase_resolve_ids();
bool supabase_ids_ready();

// insert ค่าเซนเซอร์ล่าสุดทั้งชุด (air temp/rh x3, bed temp x3, water level) ลง sensor_readings
bool supabase_post_readings(const SensorSnapshot &s);

// insert 1 เหตุการณ์รีเลย์เปลี่ยนสถานะ ลง actuator_events (source: "auto"|"manual"|"safety")
bool supabase_post_event(const char *actuator_kind, bool state, const char *reason, const char *source);

// insert alert
bool supabase_post_alert(const char *code, const char *severity, const char *message);

// update houses.last_mode (+ last_mode_ts ถ้ามีเวลา NTP) — ให้ dashboard โชว์โหมด FSM ล่าสุด
bool supabase_update_house_mode(const char *mode, const char *iso_or_null);

// poll ตาราง commands (acked_at is null) -> เรียก exec ต่อคำสั่ง -> PATCH acked_at
// คืนจำนวนคำสั่งที่ประมวลผล (-1 ถ้า error เชื่อมต่อ)
int supabase_poll_commands(CommandExec exec);
