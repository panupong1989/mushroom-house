// ============================================================================
// diag_rs485.cpp — เครื่องมือ diagnostic ชั่วคราว (ไม่ใช่ firmware ใช้งานจริง)
//
// จุดประสงค์: หาเซนเซอร์ T/RH บนบัส RS485/Modbus (XY-MD02 ฯลฯ) ที่ "ยังไม่เจอเลย"
//
// v2 (หลังเจอ "เงียบทุก address ทุก baud"): เพิ่ม 2 อย่างเพื่อฟันธงเคส "ไม่มีอะไรตอบเลย"
//   1) Serial2.flush() ก่อนดึง DE/RE ลง — กันเฟรมถูกตัดกลางคัน (บั๊กคลาสสิก ESP32+ModbusMaster+MAX485
//      ที่ทำให้ "เงียบสนิท" ทั้งที่สายถูก) — production rs485_sensors.cpp ก็ต้องแก้จุดนี้ถ้าเป็นเหตุ
//   2) ลอง DE/RE 3 โหมดอัตโนมัติ: NORMAL (HIGH=TX), INVERTED (LOW=TX), AUTO (ไม่แตะขา)
//      ครอบคลุมทั้งบอร์ด manual (ขั้วปกติ/สลับ) และบอร์ด auto-direction
//
// error code: OK / EXC (ตัวมีอยู่ register ผิด) / CRC (เพี้ยน) / TIMEOUT (เงียบ)
// ยังเงียบหมดหลัง v2 → ปัญหาสายจริง 100%: A-B สลับ / ไฟเลี้ยงเซนเซอร์ / GND ร่วม / สาย TX-RX ที่ตัว
//   transceiver / เซนเซอร์ไม่มีไฟ — ไม่ใช่ firmware
//
// วิธีใช้:  py -m platformio run -e diag_rs485 -t upload   แล้ว   ... device monitor -e diag_rs485
// pin = config.h (RS485_*): RX=16 TX=17 DE_RE=4 baud=9600
// ============================================================================
#include <Arduino.h>
#include <ModbusMaster.h>

static constexpr int RX_PIN    = 16;   // = RS485_RX_PIN
static constexpr int TX_PIN    = 17;   // = RS485_TX_PIN
static constexpr int DE_RE_PIN = 4;    // = RS485_DE_RE_PIN
static constexpr uint8_t ADDR_MAX  = 6;
static constexpr uint16_t REG_TRH  = 0x0001;

static ModbusMaster node;

// โหมดคุมทิศ DE/RE ที่กำลังทดสอบ (ตั้งก่อน probe แต่ละรอบ)
enum DeMode { DE_NORMAL, DE_INVERTED, DE_AUTO };
static DeMode g_de = DE_NORMAL;

static void preTx() {
  if (g_de == DE_NORMAL)        digitalWrite(DE_RE_PIN, HIGH);   // HIGH = ส่ง (MAX485 ปกติ)
  else if (g_de == DE_INVERTED) digitalWrite(DE_RE_PIN, LOW);
  // DE_AUTO: ไม่แตะขา (บอร์ด auto-direction คุมเอง)
}
static void postTx() {
  Serial2.flush();   // ⚠️ สำคัญ: รอ UART ส่งครบทุกไบต์ ก่อนสลับกลับเป็นรับ (กันเฟรมขาด)
  if (g_de == DE_NORMAL)        digitalWrite(DE_RE_PIN, LOW);
  else if (g_de == DE_INVERTED) digitalWrite(DE_RE_PIN, HIGH);
}

static const char *deName(DeMode m) {
  return m == DE_NORMAL ? "DE=ปกติ" : m == DE_INVERTED ? "DE=สลับ" : "DE=auto";
}

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

// สแกน address 1..ADDR_MAX ที่ baud+โหมด DE/RE ปัจจุบัน — คืนจำนวนที่ตอบ (ไม่ timeout)
static int sweep(uint32_t baud, DeMode de) {
  g_de = de;
  Serial2.end();
  Serial2.begin(baud, SERIAL_8N1, RX_PIN, TX_PIN);
  if (de != DE_AUTO) digitalWrite(DE_RE_PIN, de == DE_NORMAL ? LOW : HIGH);   // เริ่มที่โหมดรับ
  delay(40);
  Serial.printf("  -- baud %lu · %s --\n", (unsigned long)baud, deName(de));
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
  Serial.println("  RS485/Modbus DIAGNOSTIC v2 (ชั่วคราว — flush + ลอง DE/RE 3 โหมด)");
  Serial.printf ("  RX=%d TX=%d DE_RE=%d  ·  addr 1..%d\n", RX_PIN, TX_PIN, DE_RE_PIN, ADDR_MAX);
  Serial.println("  ยังเงียบหมดหลัง v2 = ปัญหาสายจริง (A-B สลับ / ไฟเซนเซอร์ / GND / TX-RX ที่ transceiver)");
  Serial.println("================================================================");
}

void loop() {
  pass++;
  Serial.printf("\n=============== pass #%lu ===============\n", (unsigned long)pass);
  int total = 0;
  // baud 9600 (ค่าจริง): ลองครบ 3 โหมด DE/RE เพื่อฟันธงเรื่องทิศ
  total += sweep(9600, DE_NORMAL);
  total += sweep(9600, DE_INVERTED);
  total += sweep(9600, DE_AUTO);
  // baud อื่น: เช็คซ้ำเฉพาะโหมดปกติ (เผื่อ sensor ตั้ง baud อื่น)
  total += sweep(4800, DE_NORMAL);
  total += sweep(19200, DE_NORMAL);
  Serial.printf("[สรุป pass #%lu] ตอบรวม %d รายการ%s\n", (unsigned long)pass, total,
                total == 0 ? " — ยังเงียบ = ปัญหาสายจริง (ไม่ใช่ firmware)" : " <- เจอแล้ว! ดูบรรทัด OK/EXC");
  delay(1500);
}
