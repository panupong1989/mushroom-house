// Supabase Edge Function: push แจ้งเตือนเข้า LINE (Messaging API)
// เรียกโดย Database Webhook เมื่อ INSERT ตาราง `alerts` (ตั้งใน dashboard — ดู README.md ในโฟลเดอร์นี้)
//
// secrets (ตั้งด้วย `supabase secrets set ...` — ห้าม commit):
//   LINE_CHANNEL_ACCESS_TOKEN  = channel access token (long-lived) จาก LINE Developers → Messaging API
//   LINE_TO_IDS                = (optional) userId/groupId ปลายทาง คั่นด้วย , — ถ้า "ไม่ตั้ง" จะใช้
//                                broadcast ส่งหาเพื่อนทุกคนของ OA แทน (ไม่ต้องไปหา userId ให้ยุ่งยาก
//                                เหมาะกับ OA ส่วนตัวที่มีแค่เจ้าของ+คนในบ้านเป็นเพื่อน)
//   LINE_MIN_SEVERITY          = (optional) info|warn|critical — ใช้เป็น "ทางสำรอง" เท่านั้น
//                                (ดูหมายเหตุเรื่องลำดับการตัดสินใจด้านล่าง) default critical
//   LINE_DEDUP_MINUTES         = (optional) กันข้อความซ้ำ: ถ้า (house_id, code) เดิมเพิ่งมี alert
//                                ภายในกี่นาที ให้ข้ามไม่ push ซ้ำ · default 15 · ตั้ง 0 = ปิด dedup
//   WEBHOOK_SECRET             = (optional) ถ้าตั้ง ต้องส่ง header x-webhook-secret ให้ตรง (กันเรียกมั่ว)
//
// ลำดับการตัดสินใจว่าจะส่งเข้า LINE ไหม (migration 015):
//   1) อ่าน alert_config.notify_line ของ (house_id, code) -> ถ้าอ่านได้ ใช้ค่านี้เป็นคำตอบสุดท้าย
//      (ไม่เอา LINE_MIN_SEVERITY มาคิดต่อ — ไม่งั้นตั้งใน UI แล้วโดน secret บล็อกเงียบๆ อีก)
//   2) อ่านได้แต่ไม่มีแถวของ code นั้น -> ส่ง (fail-safe: ยอมส่งเกินดีกว่าพลาดแจ้งเตือน)
//   3) อ่าน DB ไม่ได้เลย -> ถอยไปใช้ LINE_MIN_SEVERITY แบบเดิม
//   4) ผ่านข้อ 1-3 แล้ว ค่อยเช็ค dedup (ด้านล่าง)
//
// ทำไมต้อง dedup (10 ส.ค. 69):
//   ค่าที่แกว่งคาบเกณฑ์ทำให้ ESP32 ยิง alert ซ้ำรัวๆ — HOT เกิด 3 แถวใน 36 วิ (id 184-186)
//   ตอนอุณหภูมิเด้ง 32.9 <-> 33.0 ที่เกณฑ์ 33.0 · เฟิร์มแวร์ตรวจ "ขอบขาขึ้น" แต่ไม่มี hysteresis
//   ค่าตกใต้เกณฑ์รอบเดียวก็รีเซ็ตขอบแล้วยิงใหม่ (RH_HIGH เคยยิง 18 ครั้งใน 12 นาที)
//   ต้นเหตุจริงแก้ที่เฟิร์มแวร์ (hysteresis + cooldown) แต่ต้องเอาบอร์ดไปแฟลชหน้างาน (ไม่มี OTA)
//   ชั้นนี้จึงกันที่ปลายทางไว้ก่อน — และถึงแฟลชแล้วก็ยังคุ้มเก็บไว้เป็นตาข่ายชั้นสอง

interface AlertRecord {
  id?: number | string;
  severity?: string;
  code?: string;
  message?: string | null;
  ts?: string;
  house_id?: string;
}

