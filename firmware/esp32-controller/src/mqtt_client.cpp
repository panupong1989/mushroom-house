// LEGACY MQTT — ปิดโดย default (โหมดใหม่ใช้ Supabase REST + local web server ดู main.cpp)
// เปิดใหม่ได้ด้วย build flag -DUSE_MQTT=1 (+ เพิ่ม knolleary/PubSubClient กลับใน platformio.ini)
#include "config.h"
#if USE_MQTT
#include "mqtt_client.h"
#include "control_fsm.h"
#include "nvs_store.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <string.h>

static WiFiClient wifi;
static PubSubClient mqtt(wifi);
static char base[48];

static void topic(char*out,size_t n,const char*suffix){ snprintf(out,n,"%s/%s/%s",MQTT_BASE,HOUSE_ID,suffix); }

static bool topic_is(const char *t, const char *suffix){
  char full[64]; topic(full,sizeof(full),suffix);
  return strcmp(t, full)==0;
}

// {actuator, action, ttl_sec} -> manual override มี TTL (หมดเวลากลับ AUTO)
static void handle_cmd_actuator(byte *payload, unsigned int len){
  StaticJsonDocument<192> d;
  if (deserializeJson(d, payload, len)) return;
  const char *actuator = d["actuator"] | "";
  const char *action   = d["action"] | "";
  uint32_t ttl_sec = d["ttl_sec"] | 300UL;
  if (!*actuator || !*action) return;
  control_manual_set(actuator, action, ttl_sec);
}

// {key:value,...} -> อัปเดต Setpoints + เก็บลง NVS
static void handle_cmd_config(byte *payload, unsigned int len){
  StaticJsonDocument<384> d;
  if (deserializeJson(d, payload, len)) return;
  for (JsonPair kv : d.as<JsonObject>()) control_set_setpoint(kv.key().c_str(), kv.value().as<float>());
  nvs_save_setpoints(control_get_setpoints());
}

// {profile:"fruiting"|"spawn_run"} -> สลับ SPAWN_RUN/FRUITING
static void handle_cmd_profile(byte *payload, unsigned int len){
  StaticJsonDocument<96> d;
  if (deserializeJson(d, payload, len)) return;
  const char *profile = d["profile"] | "";
  if      (!strcmp(profile,"fruiting"))  control_set_mode(M_FRUITING);
  else if (!strcmp(profile,"spawn_run")) control_set_mode(M_SPAWN_RUN);
}

static void onMsg(char* t, byte* payload, unsigned int len){
  if      (topic_is(t,"cmd/actuator")) handle_cmd_actuator(payload,len);
  else if (topic_is(t,"cmd/config"))   handle_cmd_config(payload,len);
  else if (topic_is(t,"cmd/profile"))  handle_cmd_profile(payload,len);
}

static void reconnect(){
  while(!mqtt.connected()){
    String cid = String("esp-")+HOUSE_ID;
    if (mqtt.connect(cid.c_str())){
      char t[64];
      topic(t,sizeof(t),"cmd/#"); mqtt.subscribe(t);
    } else delay(2000);
  }
}

void mqtt_begin(){
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  snprintf(base,sizeof(base),"%s/%s",MQTT_BASE,HOUSE_ID);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMsg);
}
void mqtt_loop(){ if(WiFi.status()==WL_CONNECTED){ if(!mqtt.connected()) reconnect(); mqtt.loop(); } }

void mqtt_publish_telemetry(const SensorSnapshot &s, Mode mode){
  StaticJsonDocument<512> d;
  d["ts"]=s.ts; d["mode"]=(int)mode; d["water_ok"]=s.water_ok;
  d["air_temp"]=s.air_temp_ctrl; d["air_rh"]=s.air_rh_ctrl; d["bed_max"]=s.bed_temp_max;
  JsonArray air=d.createNestedArray("air");
  for(int i=0;i<3;i++){ JsonObject o=air.createNestedObject(); o["addr"]=s.air[i].addr; o["t"]=s.air[i].temp; o["rh"]=s.air[i].rh; o["ok"]=s.air[i].ok; }
  char buf[512]; size_t nn=serializeJson(d,buf); char t[64]; topic(t,sizeof(t),"telemetry"); mqtt.publish(t,(uint8_t*)buf,nn,false);
}
void mqtt_publish_state(const ActuatorState &a){
  StaticJsonDocument<192> d; d["mist"]=a.mist;d["heater"]=a.heater;d["exhaust"]=a.exhaust;d["light"]=a.light;d["circulation"]=a.circulation;
  char buf[192]; size_t nn=serializeJson(d,buf); char t[64]; topic(t,sizeof(t),"actuator/state"); mqtt.publish(t,(uint8_t*)buf,nn,false);
}
void mqtt_publish_alert(const char*code,const char*sev,const char*msg){
  StaticJsonDocument<192> d; d["code"]=code;d["severity"]=sev;d["message"]=msg;
  char buf[192]; size_t nn=serializeJson(d,buf); char t[64]; topic(t,sizeof(t),"alert"); mqtt.publish(t,(uint8_t*)buf,nn,false);
}
void mqtt_publish_heartbeat(){
  StaticJsonDocument<128> d; d["uptime"]=millis()/1000; d["rssi"]=WiFi.RSSI(); d["fw"]=FW_VERSION;
  char buf[128]; size_t nn=serializeJson(d,buf); char t[64]; topic(t,sizeof(t),"heartbeat"); mqtt.publish(t,(uint8_t*)buf,nn,true);
}
#endif // USE_MQTT
