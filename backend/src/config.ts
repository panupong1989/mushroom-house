import 'dotenv/config';
export const cfg = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL!,
  mqttUrl: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
  mqttUser: process.env.MQTT_USERNAME || undefined,
  mqttPass: process.env.MQTT_PASSWORD || undefined,
  mqttBase: process.env.MQTT_BASE_TOPIC ?? 'mush',
  houseId: process.env.HOUSE_ID ?? 'house-01',
  // origin ที่อนุญาตให้ frontend เรียก API ข้ามโดเมนได้ (เช่น frontend/backend คนละโดเมนบน Vercel)
  // '*' = อนุญาตทุก origin (default, dev only) หรือระบุหลายค่าคั่นด้วย ',' เช่น https://myapp.vercel.app
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
