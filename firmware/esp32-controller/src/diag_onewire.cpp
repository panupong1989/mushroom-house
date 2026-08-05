// ============================================================================
// diag_onewire.cpp — เครื่องมือ diagnostic ชั่วคราว (ไม่ใช่ firmware ใช้งานจริง)
//
// จุดประสงค์: ไล่หา DS18B20 บนบัส 1-Wire ให้ครบ "ทุกตัวที่มีจริงบนบัส" โดยไม่ถูก cap
// ที่ 3 เหมือน onewire_bed.cpp (production hardcode 3 ตัว → ใช้ตอบว่ามีกี่ตัวบนบัสไม่ได้)
//
// ต่างจาก scan sketch ทั่วไป: มี CRC ROM, family-code check, ธง 85.0°C (power-on reset =
// จ่ายไฟ/timing มีปัญหา), ธง -127°C (สายขาด), รายงาน parasite-power, และ *ตารางสะสมข้ามรอบ*
// (seen/total) เพื่อจับตัวที่ "เข้า ๆ ออก ๆ" = จุดต่อหลวม/pull-up ไม่พอ (ตัวเสียจริงจะไม่โผล่เลย)
//
// วิธีใช้ (พี่ Beer ทำเอง — ถอด USB ทุกครั้งก่อนเปลี่ยนสาย):
//   py -m platformio run -e diag -t upload
//   py -m platformio device monitor -e diag        (หรือ -b 115200)
//
// pin ต้องตรงกับ ONEWIRE_PIN ใน src/config.h (ปัจจุบัน = 15). ไม่ include config.h เพื่อเลี่ยง
// #warning secrets และ static ที่ไม่ใช้ — sync ค่านี้เองถ้า config เปลี่ยน pin.
// ============================================================================
#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>

static constexpr uint8_t DIAG_ONEWIRE_PIN = 15;   // = ONEWIRE_PIN ใน src/config.h
static constexpr uint32_t SCAN_PERIOD_MS = 2000;  // scan ทุก 2 วิ (ขยับสายแล้วดูตัวหาย/โผล่ทันที)
static constexpr int MAX_TRACK = 16;              // เก็บ ROM ได้สูงสุด (บัสจริง 6, เผื่อไว้)

static OneWire ow(DIAG_ONEWIRE_PIN);
static DallasTemperature dt(&ow);

// ตารางสะสมข้ามรอบ — เห็นตัวไหนบ้าง กี่รอบจากทั้งหมด (จับ intermittent)
struct Track {
  uint8_t rom[8];
  uint32_t seen;         // จำนวนรอบที่เจอ
  bool present;          // เจอในรอบล่าสุดไหม
  float lastTemp;
  bool crcOk;
};
static Track track[MAX_TRACK];
static int trackN = 0;
static uint32_t scanCount = 0;

static const char *familyName(uint8_t f) {
  switch (f) {
    case 0x28: return "DS18B20";
    case 0x22: return "DS1822";
    case 0x10: return "DS18S20/DS1820";
    case 0x3B: return "DS1825";
    default:   return "UNKNOWN(ไม่ใช่ DS18x20)";
  }
}

static void romStr(const uint8_t *rom, char *out, size_t n) {
  snprintf(out, n, "%02X%02X%02X%02X%02X%02X%02X%02X",
           rom[0], rom[1], rom[2], rom[3], rom[4], rom[5], rom[6], rom[7]);
}

static int findTrack(const uint8_t *rom) {
  for (int i = 0; i < trackN; i++) if (memcmp(track[i].rom, rom, 8) == 0) return i;
  return -1;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  dt.begin();
  Serial.println();
  Serial.println("================================================================");
  Serial.println("  DS18B20 1-Wire DIAGNOSTIC (เครื่องมือชั่วคราว — ไม่ใช่ firmware จริง)");
  Serial.printf ("  GPIO 1-Wire = %d  ·  scan ทุก %lu ms\n", DIAG_ONEWIRE_PIN, (unsigned long)SCAN_PERIOD_MS);
  Serial.println("  85.0°C = power-on reset (ไฟ/pull-up/timing ไม่พอ)  ·  -127°C = สายขาด");
  Serial.println("================================================================");
}

