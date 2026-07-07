#pragma once
#include <stdint.h>
// ---------- Identity ----------
#define HOUSE_ID        "house-01"
#define FW_VERSION      "0.1.0"

// ---------- WiFi / MQTT ----------
#define WIFI_SSID       "CHANGEME"
#define WIFI_PASS       "CHANGEME"
#define MQTT_HOST       "192.168.1.10"
#define MQTT_PORT       1883
#define MQTT_BASE       "mush"      // -> mush/house-01/...

// ---------- RS485 (Modbus RTU) ----------
#define RS485_RX_PIN    16
#define RS485_TX_PIN    17
#define RS485_DE_RE_PIN 4          // -1 if auto-direction board
#define RS485_BAUD      9600
static const uint8_t RS485_ADDR[3] = {1, 2, 3};   // head, mid, tail

// ---------- 1-wire (DS18B20 x3) ----------
#define ONEWIRE_PIN     15

// ---------- Float switch ----------
#define FLOAT_PIN       34         // input, LOW = water low (adjust to wiring)

// ---------- Relay channels (active-high; use fail-safe module) ----------
#define RELAY_MIST        25
#define RELAY_HEATER      26
#define RELAY_EXHAUST     27
#define RELAY_LIGHT       32
#define RELAY_CIRCULATION 33

// ---------- Setpoints (defaults; override via MQTT cmd/config -> NVS) ----------
struct Setpoints {
  float temp_heater_on   = 27.5f;
  float temp_heater_off  = 29.5f;
  float temp_exhaust_on  = 33.0f;
  float temp_exhaust_off = 31.0f;
  float temp_floor       = 27.0f;
  float temp_danger_hot  = 38.0f;
  float rh_min           = 85.0f;
  float rh_max           = 90.0f;
  float rh_high          = 92.0f;
  float bed_danger       = 40.0f;
  uint32_t vent_period_ms   = 120UL*60*1000;
  uint32_t vent_duration_ms = 10UL*60*1000;
  uint32_t mist_burst_ms    = 20UL*1000;
  uint32_t mist_gap_ms      = 180UL*1000;
  uint8_t  light_on_hour    = 6;
  uint8_t  light_off_hour   = 18;
};

// ---------- Telemetry ----------
#define TELEMETRY_PERIOD_MS 15000
#define CONTROL_PERIOD_MS   2000
