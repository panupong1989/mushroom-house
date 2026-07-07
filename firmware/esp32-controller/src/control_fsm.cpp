#include "control_fsm.h"
#include "relays.h"

static Setpoints SP;
static Mode mode = M_FRUITING;
static uint32_t last_vent=0, vent_started=0; static bool venting=false;
static uint32_t mist_started=0; static bool mist_on=false;

// min-on/min-off ต่อโหลด (กันกระตุก) — หน่วย ms
static const uint32_t HEAT_MIN=30000, EXH_MIN=20000, MIST_MIN=5000;

void control_begin(const Setpoints &sp){ SP = sp; }
void control_set_mode(Mode m){ mode = m; }
Mode control_mode(){ return mode; }

static void handle_humidity(const SensorSnapshot &s){
  // เฉพาะเมื่ออุณหภูมิ >= heater_on (ห้ามพ่นตอนหนาว = INTERLOCK เหล็ก)
  if (s.air_temp_ctrl < SP.temp_heater_on) { relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false; return; }
  uint32_t now=millis();
  if (s.air_rh_ctrl < SP.rh_min) {
    if (!mist_on && now-mist_started >= SP.mist_gap_ms) { relay_set(RELAY_MIST,true,MIST_MIN,MIST_MIN); mist_on=true; mist_started=now; }
    else if (mist_on && now-mist_started >= SP.mist_burst_ms) { relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false; mist_started=now; }
  } else if (s.air_rh_ctrl > SP.rh_high) {
    relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false;
    relay_set(RELAY_CIRCULATION,true,0,0);   // ไล่ชื้นส่วนเกิน
  } else {
    relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false;
  }
}

static void handle_ventilation(){
  uint32_t now=millis();
  if (!venting && now-last_vent >= SP.vent_period_ms) { venting=true; vent_started=now; relay_set(RELAY_EXHAUST,true,EXH_MIN,EXH_MIN); }
  if (venting && now-vent_started >= SP.vent_duration_ms) { venting=false; last_vent=now; relay_set(RELAY_EXHAUST,false,EXH_MIN,EXH_MIN); }
}

void control_step(const SensorSnapshot &s){
  if (mode==M_MANUAL || mode==M_SAFE_HOLD) return;   // manual/ปลอดภัยจัดการที่อื่น

  if (mode==M_SPAWN_RUN){
    // เดินเส้นใย: คุมอุณหภูมิในกอง ~32-35 (ใช้ bed_temp_max เป็นตัวแทนเบื้องต้น)
    if (s.bed_temp_max < 32.0f) relay_set(RELAY_HEATER,true,HEAT_MIN,HEAT_MIN);
    else if (s.bed_temp_max > 35.0f) relay_set(RELAY_HEATER,false,HEAT_MIN,HEAT_MIN);
    handle_ventilation();
    return;
  }

  // ---- FRUITING: temperature ladder (temp = master) ----
  float T = s.air_temp_ctrl;
  if (T < SP.temp_heater_on) {                     // เย็นไป
    relay_set(RELAY_HEATER,true,HEAT_MIN,HEAT_MIN);
    relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false;   // ห้ามพ่น
    relay_set(RELAY_EXHAUST,false,EXH_MIN,EXH_MIN);
  } else if (T >= SP.temp_exhaust_on) {            // ร้อนไป
    relay_set(RELAY_HEATER,false,HEAT_MIN,HEAT_MIN);
    relay_set(RELAY_EXHAUST,true,EXH_MIN,EXH_MIN);
    // หมอกช่วยเย็นได้ในโซนนี้
    if (s.air_rh_ctrl < SP.rh_max) { relay_set(RELAY_MIST,true,MIST_MIN,MIST_MIN); mist_on=true; }
  } else {                                         // โซนทอง
    if (T >= SP.temp_heater_off) relay_set(RELAY_HEATER,false,HEAT_MIN,HEAT_MIN);
    handle_humidity(s);
    handle_ventilation();
  }
  // TODO(CC): circulation fan ตามรอบ/ตาม |T_top - T_bottom|
  // TODO(CC): light ตามชั่วโมง (ต้องมี RTC/NTP)
}
