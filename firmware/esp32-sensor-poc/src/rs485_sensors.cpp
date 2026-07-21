#include "rs485_sensors.h"
#include "config.h"
#include <ModbusMaster.h>

static ModbusMaster node;

static void preTx()  { if (RS485_DE_RE_PIN >= 0) digitalWrite(RS485_DE_RE_PIN, HIGH); }
static void postTx() { if (RS485_DE_RE_PIN >= 0) digitalWrite(RS485_DE_RE_PIN, LOW);  }

void rs485_begin() {
  if (RS485_DE_RE_PIN >= 0) { pinMode(RS485_DE_RE_PIN, OUTPUT); digitalWrite(RS485_DE_RE_PIN, LOW); }
  Serial2.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  node.preTransmission(preTx);
  node.postTransmission(postTx);
}

bool rs485_read(uint8_t addr, float &temp, float &rh) {
  node.begin(addr, Serial2);
  uint8_t r = node.readInputRegisters(0x0001, 2);
  if (r != node.ku8MBSuccess) return false;
  temp = (int16_t)node.getResponseBuffer(0) / 10.0f;
  rh   = (int16_t)node.getResponseBuffer(1) / 10.0f;
  return true;
}
