#include "onewire_multi.h"
#include "rom_map.h"
#include <OneWire.h>
#include <DallasTemperature.h>
#include <string.h>

static OneWire oneWire(ONEWIRE_PIN);
static DallasTemperature sensors(&oneWire);

static void rom_to_str(const DeviceAddress addr, char *out, size_t n) {
  snprintf(out, n, "%02X%02X%02X%02X%02X%02X%02X%02X",
           addr[0], addr[1], addr[2], addr[3], addr[4], addr[5], addr[6], addr[7]);
}

void onewire_multi_begin() {
  sensors.begin();
  sensors.setWaitForConversion(true);
}

int onewire_multi_bus_count() {
  int n = sensors.getDeviceCount();
  return n > DS18B20_COUNT ? DS18B20_COUNT : n;
}

bool onewire_multi_read_at(int bus_idx, char *rom_out, size_t rom_n, float &temp) {
  DeviceAddress addr;
  if (!sensors.getAddress(addr, bus_idx)) return false;
  rom_to_str(addr, rom_out, rom_n);
  float t = sensors.getTempC(addr);
  if (t == DEVICE_DISCONNECTED_C) return false;
  temp = t;
  return true;
}

void onewire_multi_read(DsReading out[DS18B20_COUNT]) {
  for (int i = 0; i < DS18B20_COUNT; i++) { out[i].ok = false; out[i].pos_idx = -1; out[i].rom[0] = 0; }
  sensors.requestTemperatures();
  int n = onewire_multi_bus_count();
  for (int i = 0; i < n; i++) {
    char rom[20]; float t;
    if (!onewire_multi_read_at(i, rom, sizeof(rom), t)) continue;
    int pos = rom_map_find(rom);
    if (pos < 0) {
      Serial.printf("[onewire] rom %s ยังไม่ผูกตำแหน่ง (ใช้ env romscan เพื่อ map)\n", rom);
      continue;   // ยังไม่ผูกตำแหน่ง -> ข้าม (ไม่รู้จะ post ลง sensor ไหน)
    }
    strncpy(out[pos].rom, rom, sizeof(out[pos].rom) - 1);
    out[pos].temp = t;
    out[pos].ok = true;
    out[pos].pos_idx = pos;
  }
}
