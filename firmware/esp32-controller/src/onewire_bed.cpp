#include "onewire_bed.h"
#include "config.h"
#include <OneWire.h>
#include <DallasTemperature.h>

static OneWire oneWire(ONEWIRE_PIN);
static DallasTemperature sensors(&oneWire);

static void rom_to_str(const DeviceAddress addr, char *out, size_t n) {
  snprintf(out, n, "%02X%02X%02X%02X%02X%02X%02X%02X",
           addr[0], addr[1], addr[2], addr[3], addr[4], addr[5], addr[6], addr[7]);
}

void onewire_bed_begin() {
  sensors.begin();
  sensors.setWaitForConversion(true);
}

// NOTE(CC): ลำดับ index บนบัสไม่รับประกันว่าตรงกับตำแหน่งหัว/กลาง/ท้ายจริง
// ต้อง map ROM address -> ตำแหน่งตอนติดตั้งหน้างาน (ดู docs/02-hardware.md)
void onewire_bed_read(BedReading out[3], float &bed_temp_max) {
  sensors.requestTemperatures();
  float tmax = -100.0f;
  int okc = 0;
  for (int i = 0; i < 3; i++) {
    DeviceAddress addr;
    bool haveAddr = sensors.getAddress(addr, i);
    float t = haveAddr ? sensors.getTempC(addr) : DEVICE_DISCONNECTED_C;
    bool ok = haveAddr && t != DEVICE_DISCONNECTED_C;
    out[i].ok = ok;
    out[i].temp = ok ? t : NAN;
    if (haveAddr) rom_to_str(addr, out[i].rom, sizeof(out[i].rom));
    else out[i].rom[0] = 0;
    if (ok) { okc++; if (t > tmax) tmax = t; }
  }
  bed_temp_max = okc ? tmax : NAN;
}