const SEV_RANK: Record<string, number> = { info: 0, warn: 1, critical: 2 };
const ICON: Record<string, string> = { info: '🔵', warn: '🟠', critical: '🔴' };

// ให้ข้อความใน LINE อ่านรู้เรื่องเลย ไม่ต้องแปลโค้ดเอง (ตรงกับ ALERT_CODE_LABEL ใน frontend/lib/alerts.ts)
const CODE_LABEL: Record<string, string> = {
  LOW_WATER: 'ระดับน้ำต่ำ',
  BED_OVERHEAT: 'กองร้อนเกิน',
  BED_LOW: 'กองต่ำเกิน',
  HOT: 'อากาศร้อนอันตราย',
  COLD: 'อากาศต่ำเกิน',
  RH_HIGH: 'ความชื้นสูงเกิน',
  RH_LOW: 'ความชื้นต่ำเกิน',
  SENSOR_LOST: 'เซนเซอร์หลุด',
};

// อ่าน alert_config.notify_line ของ code นี้ (migration 015) ผ่าน PostgREST ด้วย service_role
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY เป็น env ที่ Supabase ใส่ให้ Edge Function อัตโนมัติ
// คืน true/false = อ่านได้ · คืน null = อ่านไม่ได้ (ให้ caller ถอยไปใช้ LINE_MIN_SEVERITY)
async function notifyLineFlag(houseId: string, code: string): Promise<boolean | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !houseId || !code) return null;
  try {
    const q =
      `${url}/rest/v1/alert_config?house_id=eq.${encodeURIComponent(houseId)}` +
      `&code=eq.${encodeURIComponent(code)}&select=notify_line`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return null; // รวมกรณี 42703 = ยังไม่ได้รัน migration 015
    const rows = (await r.json()) as { notify_line?: boolean }[];
    if (!Array.isArray(rows)) return null;
    if (rows.length === 0) return true; // ไม่มีแถวของ code นี้ = ส่ง (fail-safe ไม่เงียบ)
    return rows[0].notify_line !== false;
  } catch {
    return null;
  }
}

