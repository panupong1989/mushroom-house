// firmware เฟสแรก: อ่านเซนเซอร์จริง (DS18B20 x7 + RS485 XY-MD02 x2) แล้วยิงขึ้น Supabase
// ยังไม่มี control/relay/safety — ใช้สำหรับ commissioning หน้างานก่อนต่อ esp32-controller เต็มระบบ
// ก่อนใช้งาน: flash env `romscan` เพื่อผูก ROM ของ DS18B20 แต่ละตัวเข้าตำแหน่งก่อน (ดู README.md)
#include <Arduino.h>
#include <math.h>
#include "config.h"
#include "types.h"
#include "rom_map.h"
#include "onewire_multi.h"
#include "rs485_sensors.h"
#include "net.h"
#include "supabase_client.h"

static uint32_t t_readings = 0, t_resolve = 0, t_hb = 0;

static void print_snapshot(const DsReading ds[DS18B20_COUNT], const AirReading air[RS485_COUNT]) {
  for (int i = 0; i < DS18B20_COUNT; i++) {
    if (ds[i].ok) Serial.printf("[ds] %-16s = %.2f C (rom %s)\n", DS_POSITION[i], ds[i].temp, ds[i].rom);
  }
  for (int i = 0; i < RS485_COUNT; i++) {
    if (air[i].ok) Serial.printf("[rs485] %-6s addr=%u T=%.1fC RH=%.1f%%\n", RS485_LOC[i], air[i].addr, air[i].temp, air[i].rh);
    else Serial.printf("[rs485] %-6s addr=%u อ่านไม่ได้\n", RS485_LOC[i], RS485_ADDR[i]);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n[boot] esp32-sensor-poc " FW_VERSION " (phase1 - no control/relay)");
  rom_map_begin();
  onewire_multi_begin();
  rs485_begin();
  net_begin();
  supabase_begin();
}

void loop() {
  net_loop();
  uint32_t now = millis();

  if (net_online() && !supabase_ids_ready() && now - t_resolve >= RESOLVE_RETRY_PERIOD_MS) {
    t_resolve = now;
    supabase_resolve_ids();
  }

  if (now - t_readings >= READINGS_POST_PERIOD_MS) {
    t_readings = now;

    DsReading ds[DS18B20_COUNT];
    onewire_multi_read(ds);

    AirReading air[RS485_COUNT];
    for (int i = 0; i < RS485_COUNT; i++) {
      float t, rh; bool ok = rs485_read(RS485_ADDR[i], t, rh);
      air[i] = {RS485_ADDR[i], ok ? t : NAN, ok ? rh : NAN, ok};
    }

    print_snapshot(ds, air);

    if (net_online() && supabase_ids_ready()) {
      bool posted = supabase_post_readings(ds, air);
      Serial.printf("[supabase] post_readings %s\n", posted ? "ok" : "skip/fail");
    } else {
      Serial.println("[supabase] ข้าม post (ยังไม่ต่อเน็ต หรือยัง resolve id ไม่ได้)");
    }
  }

  if (now - t_hb >= HEARTBEAT_PERIOD_MS) {
    t_hb = now;
    Serial.printf("[hb] net=%d ids=%d rssi=%d ds_on_bus=%d\n",
                  net_online(), supabase_ids_ready(), net_rssi(), onewire_multi_bus_count());
  }
}
