#include <Arduino.h>
#include <esp_task_wdt.h>
#include <math.h>
#include <string.h>
#include "config.h"
#include "types.h"
#include "rs485_sensors.h"
#include "onewire_bed.h"
#include "relays.h"
#include "safety.h"
#include "control_fsm.h"
#include "nvs_store.h"
#include "net.h"
#include "supabase.h"
#include "local_server.h"
#if USE_MQTT
#include "mqtt_client.h"
#endif

static Setpoints SP;
static AppMode desired_mode = APP_INTERNET;   // ค่าตั้งใจจาก NVS
static AppMode active_mode  = APP_LOCAL;       // ค่าที่ใช้จริง (fallback เป็น Local ถ้าเน็ตหลุด)

static SensorSnapshot last_snap;
static bool have_snap = false;
static ActuatorState prev_act{};
static bool prev_act_valid = false;
static char prev_alert[24] = {0};

static uint32_t t_ctrl = 0, t_readings = 0, t_poll = 0, t_hb = 0, t_resolve = 0;

static bool read_float_water() { return digitalRead(FLOAT_PIN) == HIGH; } // ปรับตามการต่อ

static void read_sensors(SensorSnapshot &s) {
  s.ts = millis() / 1000;
  float sum = 0; int okc = 0; float tmax = -100;
  for (int i = 0; i < 3; i++) {
    float t, rh; bool ok = rs485_read(RS485_ADDR[i], t, rh);
    s.air[i] = {RS485_ADDR[i], ok ? t : NAN, ok ? rh : NAN, ok};
    if (ok) { sum += t; okc++; if (t > tmax) tmax = t; }
  }
  // ใช้ค่า "วิกฤต" (สูงสุด) เป็นตัวคุมกันร้อนเกิน; เฉลี่ยไว้ทำ RH (docs/03-control-logic.md)
  s.air_temp_ctrl = okc ? tmax : NAN;
  float rhsum = 0; int rhc = 0; for (int i = 0; i < 3; i++) if (s.air[i].ok) { rhsum += s.air[i].rh; rhc++; }
  s.air_rh_ctrl = rhc ? rhsum / rhc : NAN;
  onewire_bed_read(s.bed, s.bed_temp_max);
  s.water_ok = read_float_water();
}

static const char *mode_name(Mode m) {
  switch (m) {
    case M_BOOT: return "BOOT";        case M_SELFTEST: return "SELFTEST";
    case M_SPAWN_RUN: return "SPAWN_RUN"; case M_FRUITING: return "FRUITING";
    case M_MANUAL: return "MANUAL";    case M_SAFE_HOLD: return "SAFE_HOLD";
    default: return "FRUITING";
  }
}
// source ของ actuator_event: manual (ผู้ใช้สั่ง) / safety (interlock trip) / auto (FSM ปกติ)
static const char *event_source(Mode m) { return m == M_MANUAL ? "manual" : (m == M_SAFE_HOLD ? "safety" : "auto"); }

// callback สั่ง manual — ใช้ร่วมทั้ง command จาก Supabase (poll) และปุ่มบน local web
// ทั้งคู่วิ่งใน task หลัก (loop) จึงไม่แตะ relay/control ข้าม task (local server enqueue ไว้ก่อน)
static void exec_command(const char *actuator, const char *action, uint32_t ttl_sec) {
  control_manual_set(actuator, action, ttl_sec);   // เคารพ interlock เหล็กภายใน
}

// post actuator_events เฉพาะ "ตัวที่เปลี่ยนสถานะ" ขึ้น Supabase (กฎเหล็ก: persist ทั้ง 2 โหมดถ้ามีเน็ต)
static void persist_events(const ActuatorState &cur) {
  if (!net_online() || !supabase_ids_ready()) { prev_act = cur; prev_act_valid = true; return; }
  const char *src = event_source(control_mode());
  if (!prev_act_valid) { prev_act = cur; prev_act_valid = true; return; }
  if (cur.mist        != prev_act.mist)        supabase_post_event("mist", cur.mist, "", src);
  if (cur.heater      != prev_act.heater)      supabase_post_event("heater", cur.heater, "", src);
  if (cur.exhaust     != prev_act.exhaust)     supabase_post_event("exhaust", cur.exhaust, "", src);
  if (cur.light       != prev_act.light)       supabase_post_event("light", cur.light, "", src);
  if (cur.circulation != prev_act.circulation) supabase_post_event("circulation", cur.circulation, "", src);
  prev_act = cur;
}

// เตือนตอน boot ถ้า secrets.h ยังเป็นค่า placeholder — จะต่อ WiFi/Supabase ไม่ได้ (persist ขึ้น Supabase ไม่ได้)
static void warn_if_changeme() {
  if (strstr(SECRET_SUPABASE_URL, "CHANGEME") || strstr(SECRET_SUPABASE_SERVICE_KEY, "CHANGEME") ||
      strcmp(SECRET_WIFI_SSID, "CHANGEME") == 0) {
    Serial.println("[WARN] secrets.h ยังเป็นค่า CHANGEME — ต่อ WiFi/Supabase ไม่ได้ และ persist ขึ้น Supabase ไม่ได้");
    Serial.println("[WARN] cp src/secrets.h.example -> src/secrets.h แล้วเติมค่าจริงก่อนใช้งานหน้างาน (control loop + safety ยังทำงาน edge ได้)");
  }
}

