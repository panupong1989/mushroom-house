#include "supabase_client.h"
#include "net.h"
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

static long ds_id[DS18B20_COUNT];
static long air_id[RS485_COUNT];
static bool ids_ready = false;

// WiFiClientSecure ใช้ setInsecure() (ไม่ pin CA) — เหมือน esp32-controller เดิม
// TODO(CC): pin root CA ของ Supabase ก่อนใช้งานจริงระยะยาว
static WiFiClientSecure secure;

void supabase_begin() {
  secure.setInsecure();
  for (int i = 0; i < DS18B20_COUNT; i++) ds_id[i] = -1;
  for (int i = 0; i < RS485_COUNT; i++) air_id[i] = -1;
}

bool supabase_ids_ready() { return ids_ready; }

static void add_auth_headers(HTTPClient &http) {
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);
  http.addHeader("Content-Type", "application/json");
}

static String rest(const char *path) { return String(SUPABASE_URL) + "/rest/v1/" + path; }

static bool get_json(const String &url, JsonDocument &doc) {
  if (!net_online()) return false;
  HTTPClient http;
  if (!http.begin(secure, url)) return false;
  add_auth_headers(http);
  int code = http.GET();
  bool ok = false;
  if (code >= 200 && code < 300) {
    String payload = http.getString();
    ok = (deserializeJson(doc, payload) == DeserializationError::Ok);
  } else {
    Serial.printf("[supabase] GET %s -> %d\n", url.c_str(), code);
  }
  http.end();
  return ok;
}

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
  JsonDocument doc;
  String url = rest("sensors") + "?house_id=eq." + HOUSE_ID +
               "&kind=in.(air_th,bed_temp,outside_temp)&select=id,kind,address,location";
  if (!get_json(url, doc)) return false;

  for (JsonObject o : doc.as<JsonArray>()) {
    long id = o["id"] | -1;
    const char *kind = o["kind"] | "";
    const char *address = o["address"] | "";
    const char *location = o["location"] | "";
    if (id < 0) continue;
    if (!strcmp(kind, "air_th")) {
      for (int i = 0; i < RS485_COUNT; i++) if (!strcmp(location, RS485_LOC[i])) air_id[i] = id;
    } else {
      for (int i = 0; i < DS18B20_COUNT; i++)
        if (!strcmp(kind, DS_KIND[i]) && !strcmp(address, DS_POSITION[i])) ds_id[i] = id;
    }
  }

  ids_ready = false;
  for (int i = 0; i < DS18B20_COUNT && !ids_ready; i++) if (ds_id[i] >= 0) ids_ready = true;
  for (int i = 0; i < RS485_COUNT && !ids_ready; i++) if (air_id[i] >= 0) ids_ready = true;
  if (!ids_ready) Serial.println("[supabase] resolve ids ไม่ได้เลย — เช็ค seed sensors/house_id/005 migration");
  return ids_ready;
}

static void add_reading(JsonArray arr, long sensor_id, const char *metric, float value) {
  if (sensor_id < 0 || isnan(value)) return;
  JsonObject o = arr.add<JsonObject>();
  o["house_id"] = HOUSE_ID;
  o["sensor_id"] = sensor_id;
  o["metric"] = metric;
  o["value"] = value;
}

bool supabase_post_readings(const DsReading ds[DS18B20_COUNT], const AirReading air[RS485_COUNT]) {
  if (!ids_ready) return false;
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < DS18B20_COUNT; i++) if (ds[i].ok) add_reading(arr, ds_id[i], "temp", ds[i].temp);
  for (int i = 0; i < RS485_COUNT; i++) {
    if (!air[i].ok) continue;
    add_reading(arr, air_id[i], "temp", air[i].temp);
    add_reading(arr, air_id[i], "rh", air[i].rh);
  }
  if (arr.size() == 0) return false;
  String body;
  serializeJson(doc, body);
  return post_body("sensor_readings", body);
}
