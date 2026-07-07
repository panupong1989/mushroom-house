#pragma once
#include "types.h"
void mqtt_begin();
void mqtt_loop();
void mqtt_publish_telemetry(const SensorSnapshot &s, Mode mode);
void mqtt_publish_state(const ActuatorState &a);
void mqtt_publish_alert(const char *code, const char *sev, const char *msg);
void mqtt_publish_heartbeat();
