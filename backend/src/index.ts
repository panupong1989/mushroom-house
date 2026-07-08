import express from 'express';
import { cfg } from './config.js';
import './mqtt/client.js';          // start mqtt ingest
import { health } from './routes/health.js';
import { houses } from './routes/houses.js';
import { actuators } from './routes/actuators.js';
import { alerts } from './routes/alerts.js';

const app = express();

// CORS: อ่าน origin ที่อนุญาตจาก env CORS_ORIGIN (คั่นด้วย ',' ได้หลายค่า, default '*' สำหรับ dev)
// เตรียมไว้รองรับตอน frontend/backend deploy คนละโดเมนบน Vercel (ดู frontend/README.md)
const allowedOrigins = cfg.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(health);
app.use(houses);
app.use(actuators);
app.use(alerts);

app.listen(cfg.port, () => console.log(`backend on :${cfg.port} (house ${cfg.houseId})`));
