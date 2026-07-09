// Native unit test — INTERLOCK เหล็กใน control_manual_set (คำสั่งคนไม่ชนะ safety)
// รัน: pio test -e native  (ดู platformio.ini [env:native])
#include <unity.h>
#include "control_fsm.h"
#include "relays.h"
#include "config.h"
#include "types.h"

// ---- mock hardware (host) — บันทึกสถานะรีเลย์ในหน่วยความจำ ไม่แตะ GPIO จริง ----
static bool g_relay[64];
void relay_set(int pin, bool on, uint32_t, uint32_t) { if (pin >= 0 && pin < 64) g_relay[pin] = on; }
unsigned long millis() { return 100000UL; } // เวลาคงที่ — TTL ไม่หมดระหว่างเทสต์

static void reset_relays() { for (int i = 0; i < 64; i++) g_relay[i] = false; }

static SensorSnapshot make_snap(float air, float rh, float bed, bool water) {
  SensorSnapshot s{};
  for (int i = 0; i < 3; i++) {
    s.air[i].addr = (uint8_t)(i + 1); s.air[i].temp = air; s.air[i].rh = rh; s.air[i].ok = true;
    s.bed[i].temp = bed; s.bed[i].ok = true;
  }
  s.air_temp_ctrl = air; s.air_rh_ctrl = rh; s.bed_temp_max = bed; s.water_ok = water; s.ts = 1;
  return s;
}

// prime แคช interlock ด้วย snapshot แล้วล้างรีเลย์ ให้ assertion วัดเฉพาะผลของ manual command
static void prime(float air, float rh, float bed, bool water) {
  Setpoints sp; control_begin(sp);   // SP = default (bed_danger=40, temp_heater_on=27.5)
  control_cache_snapshot(make_snap(air, rh, bed, water));
  reset_relays();
}

void setUp() { reset_relays(); }
void tearDown() {}

// ข้อ 4.1 — น้ำต่ำ + กด mist ON (manual) => ต้องไม่ ON
void test_low_water_blocks_manual_mist() {
  prime(30.0f, 80.0f, 30.0f, /*water_ok=*/false);
  control_manual_set("mist", "on", 3600);
  TEST_ASSERT_FALSE(g_relay[RELAY_MIST]);
}

// ข้อ 4.2 — กอง >= 40 + กด heater ON (manual) => ต้องไม่ ON
void test_bed_overheat_blocks_manual_heater() {
  prime(20.0f, 80.0f, 42.0f, true);
  control_manual_set("heater", "on", 3600);
  TEST_ASSERT_FALSE(g_relay[RELAY_HEATER]);
}

// ข้อ 4.3 — T_air < 27.5 + กด mist ON => ต้องไม่ ON (interlock เดิม ตรวจว่ายังผ่าน)
void test_cold_blocks_manual_mist() {
  prime(25.0f, 80.0f, 30.0f, true);
  control_manual_set("mist", "on", 3600);
  TEST_ASSERT_FALSE(g_relay[RELAY_MIST]);
}

// เพิ่ม — กอง >= 40 + กด mist ON => ต้องไม่ ON (BED_OVERHEAT ห้ามพ่น mirror commandGuard.ts)
void test_bed_overheat_blocks_manual_mist() {
  prime(30.0f, 80.0f, 42.0f, true);
  control_manual_set("mist", "on", 3600);
  TEST_ASSERT_FALSE(g_relay[RELAY_MIST]);
}

// control บวก — สภาพปลอดภัยครบ => mist ON ต้องติดจริง (กันกรณีเทสต์บล็อกทุกอย่างหลอกๆ)
void test_safe_allows_manual_mist() {
  prime(30.0f, 80.0f, 35.0f, true);
  control_manual_set("mist", "on", 3600);
  TEST_ASSERT_TRUE(g_relay[RELAY_MIST]);
}

// control บวก — กองไม่ร้อน => heater ON ต้องติดจริง
void test_safe_allows_manual_heater() {
  prime(20.0f, 80.0f, 35.0f, true);
  control_manual_set("heater", "on", 3600);
  TEST_ASSERT_TRUE(g_relay[RELAY_HEATER]);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_low_water_blocks_manual_mist);
  RUN_TEST(test_bed_overheat_blocks_manual_heater);
  RUN_TEST(test_cold_blocks_manual_mist);
  RUN_TEST(test_bed_overheat_blocks_manual_mist);
  RUN_TEST(test_safe_allows_manual_mist);
  RUN_TEST(test_safe_allows_manual_heater);
  return UNITY_END();
}
