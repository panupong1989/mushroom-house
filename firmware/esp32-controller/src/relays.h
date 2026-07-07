#pragma once
#include "types.h"
void relays_begin();               // ตั้งพิน + OFF ทั้งหมด (fail-safe)
void relay_set(int pin, bool on, uint32_t min_on_ms, uint32_t min_off_ms);
void relays_all_off();
ActuatorState relays_state();
