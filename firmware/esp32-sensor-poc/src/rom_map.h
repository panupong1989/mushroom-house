#pragma once
#include <stddef.h>

// ผูก ROM address (1-wire, hex 16 ตัวอักษร) ของ DS18B20 แต่ละตัว เข้ากับตำแหน่ง (index ใน
// DS_POSITION ของ config.h) — เก็บถาวรใน NVS ผ่านเครื่องมือ `pio run -e romscan`
void rom_map_begin();

// คืน index (0..DS18B20_COUNT-1) ของตำแหน่งที่ผูกกับ rom นี้ไว้; -1 ถ้ายังไม่เคยผูก
int rom_map_find(const char *rom);

// อ่าน rom ที่ผูกไว้กับตำแหน่ง idx ลง out (out[0]=0 ถ้ายังไม่เคยผูก)
void rom_map_get(int idx, char *out, size_t n);

// ผูกตำแหน่ง idx เข้ากับ rom นี้ (เขียน NVS ทันที)
void rom_map_set(int idx, const char *rom);
