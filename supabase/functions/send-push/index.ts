// ============================================================================
// تطبيق المدرس — Edge Function: send-push (Phase 4 / الخطوة 1)
// ----------------------------------------------------------------------------
// مرسِل Web Push الداخلي الوحيد في النظام. يُستدعى داخلياً فقط:
// • من دوال/جدولة الخطوات التالية (pg_net في الخطوة 3) ومن اختبارات
//   الصيانة — دائماً بترويسة السرّ المشترك x-push-secret (قيمته سرّ
//   Supabase باسم PUSH_INTERNAL_SECRET، لا يخرج من الخادم أبداً).
// • verify_jwt معطّل على مستوى المنصة عمداً لأن المستدعين الداخليين
//   (pg_net/جدولة) لا يحملون JWT مستخدم — البوابة هنا هي السرّ المشترك
//   وحده، وأي طلب بدونه يُرفض 401 قبل أي عمل.
//
// السلوك:
// • يختار الاشتراكات النشطة بالمحددات الممرّرة (subscription_ids أو
//   teacher_id/subscriber_kind/student_id/guardian_id) — بلا أي محدد
//   يُرفض الطلب 400 حتى لا يتحول خطأ برمجي لبثّ عام بالخطأ.
// • يرسل الحمولة (title/body/url/tag/icon) لكل اشتراك عبر مكتبة
//   web-push (تشفير aes128gcm ‏RFC 8291 + توقيع VAPID ‏RFC 8292)،
//   ويسجّل كل نتيجة في push_delivery_log، ويحدّث عدّادات الاشتراك.
// • الاشتراك الميت (خدمة الـ Push ترد 404/410) يُعطَّل فوراً
//   (is_active=false + disabled_reason) ولا يُحذف — يبقى أثره وسجلّه.
// • يعمل بمفتاح الإدارة السري الجديد (SUPABASE_SECRET_KEYS المحقونة
//   من المنصة — مدخل default)، وبرجوع للمحفوظ القديم
//   SUPABASE_SERVICE_ROLE_KEY حتى يُعطَّل، فيتجاوز RLS بتصميمه
//   كقناة داخلية (ترحيل المفاتيح 3A-695 — نمط نونو المثبت).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
// SEC-L7 (تابع): لا عنوان اتصال افتراضي صامت — إن غاب السر يُسجَّل تحذير
// في سجلات الدالة ويُستخدم العنوان الاحتياطي علناً حتى يُضبط السر.
// خطوة المدير: ضبط سرّ VAPID_SUBJECT على الدالة (بريد اتصال حقيقي).
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";
const VAPID_SUBJECT_FALLBACK = "mailto:admin@example.com";
const PUSH_INTERNAL_SECRET = Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";

