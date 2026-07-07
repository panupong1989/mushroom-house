#include <Arduino.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "types.h"
#include "rs485_sensors.h"
#include "onewire_bed.h"
#include "relays.h"
#include "safety.h"
#include "control_fsm.h"
#include "mqtt_client.h"

static Setpoints SP;
static uint32_t t_last_ctrl=0, t_last_tele=0, t_last_hb=0;

static bool read_float_water(){ return digitalRead(FLOAT_PIN) == HIGH; } // ปรับตามการต่อ

static void read_sensors(SensorSnapshot &s){
  s.ts = millis()/1000;
  float sum=0; int okc=0; float tmax=-100;
  for(int i=0;i<3;i++){
    float t,rh; bool ok=rs485_read(RS485_ADDR[i],t,rh);
    s.air[i]={RS485_ADDR[i],ok?t:NAN,ok?rh:NAN,ok};
    if(ok){ sum+=t; okc++; if(t>tmax)tmax=t; }
  }
  // ใช้ค่า "วิกฤต" (สูงสุด) เป็นตัวคุมกันร้อนเกิน; เฉลี่ยไว้ทำ RH
  s.air_temp_ctrl = okc? tmax : NAN;
  float rhsum=0;int rhc=0; for(int i=0;i<3;i++) if(s.air[i].ok){rhsum+=s.air[i].rh;rhc++;}
  s.air_rh_ctrl = rhc? rhsum/rhc : NAN;
  onewire_bed_read(s.bed, s.bed_temp_max);
  s.water_ok = read_float_water();
}

void setup(){
  Serial.begin(115200);
  pinMode(FLOAT_PIN, INPUT);
  relays_begin();          // OFF ทั้งหมด (fail-safe)
  rs485_begin();
  onewire_bed_begin();
  control_begin(SP);
  control_set_mode(M_FRUITING);
  mqtt_begin();
  esp_task_wdt_init(15, true);   // hardware watchdog 15s
  esp_task_wdt_add(NULL);
}

void loop(){
  esp_task_wdt_reset();
  mqtt_loop();
  uint32_t now=millis();

  if(now - t_last_ctrl >= CONTROL_PERIOD_MS){
    t_last_ctrl=now;
    SensorSnapshot s; read_sensors(s);
    char alert[24];
    bool trip = safety_check(s, SP, alert, sizeof(alert));
    if(trip){ control_set_mode(M_SAFE_HOLD); mqtt_publish_alert(alert,"critical",""); }
    else { if(control_mode()==M_SAFE_HOLD) control_set_mode(M_FRUITING); control_step(s); }
    mqtt_publish_state(relays_state());

    if(now - t_last_tele >= TELEMETRY_PERIOD_MS){ t_last_tele=now; mqtt_publish_telemetry(s, control_mode()); }
  }
  if(now - t_last_hb >= 30000){ t_last_hb=now; mqtt_publish_heartbeat(); }
}