void loop() {
  scanCount++;
  Serial.printf("\n----- scan #%lu -----\n", (unsigned long)scanCount);

  // 1) presence pulse — ถ้าไม่มีอะไรตอบเลย = บัสตาย/สายหลัก DAT-GND-VCC มีปัญหา
  bool presence = ow.reset();
  if (!presence) {
    Serial.println("[บัส] ❌ ไม่มี presence pulse — ไม่มีตัวไหนตอบบนบัสเลย");
    Serial.println("      เช็ค: DAT↔GPIO, pull-up ต่อ DAT↔3.3V จริงไหม, GND ร่วม, ไฟ 3.3V เข้าจริง");
  }

  // 2) enumerate เต็มบัสด้วย raw search (ไม่ cap) + validate CRC ROM
  for (int i = 0; i < trackN; i++) track[i].present = false;
  uint8_t rom[8];
  int found = 0, crcBad = 0, notDS = 0;
  ow.reset_search();
  while (ow.search(rom)) {
    found++;
    bool crcOk = (OneWire::crc8(rom, 7) == rom[7]);
    if (!crcOk) crcBad++;
    if (familyName(rom[0])[0] == 'U') notDS++;   // "UNKNOWN..."

    int ti = findTrack(rom);
    if (ti < 0 && trackN < MAX_TRACK) { ti = trackN++; memcpy(track[ti].rom, rom, 8); track[ti].seen = 0; }
    if (ti >= 0) { track[ti].present = true; track[ti].seen++; track[ti].crcOk = crcOk; }

    char rs[20]; romStr(rom, rs, sizeof(rs));
    Serial.printf("  • %s  [%s]%s\n", rs, familyName(rom[0]), crcOk ? "" : "  ⚠️ CRC ROM ผิด!");
  }

  // 3) อ่านอุณหภูมิทุกตัว (ตามลำดับ library) + ธงค่าเสี่ยง
  dt.requestTemperatures();
  for (int i = 0; i < trackN; i++) {
    if (!track[i].present) continue;
    track[i].lastTemp = dt.getTempC(track[i].rom);
  }

  // 4) parasite power — ถ้าตั้งใจต่อ VCC แต่ขึ้น parasite = VCC บางตัวไม่ถึง (โหลดบัสหนักขึ้น ตัวชายขอบหลุด)
  bool parasite = dt.isParasitePowerMode();

  // 5) สรุปรอบนี้ + ตารางสะสม (จับ intermittent)
  Serial.printf("[สรุป] เจอ %d ตัวรอบนี้", found);
  if (crcBad) Serial.printf(" · CRC ROM ผิด %d", crcBad);
  if (notDS)  Serial.printf(" · ไม่ใช่ DS18x20 %d", notDS);
  Serial.printf(" · parasite-power=%s\n", parasite ? "YES ⚠️" : "no");

  Serial.println("  ROM                seen/รอบ   temp      สถานะ");
  for (int i = 0; i < trackN; i++) {
    char rs[20]; romStr(track[i].rom, rs, sizeof(rs));
    const char *state;
    if (!track[i].present)                     state = "❌ หายรอบนี้ (หลวม/ไม่พอ)";
    else if (track[i].seen == scanCount)       state = "✅ นิ่ง";
    else                                       state = "⚠️ เข้าๆออกๆ (หลวม)";
    char tbuf[16];
    if (!track[i].present)                     snprintf(tbuf, sizeof(tbuf), "  --   ");
    else if (track[i].lastTemp == DEVICE_DISCONNECTED_C) snprintf(tbuf, sizeof(tbuf), "-127 ✂️");
    else if (track[i].lastTemp >= 84.9f && track[i].lastTemp <= 85.1f) snprintf(tbuf, sizeof(tbuf), "85.0 ⚠️");
    else                                       snprintf(tbuf, sizeof(tbuf), "%5.1f  ", track[i].lastTemp);
    Serial.printf("  %s  %2lu/%-4lu  %s  %s\n",
                  rs, (unsigned long)track[i].seen, (unsigned long)scanCount, tbuf, state);
  }

  delay(SCAN_PERIOD_MS);
}
