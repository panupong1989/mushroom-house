// ============================================================================
// diag_rs485.cpp — เครื่องมือ diagnostic ชั่วคราว (ไม่ใช่ firmware ใช้งานจริง)
//
// จุดประสงค์: หาเซนเซอร์ T/RH บนบัส RS485/Modbus (XY-MD02 ฯลฯ) ที่ "ยังไม่เจอเลย"
// สแกนทุก slave address + หลาย baud + ลองทั้ง input/holding register แล้ว *แยกสาเหตุ* จาก
// error code ของ Modbus:
//   - OK            → ตัวนั้นตอบ + อ่านค่าได้ (โชว์ temp/rh)
//   - EXC:register  → ตัว "มีอยู่และคุยได้" แต่ register ผิด → แก้ register map (rs485_sensors.cpp)
//   - CRC ผิด       → มีสัญญาณแต่เพี้ยน → baud ไม่ตรง / A-B สลับบางส่วน / สายรบกวน
//   - TIMEOUT ทุกตัว → ไม่มีอะไรตอบเลย → A-B สลับ / ไม่มีไฟเข้าเซนเซอร์ / GND ไม่ร่วม /
//                      DE-RE คุมทิศผิด (บอร์ด manual vs auto) / address ชนกัน (2 ตัว addr เดียว)
//
// วิธีใช้ (ถอด USB ก่อนเปลี่ยนสายทุกครั้ง):
//   py -m platformio run -e diag_rs485 -t upload
//   py -m platformio device monitor -e diag_rs485
//
// pin/baud = config.h (RS485_*). ปัจจุบัน: RX=16 TX=17 DE_RE=4 baud=9600 — sync เองถ้า config เปลี่ยน
// ============================================================================
#include <Arduino.h>
#include <ModbusMaster.h>

static constexpr int RX_PIN    = 16;   // = RS485_RX_PIN
static constexpr int TX_PIN    = 17;   // = RS485_TX_PIN
static constexpr int DE_RE_PIN = 4;    // = RS485_DE_RE_PIN (-1 ถ้าใช้บอร์ด auto-direction)
static const uint32_t BAUDS[]  = {9600, 4800, 19200};   // baud ที่ลอง (9600 = ค่าปัจจุบัน)
static constexpr uint8_t ADDR_MAX  = 8;   // sweep address 1..8 (default XY-MD02 = 1)
static constexpr uint16_t REG_TRH  = 0x0001;   // register temp/rh (production ใช้ input reg นี้)

static ModbusMaster node;

static void preTx()  { if (DE_RE_PIN >= 0) digitalWrite(DE_RE_PIN, HIGH); }
static void postTx() { if (DE_RE_PIN >= 0) digitalWrite(DE_RE_PIN, LOW);  }

static const char *errName(uint8_t e) {
  switch (e) {
    case ModbusMaster::ku8MBSuccess:            return "OK";
    case ModbusMaster::ku8MBIllegalDataAddress: return "EXC register ผิด (แต่ตัวมีอยู่!)";
    case ModbusMaster::ku8MBIllegalFunction:    return "EXC ฟังก์ชันผิด (ตัวมีอยู่)";
    case ModbusMaster::ku8MBIllegalDataValue:   return "EXC ค่าผิด (ตัวมีอยู่)";
    case ModbusMaster::ku8MBSlaveDeviceFailure: return "EXC slave fail (ตัวมีอยู่)";
    case ModbusMaster::ku8MBInvalidCRC:         return "CRC ผิด (มีสัญญาณแต่เพี้ยน)";
    case ModbusMaster::ku8MBResponseTimedOut:   return "TIMEOUT (ไม่ตอบ)";
    default:                                    return "err อื่น";
  }
}

// ลองอ่าน 1 address ด้วย baud ที่ตั้ง Serial2 ไว้แล้ว — ลอง input reg ก่อน ถ้า timeout ลอง holding
// คืน error code ของอันที่ "ไม่ timeout" (สื่อว่ามีตัวตอบ) — ถ้า timeout ทั้งคู่คืน timeout
static uint8_t probe(uint8_t addr, const char *&func, float &temp, float &rh) {
  node.begin(addr, Serial2);
  uint8_t r = node.readInputRegisters(REG_TRH, 2);   // function 0x04
  func = "input(0x04)";
  if (r == ModbusMaster::ku8MBResponseTimedOut) {
    uint8_t r2 = node.readHoldingRegisters(REG_TRH, 2);   // function 0x03 (บางรุ่นใช้อันนี้)
    if (r2 != ModbusMaster::ku8MBResponseTimedOut) { func = "holding(0x03)"; r = r2; }
  }
  if (r == ModbusMaster::ku8MBSuccess) {
    temp = (int16_t)node.getResponseBuffer(0) / 10.0f;
    rh   = (int16_t)node.getResponseBuffer(1) / 10.0f;
  }
  return r;
}

static uint32_t pass = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  if (DE_RE_PIN >= 0) { pinMode(DE_RE_PIN, OUTPUT); digitalWrite(DE_RE_PIN, LOW); }
  node.preTransmission(preTx);
  node.postTransmission(postTx);
  Serial.println();
  Serial.println("================================================================");
  Serial.println("  RS485/Modbus DIAGNOSTIC (เครื่องมือชั่วคราว — ไม่ใช่ firmware จริง)");
  Serial.printf ("  RX=%d TX=%d DE_RE=%d  ·  sweep addr 1..%d  ·  reg 0x%04X\n", RX_PIN, TX_PIN, DE_RE_PIN, ADDR_MAX, REG_TRH);
  Serial.println("  ตอบ OK = ดี · EXC = ตัวมีอยู่ register ผิด · CRC = เพี้ยน · TIMEOUT = เงียบ");
  Serial.println("  เงียบหมด → เช็ค A-B สลับ / ไฟเข้าเซนเซอร์ / GND ร่วม / DE-RE / address ชนกัน");
  Serial.println("================================================================");
}

void loop() {
  pass++;
  int totalHits = 0;
  for (uint32_t bi = 0; bi < sizeof(BAUDS) / sizeof(BAUDS[0]); bi++) {
    uint32_t baud = BAUDS[bi];
    Serial2.end();
    Serial2.begin(baud, SERIAL_8N1, RX_PIN, TX_PIN);
    delay(50);
    Serial.printf("\n----- pass #%lu · baud %lu -----\n", (unsigned long)pass, (unsigned long)baud);
    int hits = 0;
    for (uint8_t addr = 1; addr <= ADDR_MAX; addr++) {
      const char *func = "";
      float temp = NAN, rh = NAN;
      uint8_t r = probe(addr, func, temp, rh);
      if (r == ModbusMaster::ku8MBResponseTimedOut) continue;   // เงียบ = ไม่ปริ้นต์ (ลดสแปม)
      hits++;
      if (r == ModbusMaster::ku8MBSuccess) {
        Serial.printf("  addr %-3d [%s] ✅ OK  temp=%.1f°C  rh=%.1f%%\n", addr, func, temp, rh);
      } else {
        Serial.printf("  addr %-3d [%s] ⚠️ %s\n", addr, func, errName(r));
      }
      delay(30);
    }
    if (hits == 0) Serial.printf("  (เงียบทุก address ที่ baud %lu)\n", (unsigned long)baud);
    totalHits += hits;
  }
  Serial.printf("[สรุป pass #%lu] เจอที่ตอบ %d รายการ%s\n", (unsigned long)pass, totalHits,
                totalHits == 0 ? " — ยังไม่มีอะไรบนบัสตอบเลย (ดูเช็คลิสต์ด้านบน)" : "");
  delay(1500);
}
