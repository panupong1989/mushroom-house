// ============================================================================
// diag_rs485_setaddr.cpp — เครื่องมือชั่วคราว: ตั้ง Modbus address ของ XY-MD02 ทีละตัว
//
// ปัญหา: เซนเซอร์ 2 ตัวเป็น addr 1 จากโรงงานทั้งคู่ → ต่อพร้อมกันบัสชนกัน (เห็น OK↔CRC สลับ)
// เครื่องมือนี้เขียน address ใหม่ให้เซนเซอร์ "ตัวที่ต่ออยู่ตัวเดียว" → แยก address ไม่ให้ชน
//
// ⚠️ ต่อเซนเซอร์ทีละ 1 ตัวเท่านั้น (ถอดอีกตัวออก) ไม่งั้นจะเขียนโดนทั้งคู่ = ยังชนเหมือนเดิม
//
// ขั้นตอน (ให้ได้ addr 1 กับ 3 ตามที่ firmware อ่าน head=1/tail=3):
//   1) ต่อเซนเซอร์ตัวที่จะเป็น "ท้ายโรง" ตัวเดียว → flash ตัวนี้ (TARGET_ADDR=3) → กลายเป็น addr 3
//   2) อีกตัวปล่อยไว้ addr 1 (หัวโรง) — ไม่ต้องทำอะไร
//   3) ต่อกลับทั้ง 2 ตัว → addr 1 + 3 ไม่ชนกันแล้ว
//
// pins = ค่าที่ยืนยันหน้างาน (TX=16 RX=17 auto-direction) · XY-MD02: addr = holding reg 0x0101
// วิธีใช้:  py -m platformio run -e diag_rs485_setaddr -t upload  แล้ว  ... device monitor -e diag_rs485_setaddr
// ============================================================================
#include <Arduino.h>
#include <ModbusMaster.h>

static constexpr int RX_PIN = 17;   // ESP32 RX  (ยืนยันหน้างาน)
static constexpr int TX_PIN = 16;   // ESP32 TX
static constexpr uint8_t TARGET_ADDR = 3;      // <<< address ปลายทางที่อยากตั้ง (แก้ตรงนี้ได้)
static constexpr uint16_t REG_TRH  = 0x0001;   // input reg temp/rh (ใช้เช็คว่าตัวไหนตอบ)
static constexpr uint16_t REG_ADDR = 0x0101;   // holding reg = device address (XY-MD02)

static ModbusMaster node;
static void postTx() { Serial2.flush(); }

// หา address ปัจจุบันของเซนเซอร์ที่ต่ออยู่ (คืน 0 ถ้าไม่เจอ, 0xFF ถ้าเจอแต่ CRC = อาจต่อหลายตัว)
static uint8_t findCurrent() {
  bool sawCrc = false;
  for (uint8_t a = 1; a <= 20; a++) {
    node.begin(a, Serial2);
    uint8_t r = node.readInputRegisters(REG_TRH, 2);
    if (r == ModbusMaster::ku8MBSuccess) return a;
    if (r == ModbusMaster::ku8MBInvalidCRC) sawCrc = true;
    delay(20);
  }
  return sawCrc ? 0xFF : 0;
}

static bool done = false;

void setup() {
  Serial.begin(115200);
  delay(400);
  node.postTransmission(postTx);
  Serial2.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  delay(50);

  Serial.println();
  Serial.println("================================================================");
  Serial.println("  ตั้ง Modbus address ของ XY-MD02 (ทีละตัว)");
  Serial.printf ("  ⚠️ ต่อเซนเซอร์ตัวเดียวเท่านั้น  ·  จะตั้งเป็น addr %d\n", TARGET_ADDR);
  Serial.println("================================================================");

  uint8_t cur = findCurrent();
  if (cur == 0) {
    Serial.println("❌ ไม่เจอเซนเซอร์เลย — เช็ค: ต่อไฟเซนเซอร์แล้ว? สาย A/B ถูก? pin TX=16/RX=17?");
    return;
  }
  if (cur == 0xFF) {
    Serial.println("⚠️ เจอสัญญาณแต่ CRC ผิด — น่าจะต่อ 2 ตัวพร้อมกัน (ชนกัน)");
    Serial.println("   ถอดให้เหลือตัวเดียวแล้ว reset บอร์ด (กดปุ่ม EN) ลองใหม่");
    return;
  }

  Serial.printf("พบเซนเซอร์ที่ addr %d\n", cur);
  if (cur == TARGET_ADDR) {
    Serial.printf("✅ addr เป็น %d อยู่แล้ว — ไม่ต้องทำอะไร\n", TARGET_ADDR);
    done = true;
    return;
  }

  // เขียน address ใหม่ (holding reg 0x0101) ที่ address ปัจจุบัน
  node.begin(cur, Serial2);
  uint8_t w = node.writeSingleRegister(REG_ADDR, TARGET_ADDR);
  if (w != ModbusMaster::ku8MBSuccess) {
    Serial.printf("❌ เขียน address ไม่สำเร็จ (code 0x%02X) — ลองใหม่ หรือ power-cycle เซนเซอร์\n", w);
    return;
  }
  Serial.printf("เขียน addr %d -> %d แล้ว · กำลังยืนยัน…\n", cur, TARGET_ADDR);
  delay(300);

  // ยืนยัน: อ่านที่ address ใหม่
  node.begin(TARGET_ADDR, Serial2);
  uint8_t v = node.readInputRegisters(REG_TRH, 2);
  if (v == ModbusMaster::ku8MBSuccess) {
    float t = (int16_t)node.getResponseBuffer(0) / 10.0f;
    float rh = (int16_t)node.getResponseBuffer(1) / 10.0f;
    Serial.printf("✅ สำเร็จ! ตอนนี้เซนเซอร์เป็น addr %d (temp=%.1f°C rh=%.1f%%)\n", TARGET_ADDR, t, rh);
    done = true;
  } else {
    Serial.printf("⚠️ เขียนแล้วแต่ยังอ่านที่ addr %d ไม่ได้ — ลองถอดไฟเซนเซอร์แล้วเสียบใหม่ (power-cycle) แล้วเช็คด้วย diag_rs485\n", TARGET_ADDR);
  }
}

void loop() {
  Serial.println(done ? "— เสร็จแล้ว ถอดออก/ต่อทั้ง 2 ตัวได้ (อีกตัวยัง addr 1) —"
                      : "— ยังไม่สำเร็จ ดูข้อความด้านบน แก้แล้ว reset บอร์ด —");
  delay(4000);
}
