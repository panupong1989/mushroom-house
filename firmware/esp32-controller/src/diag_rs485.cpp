// ============================================================================
// diag_rs485.cpp — เครื่องมือ diagnostic ชั่วคราว (ไม่ใช่ firmware ใช้งานจริง)
//
// จุดประสงค์: หาเซนเซอร์ T/RH บนบัส RS485/Modbus (XY-MD02) ที่ "ยังไม่เจอเลย"
//
// v3 (บอร์ดแปลงเป็น auto-direction: ฝั่ง TTL มีแค่ GND/RXD/TXD/VCC ไม่มี DE/RE)
//   → DE/RE ไม่เกี่ยว. ตัวแปรที่เหลือที่ firmware ทดสอบได้ = "ขา RX/TX สลับกันไหม" + baud
//   ลองสลับขา RX↔TX ให้อัตโนมัติ (พี่ไม่ต้องขยับสาย) × baud — ถ้า TX/RX สลับ อีกแบบจะเจอทันที
//   คง Serial2.flush() ไว้ (harmless กับ auto-direction)
//
// error: OK / EXC (ตัวมีอยู่ register ผิด) / CRC (เพี้ยน) / TIMEOUT (เงียบ)
// ยังเงียบทั้ง 2 orientation ทุก baud → ปัญหาสายจริงล้วนๆ: A/B สลับ · ไฟเลี้ยงเซนเซอร์ ·
//   VCC โมดูล · TX/RX จริงไม่ถึงโมดูล (ดู LED TXD/RXD บนบอร์ดว่ากะพริบไหมตอน scan)
//
// วิธีใช้:  py -m platformio run -e diag_rs485 -t upload   แล้ว   ... device monitor -e diag_rs485
// ============================================================================
#include <Arduino.h>
#include <ModbusMaster.h>

static constexpr int PIN_A = 16;   // = RS485_RX_PIN (ESP32 RX)
static constexpr int PIN_B = 17;   // = RS485_TX_PIN (ESP32 TX)
static constexpr int DE_RE_PIN = 4;
static constexpr uint8_t ADDR_MAX = 4;
static constexpr uint16_t REG_TRH = 0x0001;

static ModbusMaster node;

// โมดูล auto-direction: flush ก่อนปล่อย (กันเฟรมขาด) แต่ไม่ต้องคุมทิศ (บอร์ดทำเอง)
static void preTx()  {}
static void postTx() { Serial2.flush(); }

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

static uint8_t probe(uint8_t addr, const char *&func, float &temp, float &rh) {
  node.begin(addr, Serial2);
  uint8_t r = node.readInputRegisters(REG_TRH, 2);
  func = "input";
  if (r == ModbusMaster::ku8MBResponseTimedOut) {
    uint8_t r2 = node.readHoldingRegisters(REG_TRH, 2);
    if (r2 != ModbusMaster::ku8MBResponseTimedOut) { func = "holding"; r = r2; }
  }
  if (r == ModbusMaster::ku8MBSuccess) {
    temp = (int16_t)node.getResponseBuffer(0) / 10.0f;
    rh   = (int16_t)node.getResponseBuffer(1) / 10.0f;
  }
  return r;
}

// sweep addr ที่ pin orientation (rxPin,txPin) + baud ที่กำหนด
static int sweep(int rxPin, int txPin, uint32_t baud) {
  Serial2.end();
  Serial2.begin(baud, SERIAL_8N1, rxPin, txPin);
  delay(40);
  Serial.printf("  -- RX=GPIO%d TX=GPIO%d · baud %lu --\n", rxPin, txPin, (unsigned long)baud);
  int hits = 0;
  for (uint8_t addr = 1; addr <= ADDR_MAX; addr++) {
    const char *func = ""; float temp = NAN, rh = NAN;
    uint8_t r = probe(addr, func, temp, rh);
    if (r == ModbusMaster::ku8MBResponseTimedOut) continue;
    hits++;
    if (r == ModbusMaster::ku8MBSuccess)
      Serial.printf("     addr %-2d [%s] ✅ OK  temp=%.1f°C rh=%.1f%%\n", addr, func, temp, rh);
    else
      Serial.printf("     addr %-2d [%s] ⚠️ %s\n", addr, func, errName(r));
    delay(30);
  }
  return hits;
}

static uint32_t pass = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(DE_RE_PIN, OUTPUT);
  digitalWrite(DE_RE_PIN, LOW);
  node.preTransmission(preTx);
  node.postTransmission(postTx);
  Serial.println();
  Serial.println("================================================================");
  Serial.println("  RS485 DIAGNOSTIC v3 (auto-direction) — ลองสลับขา RX/TX อัตโนมัติ");
  Serial.println("  👀 ดู LED บนบอร์ด RS485 ตอน scan: TXD ควรกะพริบ (ESP ส่งออก)");
  Serial.println("     TXD ไม่กะพริบเลย = ESP→โมดูลไม่ถึง (สาย TX/VCC โมดูล)");
  Serial.println("     TXD กะพริบ แต่ RXD เงียบ = ส่งออกได้ แต่เซนเซอร์ไม่ตอบ (A/B สลับ/ไฟเซนเซอร์)");
  Serial.println("================================================================");
}

void loop() {
  pass++;
  Serial.printf("\n=============== pass #%lu ===============\n", (unsigned long)pass);
  int total = 0;
  const uint32_t bauds[] = {9600, 4800, 19200};
  // orientation ปกติ (RX=16 TX=17)
  for (uint32_t b : bauds) total += sweep(PIN_A, PIN_B, b);
  // orientation สลับ (RX=17 TX=16) — เผื่อ TXD/RXD บนโมดูลสลับกัน
  for (uint32_t b : bauds) total += sweep(PIN_B, PIN_A, b);
  Serial.printf("[สรุป pass #%lu] ตอบรวม %d รายการ%s\n", (unsigned long)pass, total,
                total == 0 ? " — เงียบทั้ง 2 orientation = ปัญหาสายจริง (A/B, ไฟเซนเซอร์, VCC โมดูล)"
                           : " <- เจอแล้ว! ดูบรรทัด RX/TX ที่ OK");
  delay(1500);
}
