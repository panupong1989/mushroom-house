#pragma once
#include <stdint.h>
#include <stddef.h>

// จัดการ WiFi + เวลา (NTP) — ใช้ร่วมทั้งโหมด Internet และ Local
void net_begin();                 // เริ่มเชื่อม WiFi (non-blocking) + ตั้ง NTP
bool net_online();                // WiFi connected อยู่ไหม
void net_loop();                  // เรียกใน loop() — คอย reconnect + sync เวลา
int8_t net_rssi();

// เวลา ISO8601 UTC (เช่น "2026-07-09T08:09:03Z") ลง out — คืน false ถ้า NTP ยังไม่ sync
bool net_iso_time(char *out, size_t n);
