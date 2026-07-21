#pragma once
#include "types.h"
#include "config.h"

void onewire_multi_begin();

// จำนวนตัวที่เจอบนบัสจริงตอนนี้ (<= DS18B20_COUNT)
int onewire_multi_bus_count();

// อ่าน ROM + อุณหภูมิของตัวที่ index i บนบัส (0..onewire_multi_bus_count()-1); คืน false ถ้าอ่านไม่ได้
bool onewire_multi_read_at(int bus_idx, char *rom_out, size_t rom_n, float &temp);

// อ่านทุกตัวบนบัส แล้ว map เข้า out[DS18B20_COUNT] ตาม pos_idx จาก rom_map (ตัวที่ไม่เคยผูก/ไม่เจอ -> ok=false)
void onewire_multi_read(DsReading out[DS18B20_COUNT]);
