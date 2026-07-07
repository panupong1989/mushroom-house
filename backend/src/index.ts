import express from 'express';
import { cfg } from './config.js';
import './mqtt/client.js';          // start mqtt ingest
import { health } from './routes/health.js';
import { houses } from './routes/houses.js';
import { actuators } from './routes/actuators.js';
import { alerts } from './routes/alerts.js';

const app = express();
app.use(express.json());
app.use(health);
app.use(houses);
app.use(actuators);
app.use(alerts);

app.listen(cfg.port, () => console.log(`backend on :${cfg.port} (house ${cfg.houseId})`));
