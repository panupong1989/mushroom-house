#include "net.h"
#include "config.h"
#include <WiFi.h>

static uint32_t last_retry = 0;

void net_begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
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
