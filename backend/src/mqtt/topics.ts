import { cfg } from '../config.js';
const b = (s: string) => `${cfg.mqttBase}/${cfg.houseId}/${s}`;
export const T = {
  telemetry: b('telemetry'),
  actuatorState: b('actuator/state'),
  alert: b('alert'),
  heartbeat: b('heartbeat'),
  cmdActuator: b('cmd/actuator'),
  cmdConfig: b('cmd/config'),
  cmdProfile: b('cmd/profile'),
};
