import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { syncConfig } from '../mqtt/client.js';
import { validateSetpoints } from '../services/validateConfig.js';
export const houses = Router();

houses.get('/houses/:id', async (req, res) => {
  const r = await q('SELECT * FROM houses WHERE id=$1', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'not found' });
  res.json(r.rows[0]);
});

// ค่าปัจจุบันทุกเซนเซอร์ (ล่าสุด — รวม bed_temp + water_level) + สถานะ actuator ล่าสุด + mode ล่าสุด
houses.get('/houses/:id/latest', async (req, res) => {
  const sensors = await q(
    `SELECT s.id,s.kind,s.location,r.metric,r.value,r.ts
     FROM sensors s JOIN LATERAL (
       SELECT metric,value,ts FROM sensor_readings WHERE sensor_id=s.id ORDER BY ts DESC LIMIT 2
     ) r ON true WHERE s.house_id=$1`, [req.params.id]);
  const acts = await q(
    `SELECT a.kind, e.state, e.ts FROM actuators a JOIN LATERAL (
       SELECT state,ts FROM actuator_events WHERE actuator_id=a.id ORDER BY ts DESC LIMIT 1
     ) e ON true WHERE a.house_id=$1`, [req.params.id]);
  const house = await q('SELECT last_mode, last_mode_ts FROM houses WHERE id=$1', [req.params.id]);
  res.json({
    sensors: sensors.rows,
    actuators: acts.rows,
    mode: house.rows[0]?.last_mode ?? null,
    mode_ts: house.rows[0]?.last_mode_ts ?? null,
  });
});

houses.get('/houses/:id/config', async (req, res) => {
  const p = (req.query.profile as string) ?? 'fruiting';
  const r = await q('SELECT key,value FROM control_config WHERE house_id=$1 AND profile=$2', [req.params.id, p]);
  res.json(Object.fromEntries(r.rows.map(x => [x.key, Number(x.value)])));
});

const cfgSchema = z.record(z.number());
houses.put('/houses/:id/config', async (req, res) => {
  const p = (req.query.profile as string) ?? 'fruiting';
  const parsed = cfgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const current = await q('SELECT key,value FROM control_config WHERE house_id=$1 AND profile=$2', [req.params.id, p]);
  const merged: Record<string, number> = Object.fromEntries(current.rows.map(x => [x.key, Number(x.value)]));
  Object.assign(merged, parsed.data);

  const errors = validateSetpoints(merged);
  if (errors.length) return res.status(400).json({ error: errors });

  for (const [key, value] of Object.entries(parsed.data)) {
    await q(`INSERT INTO control_config (house_id,profile,key,value) VALUES ($1,$2,$3,$4)
             ON CONFLICT (house_id,profile,key) DO UPDATE SET value=EXCLUDED.value`,
      [req.params.id, p, key, value]);
  }
  syncConfig(parsed.data);   // push ลง ESP32
  res.json({ ok: true });
});

houses.post('/houses/:id/profile', async (req, res) => {
  const profile = String(req.body?.profile ?? '');
  if (!['spawn_run', 'fruiting'].includes(profile)) return res.status(400).json({ error: 'bad profile' });
  await q('UPDATE houses SET active_profile=$2 WHERE id=$1', [req.params.id, profile]);
  res.json({ ok: true });
});
