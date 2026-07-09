// Supabase Edge Function: push แจ้งเตือนเข้า LINE (Messaging API)
// เรียกโดย Database Webhook เมื่อ INSERT ตาราง `alerts` (ตั้งใน dashboard — ดู README.md ในโฟลเดอร์นี้)
//
// secrets (ตั้งด้วย `supabase secrets set ...` — ห้าม commit):
//   LINE_CHANNEL_ACCESS_TOKEN  = channel access token (long-lived) จาก LINE Developers → Messaging API
//   LINE_TO_IDS                = userId/groupId ปลายทาง คั่นด้วย , (push ทีละ id รองรับทั้ง user และ group)
//   LINE_MIN_SEVERITY          = (optional) info|warn|critical — ต่ำกว่านี้ไม่ส่ง (default critical)
//   WEBHOOK_SECRET             = (optional) ถ้าตั้ง ต้องส่ง header x-webhook-secret ให้ตรง (กันเรียกมั่ว)

interface AlertRecord {
  severity?: string;
  code?: string;
  message?: string | null;
  ts?: string;
  house_id?: string;
}

const SEV_RANK: Record<string, number> = { info: 0, warn: 1, critical: 2 };
const ICON: Record<string, string> = { info: '🔵', warn: '🟠', critical: '🔴' };

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

  const minSev = (Deno.env.get('LINE_MIN_SEVERITY') ?? 'critical').toLowerCase();
  const sev = (record.severity ?? '').toLowerCase();
  if ((SEV_RANK[sev] ?? -1) < (SEV_RANK[minSev] ?? 2)) {
    return new Response(JSON.stringify({ skipped: true, severity: sev }), { status: 200 });
  }

  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const toIds = (Deno.env.get('LINE_TO_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token || toIds.length === 0) {
    return new Response('missing LINE_CHANNEL_ACCESS_TOKEN / LINE_TO_IDS', { status: 500 });
  }

  const icon = ICON[sev] ?? '🔔';
  const text =
    `${icon} แจ้งเตือนโรงเห็ด (${record.house_id ?? '-'})\n` +
    `${record.code ?? 'ALERT'}` +
    (record.message ? `\n${record.message}` : '');

  const results = await Promise.all(
    toIds.map((to) =>
      fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      })
        .then((r) => ({ to, status: r.status }))
        .catch(() => ({ to, status: 0 }))
    )
  );
  const ok = results.every((r) => r.status >= 200 && r.status < 300);
  return new Response(JSON.stringify({ sent: results }), {
    status: ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
});
