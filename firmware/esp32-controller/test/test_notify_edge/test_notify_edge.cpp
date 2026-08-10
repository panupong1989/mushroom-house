// Native unit test — ขอบแจ้งเตือน + hysteresis + cooldown (notify_edge.cpp)
// รัน: pio test -e native  (ดู platformio.ini [env:native])
//
// เคสตั้งต้นคือของจริง 10 ส.ค. 69: HOT ยิง 3 แถวใน 36 วิ (alerts id 184-186)
// ตอนอุณหภูมิเด้ง 32.9 <-> 33.0 ที่เกณฑ์ 33.0 -> LINE เด้ง 3 ข้อความ
#include <unity.h>
#include <math.h>
#include "notify_edge.h"
#include "config.h"

// ---- stub ให้ control_fsm.cpp (ถูก compile เข้ามาด้วยตาม build_src_filter) link ผ่าน ----
static bool g_relay[64];
void relay_set(int pin, bool on, uint32_t, uint32_t) { if (pin >= 0 && pin < 64) g_relay[pin] = on; }
unsigned long millis() { return 0UL; }   // เทสต์นี้ส่งเวลาเข้า alert_edge_update เองทุกครั้ง

static const uint32_t COOLDOWN = ALERT_REPOST_MS;   // 15 นาที

// จำลองเช็คแบบ "สูงเกินเกณฑ์" ตามสูตรเดียวกับ notify_check ใน main.cpp
static bool feed_above(AlertEdge &e, float val, float th, float hys, uint32_t now) {
  const bool ok = !isnan(val);
  return alert_edge_update(e, ok && val >= th, ok && val < th - hys, now, COOLDOWN);
}

void setUp() {}
void tearDown() {}

// ---- 1. ข้ามเกณฑ์ครั้งแรก = โพสต์ · ค้างเกินเกณฑ์ต่อ = ไม่โพสต์ซ้ำ ----
void test_first_cross_posts_once(void) {
  AlertEdge e{};
  TEST_ASSERT_TRUE(feed_above(e, 33.0f, 33.0f, ALERT_HYS_TEMP_C, 1000));
  TEST_ASSERT_FALSE(feed_above(e, 33.2f, 33.0f, ALERT_HYS_TEMP_C, 3000));
  TEST_ASSERT_FALSE(feed_above(e, 35.0f, 33.0f, ALERT_HYS_TEMP_C, 5000));
}

// ---- 2. REGRESSION: ค่าแกว่งคาบเกณฑ์ 32.9 <-> 33.0 ต้องได้ alert เดียว (ของเดิมได้ 3) ----
void test_flapping_at_threshold_posts_once(void) {
  AlertEdge e{};
  // ลำดับค่าจริงจาก sensor_readings ช่วง 04:48-04:49 UTC + ค่าที่ตกระหว่างรอบอัปโหลด
  const float seq[] = { 32.8f, 32.9f, 33.0f, 32.9f, 33.0f, 32.9f, 33.0f, 33.0f, 33.1f };
  int posts = 0;
  uint32_t now = 0;
  for (float v : seq) {
    now += CONTROL_PERIOD_MS;                       // control loop 2 วิ
    if (feed_above(e, v, 33.0f, ALERT_HYS_TEMP_C, now)) posts++;
  }
  TEST_ASSERT_EQUAL_INT(1, posts);
}

// ---- 3. ตกต่ำกว่า hysteresis แล้วข้ามใหม่ "ใน" cooldown = ยังไม่โพสต์ ----
void test_clear_then_recross_within_cooldown_is_quiet(void) {
  AlertEdge e{};
  TEST_ASSERT_TRUE(feed_above(e, 33.0f, 33.0f, ALERT_HYS_TEMP_C, 1000));
  TEST_ASSERT_FALSE(feed_above(e, 32.0f, 33.0f, ALERT_HYS_TEMP_C, 60000));       // < 32.5 = clear จริง
  TEST_ASSERT_FALSE(feed_above(e, 33.4f, 33.0f, ALERT_HYS_TEMP_C, 120000));      // ข้ามใหม่ แต่ยังไม่พ้น 15 นาที
}

// ---- 4. ตกต่ำกว่า hysteresis แล้วข้ามใหม่ "หลัง" cooldown = โพสต์ (เหตุการณ์ใหม่จริง) ----
void test_clear_then_recross_after_cooldown_posts(void) {
  AlertEdge e{};
  TEST_ASSERT_TRUE(feed_above(e, 33.0f, 33.0f, ALERT_HYS_TEMP_C, 1000));
  TEST_ASSERT_FALSE(feed_above(e, 32.0f, 33.0f, ALERT_HYS_TEMP_C, 60000));
  TEST_ASSERT_TRUE(feed_above(e, 33.4f, 33.0f, ALERT_HYS_TEMP_C, 1000 + COOLDOWN + 1));
}

