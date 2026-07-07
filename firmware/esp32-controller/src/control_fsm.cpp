#include "control_fsm.h"
#include "relays.h"
#include <string.h>

static Setpoints SP;
static Mode mode = M_FRUITING;
static Mode auto_mode = M_FRUITING;  // เฟส auto ล่าสุด (SPAWN_RUN/FRUITING) ไว้กลับหลัง MANUAL
static uint32_t last_vent=0, vent_started=0; static bool venting=false;
static uint32_t mist_started=0; static bool mist_on=false;
static float last_air_temp_ctrl = NAN;   // แคชไว้เช็ค interlock ตอนสั่ง manual (จาก mqtt callback)

// min-on/min-off ต่อโหลด (กันกระตุก) — หน่วย ms
static const uint32_t HEAT_MIN=30000, EXH_MIN=20000, MIST_MIN=5000;

enum ManualIdx { MI_MIST=0, MI_HEATER, MI_EXHAUST, MI_LIGHT, MI_CIRC, MI_COUNT };
struct ManualEntry { bool active=false; bool on=false; uint32_t start_ms=0; uint32_t ttl_ms=0; };
static ManualEntry manual[MI_COUNT];

void control_begin(const Setpoints &sp){ SP = sp; }
void control_set_mode(Mode m){
  if (m==M_SPAWN_RUN || m==M_FRUITING) auto_mode = m;
  mode = m;
}
Mode control_mode(){ return mode; }

const Setpoints &control_get_setpoints(){ return SP; }

bool control_set_setpoint(const char *key, float value){
  if      (!strcmp(key,"temp_heater_on"))    SP.temp_heater_on = value;
  else if (!strcmp(key,"temp_heater_off"))   SP.temp_heater_off = value;
  else if (!strcmp(key,"temp_exhaust_on"))   SP.temp_exhaust_on = value;
  else if (!strcmp(key,"temp_exhaust_off"))  SP.temp_exhaust_off = value;
  else if (!strcmp(key,"temp_floor"))        SP.temp_floor = value;
  else if (!strcmp(key,"temp_danger_hot"))   SP.temp_danger_hot = value;
  else if (!strcmp(key,"rh_min"))            SP.rh_min = value;
  else if (!strcmp(key,"rh_max"))            SP.rh_max = value;
  else if (!strcmp(key,"rh_high"))           SP.rh_high = value;
  else if (!strcmp(key,"bed_danger"))        SP.bed_danger = value;
  else if (!strcmp(key,"vent_period_min"))   SP.vent_period_ms = (uint32_t)(value*60000.0f);
  else if (!strcmp(key,"vent_duration_min")) SP.vent_duration_ms = (uint32_t)(value*60000.0f);
  else if (!strcmp(key,"mist_burst_sec"))    SP.mist_burst_ms = (uint32_t)(value*1000.0f);
  else if (!strcmp(key,"mist_gap_sec"))      SP.mist_gap_ms = (uint32_t)(value*1000.0f);
  else if (!strcmp(key,"light_on_hour"))     SP.light_on_hour = (uint8_t)value;
  else if (!strcmp(key,"light_off_hour"))    SP.light_off_hour = (uint8_t)value;
  else return false;
  return true;
}

static int actuator_idx(const char *name){
  if (!strcmp(name,"mist"))        return MI_MIST;
  if (!strcmp(name,"heater"))      return MI_HEATER;
  if (!strcmp(name,"exhaust"))     return MI_EXHAUST;
  if (!strcmp(name,"light"))       return MI_LIGHT;
  if (!strcmp(name,"circulation")) return MI_CIRC;
  return -1;
}
static int actuator_pin(int idx){
  switch(idx){
    case MI_MIST: return RELAY_MIST;
    case MI_HEATER: return RELAY_HEATER;
    case MI_EXHAUST: return RELAY_EXHAUST;
    case MI_LIGHT: return RELAY_LIGHT;
    case MI_CIRC: return RELAY_CIRCULATION;
    default: return -1;
  }
}
static uint32_t actuator_min_ms(int idx){
  switch(idx){
    case MI_MIST: return MIST_MIN;
    case MI_HEATER: return HEAT_MIN;
    case MI_EXHAUST: return EXH_MIN;
    default: return 0;
  }
}
static bool any_manual_active(){
  for (int i=0;i<MI_COUNT;i++) if (manual[i].active) return true;
  return false;
}

void control_manual_set(const char *actuator, const char *action, uint32_t ttl_sec){
  int idx = actuator_idx(actuator);
  if (idx < 0) return;

  if (!strcmp(action,"auto")){
    manual[idx].active = false;
    if (mode==M_MANUAL && !any_manual_active()) mode = auto_mode;
    return;
  }
  if (strcmp(action,"on") && strcmp(action,"off")) return;   // action ไม่รู้จัก
  bool on = !strcmp(action,"on");

  // INTERLOCK เหล็ก: ห้าม MIST ON ถ้า T_air < temp_heater_on แม้เป็นคำสั่ง manual
  if (idx==MI_MIST && on && !(last_air_temp_ctrl >= SP.temp_heater_on)) return;

  // HEATER และ MIST ห้าม ON พร้อมกัน
  if (idx==MI_HEATER && on){ manual[MI_MIST].active=false; relay_set(RELAY_MIST,false,MIST_MIN,MIST_MIN); mist_on=false; }
  if (idx==MI_MIST   && on){ manual[MI_HEATER].active=false; relay_set(RELAY_HEATER,false,HEAT_MIN,HEAT_MIN); }

  relay_set(actuator_pin(idx), on, actuator_min_ms(idx), actuator_min_ms(idx));
  if (idx==MI_MIST) mist_on = on;

  manual[idx].active = true;
  manual[idx].on = on;
  manual[idx].start_ms = millis();
  manual[idx].ttl_ms = ttl_sec*1000UL;
  mode = M_MANUAL;
}

static void control_manual_tick(){
  if (mode != M_MANUAL) return;
  uint32_t now = millis();
  for (int i=0;i<MI_COUNT;i++){
    if (manual[i].active && now - manual[i].start_ms >= manual[i].ttl_ms) manual[i].active = false;
  }
  if (!any_manual_active()) mode = auto_mode;
}

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
  last_air_temp_ctrl = s.air_temp_ctrl;   // แคชไว้ให้ control_manual_set เช็ค interlock ได้
  control_manual_tick();
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
