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
  add_auth_headers(http);
  http.addHeader("Prefer", "return=minimal");
  int code = http.POST(body);
  if (code < 200 || code >= 300) Serial.printf("[supabase] POST %s -> %d\n", path, code);
  http.end();
  return code >= 200 && code < 300;
}

bool supabase_resolve_ids() {
  if (!net_online()) return false;

  // sensors: map ตาม (kind, location) — ตรงกับ seed ใน supabase/migrations/001_init.sql
  {
    JsonDocument doc;
    String url = rest("sensors") + "?house_id=eq." + HOUSE_ID + "&select=id,kind,location";
    if (!get_json(url, doc)) return false;
    for (JsonObject o : doc.as<JsonArray>()) {
      long id = o["id"] | -1;
      const char *kind = o["kind"] | "";
      const char *loc = o["location"] | "";
      if (!strcmp(kind, "air_th")) {
        for (int i = 0; i < 3; i++) if (!strcmp(loc, SENSOR_LOC[i])) air_id[i] = id;
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

bool supabase_post_readings(const SensorSnapshot &s) {
  if (!ids_ready) return false;
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < 3; i++) {
    if (!s.air[i].ok) continue;
    add_reading(arr, air_id[i], "temp", s.air[i].temp);
    add_reading(arr, air_id[i], "rh", s.air[i].rh);
  }
  for (int i = 0; i < 3; i++) if (s.bed[i].ok) add_reading(arr, bed_id[i], "temp", s.bed[i].temp);
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
