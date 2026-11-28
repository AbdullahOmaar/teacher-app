// ============================================================================
// تطبيق المدرس — Edge Function: send-fcm (فيز 1 فلاتر — F1-T8)
// ----------------------------------------------------------------------------
// مرسِل FCM الوحيد لأجهزة التطبيق الأصلي. يُستدعى داخلياً فقط بسرّ مشترك
// (x-push-secret = PUSH_INTERNAL_SECRET) — verify_jwt معطّل على مستوى
// المنصة لأن المستدعين الداخليين لا يحملون JWT مستخدم (نمط send-push).
//
// حالة مركونة مصممة (قرار المالك 2026-11-28: FCM مؤجلة لفيز لاحقة):
// بغياب سرّ FCM_SERVICE_ACCOUNT ترد الدالة 503 {error:"push_not_configured"}
// — حالة مقصودة موثقة، لا خطأ خام. التفعيل = ضبط السرّ فقط.
//
// السلوك عند التفعيل:
// • أهداف صريحة فقط (user_ids أو teacher_id عبر عضويات مساحات العمل) —
//   بلا هدف يُرفض 400 حتى لا يتحول خطأ برمجي لبثّ عام.
// • FCM HTTP v1: ‏OAuth2 من حساب الخدمة (JWT ‏RS256) ثم إرسال لكل توكن.
// • توكن ميت (UNREGISTERED) يُحذف من device_push_tokens.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const PUSH_INTERNAL_SECRET: string =
  Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";
const FCM_SERVICE_ACCOUNT = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";

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
    return {};
  }
}
const SERVICE_KEY = secretKeys()["default"] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- OAuth2 من حساب خدمة Firebase (JWT RS256 عبر WebCrypto) ---

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array
    ? data
    : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function fcmAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(signature)}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) throw new Error(`oauth2 token exchange failed: ${resp.status}`);
  const body = await resp.json() as { access_token: string };
  return body.access_token;
}

// --- المعالج ---

interface SendBody {
  user_ids?: string[];
  teacher_id?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // بوابة السرّ المشترك أولاً — قبل أي عمل.
  if (!PUSH_INTERNAL_SECRET || req.headers.get("x-push-secret") !== PUSH_INTERNAL_SECRET) {
    return json(401, { error: "unauthorized" });
  }

  // الحالة المركونة المصممة — لا سرّ FCM بعد (تأجيل المالك).
  if (!FCM_SERVICE_ACCOUNT) {
    return json(503, { error: "push_not_configured" });
  }

  let payload: SendBody;
  try {
    payload = await req.json() as SendBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const title = (payload.title ?? "").trim();
  const messageBody = (payload.body ?? "").trim();
  if (!title || !messageBody) return json(400, { error: "title_and_body_required" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // حسم الأهداف: user_ids صريحة، أو أعضاء مساحة عمل teacher_id.
  let userIds: string[] = Array.isArray(payload.user_ids) ? payload.user_ids : [];
  if (userIds.length === 0 && payload.teacher_id) {
    const { data: owner } = await supabase
      .from("teachers")
      .select("owner_user_id")
      .eq("id", payload.teacher_id)
      .maybeSingle();
    const { data: members } = await supabase
      .from("teacher_members")
      .select("user_id")
      .eq("teacher_id", payload.teacher_id);
    userIds = [
      ...(owner?.owner_user_id ? [owner.owner_user_id as string] : []),
      ...((members ?? []).map((m) => m.user_id as string)),
    ];
  }
  if (userIds.length === 0) return json(400, { error: "no_target" });

  const { data: tokenRows } = await supabase
    .from("device_push_tokens")
    .select("id, token")
    .in("user_id", userIds);
  const tokens = (tokenRows ?? []) as { id: string; token: string }[];
  if (tokens.length === 0) return json(200, { sent: 0, pruned: 0, reason: "no_devices" });

  let sa: { client_email: string; private_key: string; project_id: string };
  try {
    sa = JSON.parse(FCM_SERVICE_ACCOUNT);
  } catch {
    return json(500, { error: "service_account_invalid" });
  }
  const accessToken = await fcmAccessToken(sa);

  let sent = 0;
  let pruned = 0;
  for (const row of tokens) {
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title, body: messageBody },
            data: payload.data ?? {},
          },
        }),
      },
    );
    if (resp.ok) {
      sent++;
      continue;
    }
    const errText = await resp.text();
    if (errText.includes("UNREGISTERED") || errText.includes("INVALID_ARGUMENT")) {
      await supabase.from("device_push_tokens").delete().eq("id", row.id);
      pruned++;
    }
  }
  return json(200, { sent, pruned });
});
