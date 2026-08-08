#include "supabase.h"
#include "config.h"
#include "net.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

// --- id maps (resolve ครั้งเดียวตอน boot) ---
static long air_id[3]  = {-1, -1, -1};
static long bed_id[3]  = {-1, -1, -1};
static long water_id   = -1;
struct ActMap { const char *kind; long id; };
static ActMap act_id[5] = {
  {"mist", -1}, {"heater", -1}, {"exhaust", -1}, {"light", -1}, {"circulation", -1},
};
static bool ids_ready = false;

// WiFiClientSecure ใช้ setInsecure() ใน v1 (ไม่ pin CA) — TODO(CC): pin root CA ของ Supabase
static WiFiClientSecure secure;

void supabase_begin() { secure.setInsecure(); }
bool supabase_ids_ready() { return ids_ready; }

static void add_auth_headers(HTTPClient &http) {
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");
}

// สร้าง URL: <SUPABASE_URL>/rest/v1/<path>
static String rest(const char *path) { return String(SUPABASE_URL) + "/rest/v1/" + path; }

// ---- GET + deserialize เข้า doc ; คืน true ถ้า HTTP 2xx และ parse ได้ ----
static bool get_json(const String &url, JsonDocument &doc) {
  if (!net_online()) return false;
  HTTPClient http;
  if (!http.begin(secure, url)) return false;
  http.setConnectTimeout(5000);   // กัน TLS handshake ค้างยาวบนเน็ตช้า → watchdog
  http.setTimeout(8000);
  add_auth_headers(http);
  int code = http.GET();
  bool ok = false;
  if (code >= 200 && code < 300) {
    String payload = http.getString();   // อ่าน body ทั้งก้อนก่อน parse — ทนกว่าอ่าน stream ตรงๆ บน TLS
    ok = (deserializeJson(doc, payload) == DeserializationError::Ok);
  } else {
    Serial.printf("[supabase] GET %s -> %d\n", url.c_str(), code);
  }
  http.end();
  return ok;
}

// ---- POST body (return=minimal) ; คืน true ถ้า 2xx ----
static bool post_body(const char *path, const String &body) {
  if (!net_online()) return false;
  HTTPClient http;
  if (!http.begin(secure, rest(path))) return false;
  http.setConnectTimeout(5000);
  http.setTimeout(8000);
  add_auth_headers(http);
  http.addHeader("Prefer", "return=minimal");
  int code = http.POST(body);
  if (code < 200 || code >= 300) Serial.printf("[supabase] POST %s -> %d\n", path, code);
  http.end();
  return code >= 200 && code < 300;
}

bool supabase_resolve_ids() {
  if (!net_online()) return false;

  // sensors: air_th ผูกด้วย address = modbus addr (คงที่ตามฮาร์ดแวร์) ไม่ใช่ location —
  // location เป็นตำแหน่งที่ผู้ใช้แก้ได้เองจากหน้าเว็บ (supabase/migrations/011) ถ้า resolve
  // ด้วย location เหมือนเดิม พอผู้ใช้ย้ายตำแหน่งจะยิงค่าเข้าผิดตัวทันที
  // bed_temp/water_level ยังใช้ location เดิม (bed จริงผูกด้วย rom_id — ดู supabase_fetch_rom_map)
  {
    JsonDocument doc;
    String url = rest("sensors") + "?house_id=eq." + HOUSE_ID + "&select=id,kind,location,address";
    if (!get_json(url, doc)) return false;
    for (JsonObject o : doc.as<JsonArray>()) {
      long id = o["id"] | -1;
      const char *kind = o["kind"] | "";
      const char *loc = o["location"] | "";
      const char *addr = o["address"] | "";
      if (!strcmp(kind, "air_th")) {
        for (int i = 0; i < 3; i++) {
          char want[8];
          snprintf(want, sizeof(want), "%u", (unsigned)RS485_ADDR[i]);
          if (!strcmp(addr, want)) air_id[i] = id;
        }
      } else if (!strcmp(kind, "bed_temp")) {
        for (int i = 0; i < 3; i++) if (!strcmp(loc, SENSOR_LOC[i])) bed_id[i] = id;
      } else if (!strcmp(kind, "water_level")) {
        water_id = id;
      }
    }
  }
  // actuators: map ตาม kind
  {
    JsonDocument doc;
    String url = rest("actuators") + "?house_id=eq." + HOUSE_ID + "&select=id,kind";
    if (!get_json(url, doc)) return false;
    for (JsonObject o : doc.as<JsonArray>()) {
      long id = o["id"] | -1;
      const char *kind = o["kind"] | "";
      for (auto &a : act_id) if (!strcmp(kind, a.kind)) a.id = id;
    }
  }
  ids_ready = (air_id[0] >= 0);   // อย่างน้อยต้อง resolve air ได้ (ตัวคุมหลัก)
  if (!ids_ready) Serial.println("[supabase] resolve ids ไม่ครบ — เช็ค seed/house_id");
  return ids_ready;
}

