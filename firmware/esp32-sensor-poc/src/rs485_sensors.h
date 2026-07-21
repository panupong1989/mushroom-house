#pragma once
#include "types.h"
void rs485_begin();
// อ่าน T/RH ของ slave address (XY-MD02: input reg 0x0001=temp*10, 0x0002=rh*10); return true ถ้าสำเร็จ
bool rs485_read(uint8_t addr, float &temp, float &rh);