// มี alert (house_id, code) เดิม "ก่อนหน้าแถวนี้" ภายในกี่นาทีที่กำหนดไหม -> true = ซ้ำ ไม่ต้อง push
// ตัดแถวปัจจุบันออกด้วย id (webhook ยิงหลัง INSERT แถวนี้ลง DB แล้ว จะนับตัวเองเป็นซ้ำไม่ได้)
// อ่านไม่ได้/พลาด -> คืน false = ส่ง (fail-safe เหมือนเดิม: ยอมส่งเกินดีกว่าเงียบ)
async function isDuplicate(rec: AlertRecord, windowMin: number): Promise<boolean> {
  if (windowMin <= 0) return false;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !rec.house_id || !rec.code) return false;

  // อิงเวลาของแถวนี้เป็นหลัก (เผื่อ webhook มาช้า) ไม่งั้นใช้เวลาปัจจุบัน
  const baseMs = rec.ts ? Date.parse(rec.ts) : Date.now();
  const since = new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) - windowMin * 60_000).toISOString();

  // กันแถวตัวเอง: มี id ใช้ id.lt (แม่นกว่า) · ไม่มีก็ใช้ ts.lt
  const exclude =
    rec.id !== undefined && rec.id !== null
      ? `&id=lt.${encodeURIComponent(String(rec.id))}`
      : rec.ts
        ? `&ts=lt.${encodeURIComponent(rec.ts)}`
        : '';
  if (!exclude) return false; // ไม่รู้ว่าแถวไหนคือตัวเอง -> ไม่เสี่ยงกดทิ้ง

  try {
    const q =
      `${url}/rest/v1/alerts?house_id=eq.${encodeURIComponent(rec.house_id)}` +
      `&code=eq.${encodeURIComponent(rec.code)}&ts=gte.${encodeURIComponent(since)}${exclude}` +
      `&select=id&order=id.desc&limit=1`;
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return false;
    const rows = (await r.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // กันเรียกมั่ว (ถ้าตั้ง WEBHOOK_SECRET) — Database Webhook ใส่ header นี้ให้ได้
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  // Database Webhook ส่ง { type, table, schema, record, old_record }
  const record: AlertRecord = ((payload as { record?: AlertRecord })?.record ?? payload ?? {}) as AlertRecord;

  const sev = (record.severity ?? '').toLowerCase();

  // ตัดสินใจว่าจะส่งไหม — DB ชนะ env (ดูลำดับด้านบนสุดของไฟล์)
  const flag = await notifyLineFlag(record.house_id ?? '', record.code ?? '');
  let decidedBy: 'alert_config' | 'LINE_MIN_SEVERITY';
  let shouldSend: boolean;
  if (flag !== null) {
    decidedBy = 'alert_config';
    shouldSend = flag;
  } else {
    decidedBy = 'LINE_MIN_SEVERITY';
    const minSev = (Deno.env.get('LINE_MIN_SEVERITY') ?? 'critical').toLowerCase();
    shouldSend = (SEV_RANK[sev] ?? -1) >= (SEV_RANK[minSev] ?? 2);
  }
  if (!shouldSend) {
    return new Response(JSON.stringify({ skipped: true, reason: 'notify_line=false', severity: sev, decidedBy }), {
      status: 200,
    });
  }

  // กันข้อความซ้ำจากค่าที่แกว่งคาบเกณฑ์ — ยกเว้นปุ่ม 🧪 ทดสอบ (ต้องเด้งทุกครั้งที่กด ไม่งั้นเทสแล้วงง)
  const isTest = (record.message ?? '').includes('🧪');
  const dedupMin = Number(Deno.env.get('LINE_DEDUP_MINUTES') ?? '15');
  const windowMin = Number.isFinite(dedupMin) ? dedupMin : 15;
  if (!isTest && (await isDuplicate(record, windowMin))) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'duplicate', code: record.code, withinMinutes: windowMin }),
      { status: 200 },
    );
  }

  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const toIds = (Deno.env.get('LINE_TO_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token) {
    return new Response('missing LINE_CHANNEL_ACCESS_TOKEN', { status: 500 });
  }

  const icon = ICON[sev] ?? '🔔';
  const when = record.ts
    ? new Date(record.ts).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })
    : '';
  const text =
    `${icon} แจ้งเตือนโรงเห็ด (${record.house_id ?? '-'})\n` +
    `${CODE_LABEL[record.code ?? ''] ?? record.code ?? 'ALERT'}` +
    (record.message ? `\n${record.message}` : '') +
    (when ? `\n🕒 ${when}` : '');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const messages = [{ type: 'text', text }];

  // ไม่ได้ตั้ง LINE_TO_IDS → broadcast หาเพื่อนทุกคนของ OA (ไม่ต้องรู้ userId)
  if (toIds.length === 0) {
    const r = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
    }).catch(() => null);
    const status = r?.status ?? 0;
    const ok = status >= 200 && status < 300;
    // อ่าน body ตอน error ด้วย — LINE ตอบเหตุผลมาชัด (เช่น token ผิด / ยังไม่มีเพื่อน)
    const detail = ok ? undefined : await r?.text().catch(() => undefined);
    return new Response(JSON.stringify({ mode: 'broadcast', status, detail, decidedBy }), {
      status: ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = await Promise.all(
    toIds.map((to) =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({ to, messages }),
      })
        .then((r) => ({ to, status: r.status }))
        .catch(() => ({ to, status: 0 }))
    )
  );
  const ok = results.every((r) => r.status >= 200 && r.status < 300);
  return new Response(JSON.stringify({ mode: 'push', sent: results, decidedBy }), {
    status: ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
});
