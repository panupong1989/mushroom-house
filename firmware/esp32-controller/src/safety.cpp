#include "safety.h"
#include "relays.h"
#include <string.h>

// ฮาร์ดแวร์ต้องมี interlock จริงด้วย (thermal cutoff/float) — นี่คือชั้น firmware เสริม
bool safety_check(const SensorSnapshot &s, const Setpoints &sp, char *out_alert, size_t n) {
  out_alert[0] = 0;

  // 1) น้ำต่ำ -> ล็อกปั๊ม/หมอก OFF
  if (!s.water_ok) {
    relay_set(RELAY_MIST, false, 0, 0);
    strncpy(out_alert, "LOW_WATER", n); return true;
  }
  // 2) กองร้อนเกิน -> heater OFF, exhaust ON
  if (s.bed_temp_max >= sp.bed_danger) {
    relay_set(RELAY_HEATER, false, 0, 0);
    relay_set(RELAY_EXHAUST, true, 0, 0);
    strncpy(out_alert, "BED_OVERHEAT", n); return true;
  }
  // 3) อากาศร้อนอันตราย -> exhaust + mist ON, heater OFF
  if (s.air_temp_ctrl >= sp.temp_danger_hot) {
    relay_set(RELAY_HEATER, false, 0, 0);
    relay_set(RELAY_EXHAUST, true, 0, 0);
    relay_set(RELAY_MIST, true, 0, 0);
    strncpy(out_alert, "HOT", n); return true;
  }
  return false;
}