static long actuator_id_of(const char *kind) {
  for (auto &a : act_id) if (!strcmp(kind, a.kind)) return a.id;
  return -1;
}

static void add_reading(JsonArray arr, long sensor_id, const char *metric, float value) {
  if (sensor_id < 0 || isnan(value)) return;
  JsonObject o = arr.add<JsonObject>();
  o["house_id"] = HOUSE_ID;
  o["sensor_id"] = sensor_id;
  o["metric"] = metric;
  o["value"] = value;
}

// --- rom map (rom -> sensor_id + is_outside) จากตาราง sensors.rom_id ที่จับคู่ในหน้า Maintenance ---
struct RomMap { char rom[17]; long sensor_id; bool is_outside; };
static RomMap rom_map[16];
static int rom_map_n = 0;

bool supabase_fetch_rom_map() {
  if (!net_online()) return false;
  JsonDocument doc;
  String url = rest("sensors") + "?house_id=eq." + HOUSE_ID + "&rom_id=not.is.null&select=id,rom_id,kind";
  if (!get_json(url, doc)) return false;
  int n = 0;
  for (JsonObject o : doc.as<JsonArray>()) {
    if (n >= 16) break;
    const char *rom = o["rom_id"] | "";
    if (!*rom) continue;
    strncpy(rom_map[n].rom, rom, sizeof(rom_map[n].rom) - 1);
    rom_map[n].rom[sizeof(rom_map[n].rom) - 1] = 0;
    rom_map[n].sensor_id = o["id"] | -1;
    rom_map[n].is_outside = !strcmp(o["kind"] | "", "outside_temp");
    n++;
  }
  rom_map_n = n;
  return true;
}

long supabase_sensor_id_for_rom(const char *rom) {
  for (int i = 0; i < rom_map_n; i++) if (!strcmp(rom_map[i].rom, rom)) return rom_map[i].sensor_id;
  return -1;
}

bool supabase_rom_is_outside(const char *rom) {
  for (int i = 0; i < rom_map_n; i++) if (!strcmp(rom_map[i].rom, rom)) return rom_map[i].is_outside;
  return false;   // ไม่รู้จัก = นับเป็นกอง (fail-safe: รวมใน bed_temp_max)
}

bool supabase_post_readings(const SensorSnapshot &s) {
  if (!ids_ready) return false;
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < 3; i++) {
    if (!s.air[i].ok) continue;
    add_reading(arr, air_id[i], "temp", s.air[i].temp);
    add_reading(arr, air_id[i], "rh", s.air[i].rh);
  }
  // DS18B20 ทุกตัว: โพสต์เข้า sensor_id ที่จับคู่ rom ไว้ (ทั้งกอง 6 จุด + นอกโรง) — ข้ามตัวที่ยังไม่ map
  for (int i = 0; i < s.ds_n; i++) {
    if (!s.ds[i].ok) continue;
    long sid = supabase_sensor_id_for_rom(s.ds[i].rom);
    if (sid >= 0) add_reading(arr, sid, "temp", s.ds[i].temp);
  }
  add_reading(arr, water_id, "level", s.water_ok ? 1.0f : 0.0f);
  if (arr.size() == 0) return false;
  String body;
  serializeJson(doc, body);
  return post_body("sensor_readings", body);
}

bool supabase_post_event(const char *actuator_kind, bool state, const char *reason, const char *source) {
  if (!ids_ready) return false;
  long aid = actuator_id_of(actuator_kind);
  if (aid < 0) return false;
  JsonDocument doc;
  JsonObject o = doc.to<JsonObject>();
  o["house_id"] = HOUSE_ID;
  o["actuator_id"] = aid;
  o["state"] = state;
  o["reason"] = reason;
  o["source"] = source;   // 'auto' | 'manual' | 'safety' (CHECK ใน DB)
  String body;
  serializeJson(doc, body);
  return post_body("actuator_events", body);
}

bool supabase_post_alert(const char *code, const char *severity, const char *message) {
  JsonDocument doc;
  JsonObject o = doc.to<JsonObject>();
  o["house_id"] = HOUSE_ID;
  o["severity"] = severity;   // 'info' | 'warn' | 'critical'
  o["code"] = code;
  o["message"] = message;
  String body;
  serializeJson(doc, body);
  return post_body("alerts", body);
}

