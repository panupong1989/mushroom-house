#include "local_server.h"
#include "config.h"
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <string.h>
#include <math.h>

static AsyncWebServer server(LOCAL_HTTP_PORT);

// snapshot ล่าสุด (เขียนจาก loop หลัก, อ่านจาก async task) — กันด้วย spinlock
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
static SensorSnapshot g_snap;
static ActuatorState g_act;
static Mode g_mode = M_BOOT;
static bool g_have = false;

// ring buffer คำสั่งจากปุ่ม (เขียนจาก async task, อ่าน/ดึงจาก loop หลัก)
struct Cmd { char actuator[16]; char action[8]; uint32_t ttl; };
static Cmd ring[8];
static volatile uint8_t r_head = 0, r_tail = 0;

static void enqueue(const char *actuator, const char *action, uint32_t ttl) {
  portENTER_CRITICAL(&mux);
  uint8_t next = (uint8_t)((r_head + 1) % 8);
  if (next != r_tail) {   // ไม่เต็ม
    strncpy(ring[r_head].actuator, actuator, sizeof(ring[r_head].actuator) - 1);
    ring[r_head].actuator[sizeof(ring[r_head].actuator) - 1] = 0;
    strncpy(ring[r_head].action, action, sizeof(ring[r_head].action) - 1);
    ring[r_head].action[sizeof(ring[r_head].action) - 1] = 0;
    ring[r_head].ttl = ttl;
    r_head = next;
  }
  portEXIT_CRITICAL(&mux);
}

bool local_server_take_command(char *actuator, size_t na, char *action, size_t naa, uint32_t *ttl_sec) {
  bool got = false;
  portENTER_CRITICAL(&mux);
  if (r_tail != r_head) {
    strncpy(actuator, ring[r_tail].actuator, na - 1); actuator[na - 1] = 0;
    strncpy(action, ring[r_tail].action, naa - 1); action[naa - 1] = 0;
    *ttl_sec = ring[r_tail].ttl;
    r_tail = (uint8_t)((r_tail + 1) % 8);
    got = true;
  }
  portEXIT_CRITICAL(&mux);
  return got;
}

void local_server_update(const SensorSnapshot &s, const ActuatorState &a, Mode fsm_mode) {
  portENTER_CRITICAL(&mux);
  g_snap = s; g_act = a; g_mode = fsm_mode; g_have = true;
  portEXIT_CRITICAL(&mux);
}

