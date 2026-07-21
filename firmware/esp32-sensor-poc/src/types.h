#pragma once
#include <Arduino.h>

// pos_idx = index ใน DS_POSITION/DS_KIND (config.h) ที่ผูกกับ ROM นี้ (-1 = ยังไม่ผูก/ไม่รู้จัก)
struct DsReading { char rom[20]; float temp; bool ok; int pos_idx; };

struct AirReading { uint8_t addr; float temp; float rh; bool ok; };