bool supabase_post_bed_scan(const char roms[][17], const float temps[], int n) {
  if (!net_online() || n <= 0) return false;
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  char iso[24];
  bool have_time = net_iso_time(iso, sizeof(iso));   // updated_at ต้อง set เอง (upsert ไม่ trigger default now())
  for (int i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["house_id"] = HOUSE_ID;
    o["rom_id"] = roms[i];
    if (isnan(temps[i])) o["temp_c"] = nullptr; else o["temp_c"] = temps[i];
    if (have_time) o["updated_at"] = iso;
  }
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  if (!http.begin(secure, rest("bed_scan") + "?on_conflict=house_id,rom_id")) return false;
  add_auth_headers(http);
  http.addHeader("Prefer", "resolution=merge-duplicates,return=minimal");   // upsert
  int code = http.POST(body);
  if (code < 200 || code >= 300) Serial.printf("[supabase] POST bed_scan -> %d\n", code);
  http.end();
  return code >= 200 && code < 300;
}

// --- alert_config cache (เปิด/ปิด + ค่าเกณฑ์ต่อ code — supabase/migrations/008,009) ---
struct AlertCfg { char code[24]; bool enabled; float threshold; };
static AlertCfg alert_cfg[8];
static int alert_cfg_n = 0;

bool supabase_fetch_alert_config() {
  if (!net_online()) return false;
  JsonDocument doc;
  String url = rest("alert_config") + "?house_id=eq." + HOUSE_ID + "&select=code,enabled,threshold";
  if (!get_json(url, doc)) return false;
  int n = 0;
  for (JsonObject o : doc.as<JsonArray>()) {
    if (n >= 8) break;
    const char *code = o["code"] | "";
    strncpy(alert_cfg[n].code, code, sizeof(alert_cfg[n].code) - 1);
    alert_cfg[n].code[sizeof(alert_cfg[n].code) - 1] = 0;
    alert_cfg[n].enabled = o["enabled"] | true;
    alert_cfg[n].threshold = o["threshold"].isNull() ? NAN : (float)(o["threshold"] | 0.0);
    n++;
  }
  alert_cfg_n = n;
  return true;
}

bool supabase_alert_enabled(const char *code) {
  for (int i = 0; i < alert_cfg_n; i++) if (!strcmp(alert_cfg[i].code, code)) return alert_cfg[i].enabled;
  return true;   // ไม่รู้จัก/ยังไม่โหลด = แจ้งเตือน (fail-safe: ไม่พลาด alert)
}

float supabase_alert_threshold(const char *code) {
  for (int i = 0; i < alert_cfg_n; i++) if (!strcmp(alert_cfg[i].code, code)) return alert_cfg[i].threshold;
  return NAN;   // ไม่รู้จัก/ยังไม่โหลด — ให้ caller fallback เป็น setpoint
}

bool supabase_update_house_mode(const char *mode, const char *iso_or_null) {
  if (!net_online()) return false;
  HTTPClient http;
  String url = rest("houses") + "?id=eq." + HOUSE_ID;
  if (!http.begin(secure, url)) return false;
  add_auth_headers(http);
  http.addHeader("Prefer", "return=minimal");
  JsonDocument doc;
  JsonObject o = doc.to<JsonObject>();
  o["last_mode"] = mode;
  if (iso_or_null && *iso_or_null) o["last_mode_ts"] = iso_or_null;
  String body; serializeJson(doc, body);
  int code = http.sendRequest("PATCH", body);
  http.end();
  return code >= 200 && code < 300;
}

int supabase_poll_commands(CommandExec exec) {
  if (!net_online()) return -1;
  JsonDocument doc;
  String url = rest("commands") + "?house_id=eq." + HOUSE_ID +
               "&acked_at=is.null&order=ts.asc&select=id,actuator,action,ttl_sec";
  if (!get_json(url, doc)) return -1;

  char iso[24];
  bool have_time = net_iso_time(iso, sizeof(iso));
  int n = 0;
  for (JsonObject o : doc.as<JsonArray>()) {
    long id = o["id"] | -1;
    const char *actuator = o["actuator"] | "";
    const char *action = o["action"] | "";
    uint32_t ttl = o["ttl_sec"] | 300UL;
    if (id < 0 || !*actuator || !*action) continue;

    if (exec) exec(actuator, action, ttl);   // execute (เคารพ interlock ใน control_fsm)

    // ack: set acked_at (ต้องมีเวลา NTP) — ถ้าไม่มีเวลา ปล่อยไว้ให้ poll รอบหน้า (กัน ack ผิดเวลา)
    if (have_time) {
      HTTPClient http;
      String purl = rest("commands") + "?id=eq." + String(id);
      if (http.begin(secure, purl)) {
        add_auth_headers(http);
        http.addHeader("Prefer", "return=minimal");
        String body = String("{\"acked_at\":\"") + iso + "\"}";
        int code = http.sendRequest("PATCH", body);
        if (code < 200 || code >= 300) Serial.printf("[supabase] ack cmd %ld -> %d\n", id, code);
        http.end();
      }
    }
    n++;
  }
  return n;
}
