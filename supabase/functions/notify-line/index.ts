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
//   WEBHOOK_SECRET             = (optional) ถ้าตั้ง ต้องส่ง header x-webhook-secret ให้ตรง (กันเรียกมั่ว)
//
// ลำดับการตัดสินใจว่าจะส่งเข้า LINE ไหม (migration 015):
//   1) อ่าน alert_config.notify_line ของ (house_id, code) -> ถ้าอ่านได้ ใช้ค่านี้เป็นคำตอบสุดท้าย
//      (ไม่เอา LINE_MIN_SEVERITY มาคิดต่อ — ไม่งั้นตั้งใน UI แล้วโดน secret บล็อกเงียบๆ อีก)
//   2) อ่านได้แต่ไม่มีแถวของ code นั้น -> ส่ง (fail-safe: ยอมส่งเกินดีกว่าพลาดแจ้งเตือน)
//   3) อ่าน DB ไม่ได้เลย -> ถอยไปใช้ LINE_MIN_SEVERITY แบบเดิม

interface AlertRecord {
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
    return new Response(JSON.stringify({ skipped: true, severity: sev, decidedBy }), { status: 200 });
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