// مفاتيح المشروع السرية الجديدة (sb_secret_*) — تحقنها المنصة JSON
// بأسمائها في SUPABASE_SECRET_KEYS. مفتاح الإدارة هو "default"،
// وبغيابه نرجع للمفتاح القديم المحقون (صالح حتى تعطيل القديم).
function secretKeys(): Record<string, string> {
  try {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) out[name] = value;
    }
    return out;
  } catch {
    return {}; // بيئة بلا مفاتيح جديدة — يبقى الرجوع للقديم وحده
  }
}
const SERVICE_KEY = secretKeys()["default"] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  if (!VAPID_SUBJECT) {
    console.warn(
      "send-push: VAPID_SUBJECT secret is not set — using the placeholder contact; set the VAPID_SUBJECT secret (SEC-L7).",
    );
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || VAPID_SUBJECT_FALLBACK,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

interface SendRequest {
  payload: PushPayload;
  subscription_ids?: string[];
  teacher_id?: string;
  subscriber_kind?: "teacher" | "guardian" | "student";
  student_id?: string;
  guardian_id?: string;
}

interface SubRow {
  id: string;
  teacher_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

/** مقارنة ثابتة الزمن لسرّ الصيانة (SEC-L7) — بلا خروج مبكر عند أول اختلاف */
function secretEquals(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const maxLen = Math.max(provided.length, expected.length);
  let diff = provided.length ^ expected.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!PUSH_INTERNAL_SECRET || !secretEquals(req.headers.get("x-push-secret"), PUSH_INTERNAL_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "vapid keys not configured" }, 500);
  }

  let body: SendRequest;
  try {
    body = (await req.json()) as SendRequest;
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const payload = body?.payload;
  if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") {
    return json({ error: "payload.title and payload.body are required" }, 400);
  }
  const hasSelector =
    (Array.isArray(body.subscription_ids) && body.subscription_ids.length > 0) ||
    typeof body.teacher_id === "string" ||
    typeof body.student_id === "string" ||
    typeof body.guardian_id === "string";
  if (!hasSelector) {
    return json({ error: "at least one recipient selector is required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    SERVICE_KEY,
  );

  let query = supabase
    .from("push_subscriptions")
    .select("id, teacher_id, endpoint, p256dh, auth, failure_count")
    .eq("is_active", true);
  if (Array.isArray(body.subscription_ids) && body.subscription_ids.length > 0) {
    query = query.in("id", body.subscription_ids);
  }
  if (body.teacher_id) query = query.eq("teacher_id", body.teacher_id);
  if (body.subscriber_kind) query = query.eq("subscriber_kind", body.subscriber_kind);
  if (body.student_id) query = query.eq("student_id", body.student_id);
  if (body.guardian_id) query = query.eq("guardian_id", body.guardian_id);

  const { data, error } = await query;
  if (error) return json({ error: `subscription lookup failed: ${error.message}` }, 500);
  const subs = (data ?? []) as SubRow[];

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    icon: payload.icon ?? "/icon-192.png",
  });

  let sent = 0;
  let gone = 0;
  let failed = 0;
  const results: { id: string; status: string; http_status: number | null }[] = [];

  for (const sub of subs) {
    const logBase = {
      subscription_id: sub.id,
      teacher_id: sub.teacher_id,
      endpoint_host: endpointHost(sub.endpoint),
      title: payload.title,
    };
    try {
      const res = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        { TTL: 3600 },
      );
      sent += 1;
      results.push({ id: sub.id, status: "sent", http_status: res.statusCode });
      await supabase.from("push_delivery_log").insert({
        ...logBase,
        status: "sent",
        http_status: res.statusCode,
      });
      await supabase
        .from("push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
    } catch (err) {
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? ((err as { statusCode: number }).statusCode as number)
          : null;
      const errText = err instanceof Error ? err.message : String(err);
      if (statusCode === 404 || statusCode === 410) {
        // اشتراك ميت عند خدمة الـ Push: تعطيل فوري (تنظيف) بلا حذف
        gone += 1;
        results.push({ id: sub.id, status: "gone", http_status: statusCode });
        await supabase.from("push_delivery_log").insert({
          ...logBase,
          status: "gone",
          http_status: statusCode,
          error: errText.slice(0, 500),
        });
        await supabase
          .from("push_subscriptions")
          .update({
            is_active: false,
            disabled_at: new Date().toISOString(),
            disabled_reason: `push service returned ${statusCode}`,
            last_failure_at: new Date().toISOString(),
            failure_count: sub.failure_count + 1,
          })
          .eq("id", sub.id);
      } else {
        failed += 1;
        results.push({ id: sub.id, status: "failed", http_status: statusCode });
        await supabase.from("push_delivery_log").insert({
          ...logBase,
          status: "failed",
          http_status: statusCode,
          error: errText.slice(0, 500),
        });
        await supabase
          .from("push_subscriptions")
          .update({
            last_failure_at: new Date().toISOString(),
            failure_count: sub.failure_count + 1,
          })
          .eq("id", sub.id);
      }
    }
  }

  return json({ matched: subs.length, sent, gone, failed, results });
});
