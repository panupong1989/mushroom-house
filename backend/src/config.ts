import 'dotenv/config';
export const cfg = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL!,
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  mqttUser: process.env.MQTT_USERNAME || undefined,
  mqttPass: process.env.MQTT_PASSWORD || undefined,
  mqttBase: process.env.MQTT_BASE_TOPIC ?? 'mush',
  houseId: process.env.HOUSE_ID ?? 'house-01',
};