static const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html><html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>โรงเห็ดฟาง — Local</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f4;color:#1c1917}
.wrap{max-width:520px;margin:0 auto;padding:16px}
h1{font-size:18px}.mode{font-size:12px;color:#78716c}
.card{background:#fff;border-radius:12px;padding:12px;margin:10px 0;box-shadow:0 1px 3px #0001}
.g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center}
.g div p{margin:2px}.k{font-size:11px;color:#78716c}.v{font-size:18px;font-weight:700}
.row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.name{font-weight:600}.st{font-size:12px;padding:2px 8px;border-radius:10px}
.on{background:#dcfce7;color:#166534}.off{background:#f1f5f9;color:#64748b}
button{border:0;border-radius:8px;padding:6px 10px;margin-left:4px;font-size:13px;cursor:pointer}
.bon{background:#22c55e;color:#fff}.boff{background:#ef4444;color:#fff}.bau{background:#e7e5e4}
</style></head><body><div class="wrap">
<h1>โรงเห็ดฟาง 01 · <span class="mode" id="mode"></span></h1>
<div class="card"><div class="k">อุณหภูมิอากาศ (คุม=max) · RH · กองสูงสุด</div>
<div class="g"><div><p class="k">อากาศ</p><p class="v" id="at">–</p></div>
<div><p class="k">ความชื้น</p><p class="v" id="rh">–</p></div>
<div><p class="k">กอง</p><p class="v" id="bt">–</p></div></div>
<p class="k" id="water"></p></div>
<div class="card" id="acts"></div>
<p class="k">คำสั่งจากหน้านี้เคารพ interlock เหล็กเสมอ (เช่น ห้ามพ่นหมอกตอนอากาศเย็น)</p>
</div><script>
const KIND=[["mist","ปั๊มพ่นหมอก"],["heater","ฮีทเตอร์"],["exhaust","พัดลมดูด"],["light","หลอดไฟ"],["circulation","พัดลมหมุนเวียน"]];
const MODE={0:"BOOT",1:"SELFTEST",2:"AUTO·เดินเชื้อ",3:"AUTO·ออกดอก",4:"MANUAL",5:"SAFE_HOLD"};
function cmd(a,ac){fetch(`/api/cmd?actuator=${a}&action=${ac}&ttl=3600`,{method:"POST"}).then(load)}
async function load(){try{const r=await fetch("/api/state");const d=await r.json();
document.getElementById("mode").textContent=MODE[d.mode]||d.mode;
document.getElementById("at").textContent=d.air_temp==null?"–":d.air_temp.toFixed(1)+"°";
document.getElementById("rh").textContent=d.air_rh==null?"–":d.air_rh.toFixed(0)+"%";
document.getElementById("bt").textContent=d.bed_max==null?"–":d.bed_max.toFixed(1)+"°";
document.getElementById("water").textContent="ระดับน้ำ: "+(d.water_ok?"ปกติ":"ต่ำ (ล็อกปั๊ม)");
let h="";for(const[k,name]of KIND){const on=d.act[k];
h+=`<div class="row"><span class="name">${name}</span><span><span class="st ${on?'on':'off'}">${on?'ON':'OFF'}</span>
<button class="bon" onclick="cmd('${k}','on')">เปิด</button>
<button class="boff" onclick="cmd('${k}','off')">ปิด</button>
<button class="bau" onclick="cmd('${k}','auto')">AUTO</button></span></div>`}
document.getElementById("acts").innerHTML=h;}catch(e){}}
load();setInterval(load,2000);
</script></body></html>)HTML";

static void handle_state(AsyncWebServerRequest *req) {
  SensorSnapshot s; ActuatorState a; Mode m; bool have;
  portENTER_CRITICAL(&mux);
  s = g_snap; a = g_act; m = g_mode; have = g_have;
  portEXIT_CRITICAL(&mux);

  JsonDocument doc;
  doc["mode"] = (int)m;
  doc["have"] = have;
  if (have && !isnan(s.air_temp_ctrl)) doc["air_temp"] = s.air_temp_ctrl; else doc["air_temp"] = nullptr;
  if (have && !isnan(s.air_rh_ctrl)) doc["air_rh"] = s.air_rh_ctrl; else doc["air_rh"] = nullptr;
  if (have && !isnan(s.bed_temp_max)) doc["bed_max"] = s.bed_temp_max; else doc["bed_max"] = nullptr;
  doc["water_ok"] = s.water_ok;
  JsonObject act = doc["act"].to<JsonObject>();
  act["mist"] = a.mist; act["heater"] = a.heater; act["exhaust"] = a.exhaust;
  act["light"] = a.light; act["circulation"] = a.circulation;

  String out; serializeJson(doc, out);
  req->send(200, "application/json", out);
}

static void handle_cmd(AsyncWebServerRequest *req) {
  const AsyncWebParameter *pa = req->getParam("actuator");
  const AsyncWebParameter *pc = req->getParam("action");
  const AsyncWebParameter *pt = req->getParam("ttl");
  if (!pa || !pc) { req->send(400, "application/json", "{\"ok\":false,\"err\":\"missing param\"}"); return; }
  uint32_t ttl = pt ? (uint32_t)pt->value().toInt() : 3600UL;
  enqueue(pa->value().c_str(), pc->value().c_str(), ttl);
  req->send(200, "application/json", "{\"ok\":true}");
}

void local_server_begin() {
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *req) { req->send(200, "text/html", INDEX_HTML); });
  server.on("/api/state", HTTP_GET, handle_state);
  server.on("/api/cmd", HTTP_POST, handle_cmd);
  server.onNotFound([](AsyncWebServerRequest *req) { req->send(404, "text/plain", "not found"); });
  server.begin();
}
