#include "nvs_store.h"
#include <Preferences.h>

static const char *NS = "mush_sp";

void nvs_load_setpoints(Setpoints &sp){
  Preferences p;
  if (!p.begin(NS, true)) return;   // read-only; ไม่เคยเซฟมาก่อน = ใช้ default ที่ส่งเข้ามา
  sp.temp_heater_on   = p.getFloat("t_hon",   sp.temp_heater_on);
  sp.temp_heater_off  = p.getFloat("t_hoff",  sp.temp_heater_off);
  sp.temp_exhaust_on  = p.getFloat("t_eon",   sp.temp_exhaust_on);
  sp.temp_exhaust_off = p.getFloat("t_eoff",  sp.temp_exhaust_off);
  sp.temp_floor       = p.getFloat("t_floor", sp.temp_floor);
  sp.temp_danger_hot  = p.getFloat("t_dhot",  sp.temp_danger_hot);
  sp.rh_min           = p.getFloat("rh_min",  sp.rh_min);
  sp.rh_max           = p.getFloat("rh_max",  sp.rh_max);
  sp.rh_high          = p.getFloat("rh_high", sp.rh_high);
  sp.bed_danger       = p.getFloat("bed_dgr", sp.bed_danger);
  sp.vent_period_ms   = p.getULong("vent_per", sp.vent_period_ms);
  sp.vent_duration_ms = p.getULong("vent_dur", sp.vent_duration_ms);
  sp.mist_burst_ms    = p.getULong("mist_bst", sp.mist_burst_ms);
  sp.mist_gap_ms      = p.getULong("mist_gap", sp.mist_gap_ms);
  sp.light_on_hour    = (uint8_t)p.getUChar("lt_on",  sp.light_on_hour);
  sp.light_off_hour   = (uint8_t)p.getUChar("lt_off", sp.light_off_hour);
  p.end();
}

void nvs_save_setpoints(const Setpoints &sp){
  Preferences p;
  if (!p.begin(NS, false)) return;
  p.putFloat("t_hon",   sp.temp_heater_on);
  p.putFloat("t_hoff",  sp.temp_heater_off);
  p.putFloat("t_eon",   sp.temp_exhaust_on);
  p.putFloat("t_eoff",  sp.temp_exhaust_off);
  p.putFloat("t_floor", sp.temp_floor);
  p.putFloat("t_dhot",  sp.temp_danger_hot);
  p.putFloat("rh_min",  sp.rh_min);
  p.putFloat("rh_max",  sp.rh_max);
  p.putFloat("rh_high", sp.rh_high);
  p.putFloat("bed_dgr", sp.bed_danger);
  p.putULong("vent_per", sp.vent_period_ms);
  p.putULong("vent_dur", sp.vent_duration_ms);
  p.putULong("mist_bst", sp.mist_burst_ms);
  p.putULong("mist_gap", sp.mist_gap_ms);
  p.putUChar("lt_on",  sp.light_on_hour);
  p.putUChar("lt_off", sp.light_off_hour);
  p.end();
}
