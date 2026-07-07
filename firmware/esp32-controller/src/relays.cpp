#include "relays.h"
#include "config.h"

struct Chan { int pin; bool on; uint32_t last_change; };
static Chan chans[] = {
  {RELAY_MIST,false,0},{RELAY_HEATER,false,0},{RELAY_EXHAUST,false,0},
  {RELAY_LIGHT,false,0},{RELAY_CIRCULATION,false,0}
};

void relays_begin() {
  for (auto &c : chans) { pinMode(c.pin, OUTPUT); digitalWrite(c.pin, LOW); c.on=false; }
}

// min-on/min-off กัน relay กระตุก
void relay_set(int pin, bool on, uint32_t min_on_ms, uint32_t min_off_ms) {
  for (auto &c : chans) {
    if (c.pin != pin) continue;
    uint32_t now = millis(), held = now - c.last_change;
    if (on == c.on) return;
    if (c.on && held < min_on_ms)  return;   // ยัง ON ไม่ครบเวลา
    if (!c.on && held < min_off_ms) return;   // ยัง OFF ไม่ครบเวลา
    c.on = on; c.last_change = now;
    digitalWrite(pin, on ? HIGH : LOW);
    return;
  }
}

void relays_all_off() { for (auto &c: chans){ digitalWrite(c.pin,LOW); c.on=false; c.last_change=millis(); } }

ActuatorState relays_state() {
  ActuatorState s{};
  for (auto &c: chans) {
    if (c.pin==RELAY_MIST) s.mist=c.on;
    else if (c.pin==RELAY_HEATER) s.heater=c.on;
    else if (c.pin==RELAY_EXHAUST) s.exhaust=c.on;
    else if (c.pin==RELAY_LIGHT) s.light=c.on;
    else if (c.pin==RELAY_CIRCULATION) s.circulation=c.on;
  }
  return s;
}
