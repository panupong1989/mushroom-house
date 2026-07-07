#pragma once
#include "types.h"
void   rs485_begin();
// อ่าน T/RH ของ slave address; return true ถ้าสำเร็จ
bool   rs485_read(uint8_t addr, float &temp, float &rh);