// ---- 5. เซนเซอร์อ่านไม่ได้ (NAN) ต้องไม่รีเซ็ตขอบ — ไม่งั้นสะดุดทีก็ยิงซ้ำที ----
void test_nan_reading_does_not_reset_edge(void) {
  AlertEdge e{};
  TEST_ASSERT_TRUE(feed_above(e, 33.5f, 33.0f, ALERT_HYS_TEMP_C, 1000));
  TEST_ASSERT_FALSE(feed_above(e, NAN,   33.0f, ALERT_HYS_TEMP_C, 3000));
  TEST_ASSERT_FALSE(feed_above(e, NAN,   33.0f, ALERT_HYS_TEMP_C, 5000));
  TEST_ASSERT_FALSE(feed_above(e, 33.5f, 33.0f, ALERT_HYS_TEMP_C, 7000));   // กลับมาอ่านได้ = ไม่ใช่เหตุการณ์ใหม่
}

// ---- 6. ฝั่ง "ต่ำเกิน" (COLD/RH_LOW) — clear ต้องเป็นการขึ้นเหนือเกณฑ์+hys ----
void test_below_threshold_side_flapping(void) {
  AlertEdge e{};
  auto feed_below = [&](float val, float th, float hys, uint32_t now) {
    const bool ok = !isnan(val);
    return alert_edge_update(e, ok && val < th, ok && val > th + hys, now, COOLDOWN);
  };
  TEST_ASSERT_TRUE(feed_below(29.9f, 30.0f, ALERT_HYS_TEMP_C, 1000));
  TEST_ASSERT_FALSE(feed_below(30.1f, 30.0f, ALERT_HYS_TEMP_C, 3000));   // ยังอยู่ในแถบ hys (< 30.5)
  TEST_ASSERT_FALSE(feed_below(29.9f, 30.0f, ALERT_HYS_TEMP_C, 5000));   // เด้งกลับ = ไม่ใช่เหตุการณ์ใหม่
}

// ---- 7. LOW_WATER เป็นดิจิทัล (ไม่มี hysteresis) — ยังต้องได้ cooldown กันลูกลอยสั่น ----
void test_digital_input_uses_cooldown(void) {
  AlertEdge e{};
  TEST_ASSERT_TRUE(alert_edge_update(e, true, false, 1000, COOLDOWN));       // น้ำต่ำ
  TEST_ASSERT_FALSE(alert_edge_update(e, false, true, 2000, COOLDOWN));      // ลูกลอยเด้งกลับ
  TEST_ASSERT_FALSE(alert_edge_update(e, true, false, 3000, COOLDOWN));      // สั่นอีก = เงียบ
  TEST_ASSERT_FALSE(alert_edge_update(e, false, true, 4000, COOLDOWN));
  TEST_ASSERT_TRUE(alert_edge_update(e, true, false, 1000 + COOLDOWN + 1, COOLDOWN));  // พ้น cooldown = แจ้งใหม่
}

// ---- 8. millis() วนรอบที่ ~49.7 วัน ต้องไม่ทำให้เงียบยาว/ยิงรัว ----
void test_millis_wraparound(void) {
  AlertEdge e{};
  const uint32_t near_max = 0xFFFFFFFFUL - 1000;
  TEST_ASSERT_TRUE(alert_edge_update(e, true, false, near_max, COOLDOWN));
  TEST_ASSERT_FALSE(alert_edge_update(e, false, true, near_max + 500, COOLDOWN));
  // เวลาวนกลับไป 0 แล้วเดินต่อจนพ้น cooldown -> ต้องโพสต์ได้ (ลบกันแบบ uint32 ให้ผลถูก)
  TEST_ASSERT_TRUE(alert_edge_update(e, true, false, (uint32_t)(near_max + COOLDOWN + 1), COOLDOWN));
}

int main(int, char **) {
  UNITY_BEGIN();
  RUN_TEST(test_first_cross_posts_once);
  RUN_TEST(test_flapping_at_threshold_posts_once);
  RUN_TEST(test_clear_then_recross_within_cooldown_is_quiet);
  RUN_TEST(test_clear_then_recross_after_cooldown_posts);
  RUN_TEST(test_nan_reading_does_not_reset_edge);
  RUN_TEST(test_below_threshold_side_flapping);
  RUN_TEST(test_digital_input_uses_cooldown);
  RUN_TEST(test_millis_wraparound);
  return UNITY_END();
}