void setup() {
  Serial.begin(115200);
  warn_if_changeme();
  pinMode(FLOAT_PIN, INPUT);
  relays_begin();          // OFF ทั้งหมด (fail-safe)
  rs485_begin();
  onewire_bed_begin();
  nvs_load_setpoints(SP);   // override ค่า default ถ้าเคยเซฟไว้จาก cmd/config
  control_begin(SP);
  control_set_mode(M_FRUITING);
  desired_mode = nvs_load_mode(DEFAULT_APP_MODE);

  net_begin();              // WiFi (non-blocking) + NTP
  supabase_begin();
  local_server_begin();     // web server ในตัวพร้อมเสมอ (โหมด Local / ดูสถานะหน้างาน)
#if USE_MQTT
  mqtt_begin();
#endif

  // hardware watchdog 15s — arduino-esp32 3.x (IDF5) เปลี่ยน signature เป็นรับ config struct
#if defined(ESP_ARDUINO_VERSION) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  esp_task_wdt_config_t wdt_cfg = { .timeout_ms = 15000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_init(&wdt_cfg);
#else
  esp_task_wdt_init(15, true);
#endif
  esp_task_wdt_add(NULL);
}

void loop() {
  esp_task_wdt_reset();
  net_loop();
#if USE_MQTT
  mqtt_loop();
#endif
  uint32_t now = millis();

  // โหมดที่ใช้จริง: ตั้งใจ Internet แต่เน็ตหลุด -> fallback เป็น Local อัตโนมัติ (control ยังทำงานเอง)
  active_mode = (desired_mode == APP_INTERNET && net_online()) ? APP_INTERNET : APP_LOCAL;

  // resolve sensor/actuator ids ครั้งเดียวเมื่อมีเน็ต (retry ทุก 10s จนสำเร็จ)
  if (net_online() && !supabase_ids_ready() && now - t_resolve >= 10000) {
    t_resolve = now;
    supabase_resolve_ids();
  }

  // ---- control loop (edge-autonomous ทุก CONTROL_PERIOD_MS ไม่ว่าโหมดไหน/เน็ตมีหรือไม่) ----
  if (now - t_ctrl >= CONTROL_PERIOD_MS) {
    t_ctrl = now;
    SensorSnapshot s; read_sensors(s);
    // อัปเดตแคช interlock ก่อน safety เสมอ — ถ้ารอบนี้ trip control_step จะไม่ถูกเรียก แต่ manual command
    // ที่เข้ามาระหว่างรอบต้องเห็นค่าน้ำ/กอง/อากาศล่าสุด (คำสั่งคนไม่ชนะ safety 100%)
    control_cache_snapshot(s);
    char alert[24];
    bool trip = safety_check(s, control_get_setpoints(), alert, sizeof(alert));
    if (trip) {
      control_set_mode(M_SAFE_HOLD);
      if (strcmp(prev_alert, alert) != 0) {         // post alert ครั้งเดียวต่อการ trip (กัน spam)
        strncpy(prev_alert, alert, sizeof(prev_alert) - 1);
        supabase_post_alert(alert, "critical", "");
      }
    } else {
      if (control_mode() == M_SAFE_HOLD) control_set_mode(M_FRUITING);
      prev_alert[0] = 0;
      control_step(s);
    }

    // คำสั่งจากปุ่ม local web (ถ้ามี) — execute ใน task หลัก (เคารพ interlock)
    char a[16], ac[8]; uint32_t ttl;
    while (local_server_take_command(a, sizeof(a), ac, sizeof(ac), &ttl)) exec_command(a, ac, ttl);

    ActuatorState cur = relays_state();
    persist_events(cur);                        // actuator_events -> Supabase (ทั้ง 2 โหมด)
    local_server_update(s, cur, control_mode()); // อัปเดตหน้าเว็บ Local
    last_snap = s; have_snap = true;
#if USE_MQTT
    mqtt_publish_state(cur);
#endif
  }

  // ---- persist sensor_readings เป็นระยะ (ทั้ง 2 โหมดถ้ามีเน็ต — Supabase = single source of truth) ----
  if (have_snap && net_online() && supabase_ids_ready() && now - t_readings >= READINGS_POST_PERIOD_MS) {
    t_readings = now;
    supabase_post_readings(last_snap);
    char iso[24]; bool ht = net_iso_time(iso, sizeof(iso));
    supabase_update_house_mode(mode_name(control_mode()), ht ? iso : nullptr);
#if USE_MQTT
    mqtt_publish_telemetry(last_snap, control_mode());
#endif
  }

  // ---- โหมด Internet: poll ตาราง commands รับคำสั่ง manual จาก dashboard ----
  if (active_mode == APP_INTERNET && supabase_ids_ready() && now - t_poll >= COMMAND_POLL_PERIOD_MS) {
    t_poll = now;
    supabase_poll_commands(exec_command);
  }

  if (now - t_hb >= HEARTBEAT_PERIOD_MS) {
    t_hb = now;
    Serial.printf("[hb] mode=%s app=%s net=%d ids=%d rssi=%d\n",
                  mode_name(control_mode()), active_mode == APP_INTERNET ? "internet" : "local",
                  net_online(), supabase_ids_ready(), net_rssi());
#if USE_MQTT
    mqtt_publish_heartbeat();
#endif
  }
}
