#include "rom_map.h"
#include "config.h"
#include <Arduino.h>
#include <Preferences.h>
#include <string.h>

static const char *NS = "ds_map";
// คีย์สั้น (NVS key จำกัด 15 ตัวอักษร) — "r0".."r6" เก็บค่า rom hex string ของแต่ละตำแหน่งใน DS_POSITION
static char key_of(int idx) { return (char)('0' + idx); }

void rom_map_begin() {
  // ไม่มีอะไรต้องทำตอน boot — Preferences เปิด/ปิดเป็นราย call (กันค้าง NVS handle)
}

void rom_map_get(int idx, char *out, size_t n) {
  out[0] = 0;
  if (idx < 0 || idx >= DS18B20_COUNT) return;
  Preferences p;
  if (!p.begin(NS, true)) return;
  char key[3] = {'r', key_of(idx), 0};
  String v = p.getString(key, "");
  strncpy(out, v.c_str(), n - 1);
  out[n - 1] = 0;
  p.end();
}

void rom_map_set(int idx, const char *rom) {
  if (idx < 0 || idx >= DS18B20_COUNT) return;
  Preferences p;
  if (!p.begin(NS, false)) return;
  char key[3] = {'r', key_of(idx), 0};
  p.putString(key, rom);
  p.end();
}

int rom_map_find(const char *rom) {
  if (!rom || !rom[0]) return -1;
  for (int i = 0; i < DS18B20_COUNT; i++) {
    char cur[20];
    rom_map_get(i, cur, sizeof(cur));
    if (cur[0] && strcmp(cur, rom) == 0) return i;
  }
  return -1;
}
