// สคริปต์จำลอง ESP32 ยิง telemetry ปลอมเข้า MQTT สำหรับทดสอบ backend end-to-end โดยไม่ต้องมีบอร์ดจริง
// รัน: npm run mock (อ่าน MQTT_URL/MQTT_BASE_TOPIC/HOUSE_ID จาก .env เดียวกับ backend ผ่าน src/config.ts)
import mqtt from 'mqtt';
import { cfg } from '../src/config.js';
import { T } from '../src/mqtt/topics.js';

const AIR_ADDR = [1, 2, 3] as const;
const BED_ADDR = ['28-0000-01', '28-0000-02', '28-0000-03'] as const; // ต้องตรงกับ db/seed.sql
const MODE_FRUITING = 3; // firmware Mode enum (types.h): M_FRUITING

const TICK_MS = 5000;
const HEARTBEAT_EVERY_TICKS = 6; // ~30s
const ALERT_CHANCE = 0.05;

const ALERT_POOL = [
  { code: 'LOW_WATER', severity: 'warn', message: 'ระดับน้ำต่ำกว่าขั้นต่ำ' },
  { code: 'HIGH_TEMP', severity: 'critical', message: 'อุณหภูมิอากาศสูงเกินขีดจำกัด' },
  { code: 'SENSOR_TIMEOUT', severity: 'warn', message: 'อ่านค่าเซนเซอร์ RS485 ไม่ได้' },
] as const;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function round1(v: number) {
  return Math.round(v * 10) / 10;
}

// -1 (เย็นสุด ~ตี 3) .. +1 (ร้อนสุด ~เที่ยง) วนรอบ 24 ชม.
export function dayNightFactor(nowMs: number): number {
  const hourOfDay = (nowMs / 3_600_000) % 24;
  return Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
}

export function simulateSnapshot(nowMs: number) {
  const day = dayNightFactor(nowMs);
  const wobble = Math.sin(nowMs / 45_000); // แกว่งเร็วเลียนแบบ noise เซนเซอร์จริง

  const airTempBase = 30 + day * 3 + wobble; // ~26-34
  const airRhBase = 86 - day * 4 + wobble * 2; // ~80-92, ชื้นขึ้นตอนกลางคืน

  const air = AIR_ADDR.map((addr, i) => ({
    addr,
    t: round1(clamp(airTempBase + (i - 1) * 0.4, 26, 34)),
    rh: round1(clamp(airRhBase - (i - 1) * 1.2, 80, 92)),
    ok: true,
  }));

  const bedTempBase = 33 + day * 1.5 + wobble * 0.5; // กองเห็ดอุ่นกว่าอากาศเล็กน้อย
  const bed = BED_ADDR.map((addr, i) => ({
    addr,
    temp: round1(bedTempBase + (i - 1) * 0.3),
    ok: true,
  }));

  const air_temp = round1(air.reduce((s, a) => s + a.t, 0) / air.length);
  const air_rh = round1(air.reduce((s, a) => s + a.rh, 0) / air.length);
  const bed_max = round1(Math.max(...bed.map(b => b.temp)));

  return {
    ts: Math.floor(nowMs / 1000),
    mode: MODE_FRUITING,
    water_ok: true,
    air_temp,
    air_rh,
    bed_max,
    air,
    bed,
  };
}

export function simulateActuatorState(snapshot: ReturnType<typeof simulateSnapshot>) {
  // สะท้อน interlock จริงจาก docs/03-control-logic.md: ห้าม mist ถ้า T_air < 27.5, ห้าม heater+mist พร้อมกัน
  const mistAllowed = snapshot.air_temp >= 27.5;
  const mist = mistAllowed && snapshot.air_rh < 85;
  const heater = snapshot.air_temp < 28 && !mist;
  const exhaust = snapshot.air_temp > 33;
  const circulation = Math.abs(snapshot.air_temp - snapshot.bed_max) > 2;
  return { mist, heater, exhaust, light: isDaylight(snapshot.ts * 1000), circulation };
}

function isDaylight(nowMs: number) {
  const hour = new Date(nowMs).getHours();
  return hour >= 6 && hour < 18;
}

function maybeAlert() {
  if (Math.random() > ALERT_CHANCE) return null;
  return ALERT_POOL[Math.floor(Math.random() * ALERT_POOL.length)];
}

function main() {
  const client = mqtt.connect(cfg.mqttUrl, { username: cfg.mqttUser, password: cfg.mqttPass });
  let tick = 0;

  client.on('connect', () => {
    console.log(`[mock] connected -> ${cfg.mqttUrl}, house=${cfg.houseId}, ทุก ${TICK_MS / 1000}s (Ctrl+C เพื่อหยุด)`);
    publishOnce();
    const timer = setInterval(publishOnce, TICK_MS);
    process.on('SIGINT', () => {
      clearInterval(timer);
      client.end(() => process.exit(0));
    });
  });

  client.on('error', err => console.error('[mock] mqtt error', err.message));

  function publishOnce() {
    const now = Date.now();
    const snapshot = simulateSnapshot(now);
    const state = simulateActuatorState(snapshot);

    client.publish(T.telemetry, JSON.stringify(snapshot));
    client.publish(T.actuatorState, JSON.stringify(state));
    console.log(
      `[mock] telemetry air_temp=${snapshot.air_temp} air_rh=${snapshot.air_rh} bed_max=${snapshot.bed_max} mode=FRUITING`
    );

    tick += 1;
    if (tick % HEARTBEAT_EVERY_TICKS === 0) {
      client.publish(
        T.heartbeat,
        JSON.stringify({ uptime: Math.floor(process.uptime()), rssi: -50 - Math.floor(Math.random() * 20), fw: '0.1.0-mock' }),
        { retain: true }
      );
    }

    const alert = maybeAlert();
    if (alert) {
      client.publish(T.alert, JSON.stringify({ ts: snapshot.ts, ...alert }));
      console.log(`[mock] alert -> ${alert.code}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
