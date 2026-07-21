#pragma once
#include <stdint.h>

void net_begin();      // เริ่มเชื่อม WiFi (non-blocking)
bool net_online();     // WiFi connected อยู่ไหม
void net_loop();       // เรียกใน loop() — คอย reconnect
int8_t net_rssi();
