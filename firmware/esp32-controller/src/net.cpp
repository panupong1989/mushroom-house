#include "net.h"
#include "config.h"
#include <WiFi.h>
#include <time.h>

static uint32_t last_retry = 0;
static bool ntp_started = false;

void net_begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  // NTP — ต้องมีเวลาจริงเพื่อเขียน commands.acked_at เป็น ISO8601 (sensor_readings.ts ใช้ default now() ฝั่ง DB ได้)
  configTime(0, 0, "pool.ntp.org", "time.google.com");   // UTC (tz offset 0)
  ntp_started = true;
}

bool net_online() { return WiFi.status() == WL_CONNECTED; }

void net_loop() {
  if (net_online()) return;
  uint32_t now = millis();
  if (now - last_retry >= 5000) {   // กัน spam — ลอง reconnect ทุก 5s
    last_retry = now;
    WiFi.reconnect();
  }
}

int8_t net_rssi() { return net_online() ? (int8_t)WiFi.RSSI() : 0; }

bool net_iso_time(char *out, size_t n) {
  if (!ntp_started) return false;
  time_t t = time(nullptr);
  if (t < 1700000000) return false;   // < ปี 2023 = NTP ยังไม่ sync
  struct tm tmv;
  gmtime_r(&t, &tmv);
  strftime(out, n, "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return true;
}
