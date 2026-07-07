import mqtt from 'mqtt';
import { cfg } from '../config.js';
import { T } from './topics.js';
import { ingestTelemetry, ingestAlert, ingestState } from '../services/ingest.js';

export const mqttClient = mqtt.connect(cfg.mqttUrl, { username: cfg.mqttUser, password: cfg.mqttPass });

mqttClient.on('connect', () => {
  console.log('mqtt connected');
  mqttClient.subscribe([T.telemetry, T.actuatorState, T.alert, T.heartbeat]);
});

mqttClient.on('message', async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    if (topic === T.telemetry) await ingestTelemetry(cfg.houseId, data);
    else if (topic === T.actuatorState) await ingestState(cfg.houseId, data);
    else if (topic === T.alert) await ingestAlert(cfg.houseId, data);
    // heartbeat -> TODO(CC): update house online status
  } catch (e) { console.error('mqtt msg error', e); }
});

export function sendCommand(actuator: string, action: string, ttl_sec = 300) {
  mqttClient.publish(T.cmdActuator, JSON.stringify({ actuator, action, ttl_sec }));
}
export function syncConfig(kv: Record<string, number>) {
  mqttClient.publish(T.cmdConfig, JSON.stringify(kv), { retain: true });
}
