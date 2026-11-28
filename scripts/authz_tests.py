#!/usr/bin/env python3
"""
اختبارات تفويض آلية دائمة (3A-299 — معيار Engineering & Security Standards §6/§7):
تتحقق حياً من عزل المستأجرين وحرّاس الـ RPC بأربعة أدوار:
مالك (حساب الديمو العام) / مساعد بصلاحية حضور فقط / معلّم آخر / مجهول (anon).

- تعمل على مشروع Supabase الحقيقي لكن ببيانات اختبار مؤقتة فقط (مستخدم
  «معلّم آخر» + مستخدم «مساعد» يُنشآن ويُحذفان في نفس التشغيل)، وتتحقق في
  النهاية أن عدّادات الأساس رجعت كما كانت.
- تتخطى نفسها بنعومة (exit 0 + رسالة SKIP) عندما لا تتوفر بيئة الموصل
  المحلية أو .env.local — حتى يبقى `npm run check` أخضر في CI.
- كلمات مرور حسابات الاختبار تُولّد عشوائياً لكل تشغيل ولا تُطبع أبداً.

التشغيل: npm run test:authz
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import struct
import subprocess
import sys
import tempfile
import time
import uuid

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
DEMO_EMAIL = "demo@teacher-app.com"
DEMO_PASSWORD = "Demo123456"  # حساب ديمو عام بقرار المالك — ليس سراً

FAILURES = []
CHECKS = 0


def check(name, cond, detail=""):
    global CHECKS
    CHECKS += 1
    if cond:
        print(f"  PASS {name}")
    else:
        print(f"  FAIL {name} {detail}")
        FAILURES.append(name)


def skip(reason):
    print(f"SKIP authz tests: {reason}")
    sys.exit(0)


def load_env():
    path = os.path.join(REPO, ".env.local")
    if not os.path.exists(path):
        skip(".env.local غير موجود (بيئة CI) — الاختبارات الحية تحتاج بيئة المطوّر المحلية")
    env = {}
    for line in open(path, encoding="utf8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    url = env.get("VITE_SUPABASE_URL", "")
    anon = env.get("VITE_SUPABASE_ANON_KEY", "")
    if not url or not anon:
        skip("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ناقصة في .env.local")
    ref = url.split("//", 1)[-1].split(".", 1)[0]
    return url, anon, ref


def sql(ref, query):
    """SQL عبر Management API بواسطة أداة الموصل (بيانات اعتماد بديلة آمنة)."""
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", ref, query],
        capture_output=True, text=True, timeout=120,
    )
    if out.returncode != 0:
        # ذيل الخطأ لا رأسه: تتبّع أداة الموصل يضع رسالة PostgreSQL
        # الحقيقية (HTTP 400 + نص الخطأ) في آخر سطر، والاقتطاع من
        # الرأس كان يدفنها — تشغيلة 2026-11-28 00:40 انهارت من غير
        # ما يظهر سببها في السجل.
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[-800:]}")
    return json.loads(out.stdout) if out.stdout.strip() else []


def rest(url, anon, method, path, jwt=None, body=None, expect_json=True):
    """REST عبر curl — urllib ينهار أحياناً مع بروكسي الخروج (RemoteDisconnected)."""
    args = [
        "curl", "-sS", "--retry", "3", "--retry-all-errors", "--max-time", "60",
        "-X", method,
        "-H", f"apikey: {anon}",
        "-H", f"Authorization: Bearer {jwt or anon}",
        "-w", "\n%{http_code}",
    ]
    if body is not None:
        args += ["-H", "Content-Type: application/json",
                 "-H", "Prefer: return=representation",
                 "-d", json.dumps(body)]
    args.append(url + path)
    out = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError(f"curl failed: {out.stderr.strip()[:200]}")
    raw, _, code = out.stdout.rpartition("\n")
    status = int(code)
    if not raw:
        return status, {}
    if not expect_json:
        return status, raw
    try:
        return status, json.loads(raw)
    except json.JSONDecodeError:
        return status, {"raw": raw[:200]}


def storage_upload(url, anon, path, content_type, data):
    """رفع Storage خام عبر curl (لبايتات غير JSON) — يرجع (status, body)."""
    fd, tmp = tempfile.mkstemp()
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        args = [
            "curl", "-sS", "--retry", "3", "--retry-all-errors", "--max-time", "60",
            "-X", "POST",
            "-H", f"apikey: {anon}",
            "-H", f"Authorization: Bearer {anon}",
            "-H", f"Content-Type: {content_type}",
            "--data-binary", f"@{tmp}",
            "-w", "\n%{http_code}",
            f"{url}/storage/v1/object/payment-proofs/{path}",
        ]
        out = subprocess.run(args, capture_output=True, text=True, timeout=120)
        if out.returncode != 0:
            raise RuntimeError(f"curl failed: {out.stderr.strip()[:200]}")
        raw, _, code = out.stdout.rpartition("\n")
        return int(code), raw[:300]
    finally:
        os.unlink(tmp)


def storage_delete(url, anon, jwt, path):
    """حذف كائن Storage عبر API (الحذف المباشر من storage.objects محظور
    بخادم Supabase نفسه — storage.protect_delete)."""
    args = [
        "curl", "-sS", "--retry", "3", "--retry-all-errors", "--max-time", "60",
        "-X", "DELETE",
        "-H", f"apikey: {anon}",
        "-H", f"Authorization: Bearer {jwt}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps({"prefixes": [path]}),
        "-w", "\n%{http_code}",
        f"{url}/storage/v1/object/payment-proofs",
    ]
    out = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise RuntimeError(f"curl failed: {out.stderr.strip()[:200]}")
    _, _, code = out.stdout.rpartition("\n")
    return int(code)


def sign_in(url, anon, email, password):
    status, body = rest(
        url, anon, "POST", "/auth/v1/token?grant_type=password",
        body={"email": email, "password": password},
    )
    if status != 200 or "access_token" not in body:
        raise RuntimeError(f"sign-in failed for fixture user: HTTP {status}")
    return body["access_token"], body["user"]["id"]


def create_user_sql(ref, email, password):
    pw = password.replace("'", "''")
    em = email.replace("'", "''")
    rows = sql(
        ref,
        "insert into auth.users (instance_id, id, aud, role, email, "
        "encrypted_password, email_confirmed_at, raw_app_meta_data, "
        "raw_user_meta_data, created_at, updated_at, confirmation_token, "
        "email_change, email_change_token_new, recovery_token) values "
        "('00000000-0000-0000-0000-000000000000', gen_random_uuid(), "
        f"'authenticated', 'authenticated', '{em}', "
        f"crypt('{pw}', gen_salt('bf')), now(), "
        '\'{"provider":"email","providers":["email"]}\', \'{}\', now(), now(), '
        "'', '', '', '') returning id",
    )
    uid = rows[0]["id"]
    sql(
        ref,
        "insert into auth.identities (id, user_id, provider_id, identity_data, "
        "provider, last_sign_in_at, created_at, updated_at) values "
        f"(gen_random_uuid(), '{uid}', '{uid}', "
        f"jsonb_build_object('sub', '{uid}', 'email', '{em}'), 'email', "
        "now(), now(), now())",
    )
    return uid


def totp_code(secret_b32, digits=6, when=None):
    """TOTP خالص بايثون (RFC 6238 فوق RFC 4226: HMAC-SHA1، خطوة 30
    ثانية، اقتطاع ديناميكي، آخر `digits` رقماً). مُحقَّق من متجهات
    RFC 6238 Appendix B (SHA-1، السر ASCII '12345678901234567890'):
    T=59 → 287082، T=1111111109 → 081804، T=1111111111 → 050471،
    T=1234567890 → 005924، T=2000000000 → 279037، T=20000000000 →
    353130 (6 أرقام) — والتحقق المستقل بـ openssl أعطى نفس النواتج."""
    key = base64.b32decode(secret_b32.upper())
    counter = int((time.time() if when is None else when) // 30)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10 ** digits)).zfill(digits)


def purge_fixture_users(ref):
    """تنظيف وقائي قبل الأساس وقبل أي تجهيزات: حذف بقايا مستخدمي
    التجهيزات (authz-*@teacher-app.test) من تشغيلة سابقة ماتت قبل
    بلوغ تنظيفها — موت العملية أو استبدال الجهاز لا يمرّ بالـ
    finally، والتنظيف الختامي يحذف بمعرّفات متغيرات لا توجد إلا
    إن نجح الإنشاء. من دون هذا التنظيف يصطدم أول إنشاء في
    التشغيلة التالية ببريد مكرر (users_email_partial_key)
    وتنهار التشغيلة كلها عند أول تجهيزة — وهو بالضبط ما حدث
    في تشغيلة 2026-11-28 00:40 (بقايا تشغيلة 2026-11-27 19:20Z)."""
    rows = sql(ref, "select id from auth.users "
                    "where email like 'authz-%@teacher-app.test'")
    ids = [r["id"] for r in rows]
    if not ids:
        return
    in_list = ",".join(f"'{u}'" for u in ids)
    sql(ref, f"delete from teacher_members where user_id in ({in_list})")
    sql(ref, f"delete from teachers where owner_user_id in ({in_list})")
    sql(ref, f"delete from auth.users where id in ({in_list})")
    print(f"  purged {len(ids)} leftover fixture user(s) from a previous run")


def baseline(ref):
    rows = sql(
        ref,
        "select (select count(*) from teachers) as teachers, "
        "(select count(*) from students) as students, "
        "(select count(*) from groups) as groups_, "
        "(select count(*) from invoices) as invoices, "
        "(select count(*) from teacher_members) as members, "
        "(select count(*) from auth.users) as users",
    )
    return rows[0]


def main():
    if not os.path.exists(HELPER):
        skip("أداة موصل Supabase غير موجودة في هذه البيئة")
    url, anon, ref = load_env()
    purge_fixture_users(ref)
    base0 = baseline(ref)
    print(f"authz tests against {ref} — baseline: {base0}")

    pw_other = secrets.token_urlsafe(18)
    pw_asst = secrets.token_urlsafe(18)
    other_uid = asst_uid = self_uid = None
    try:
        # ---------- fixtures ----------
        demo_jwt, demo_uid = sign_in(url, anon, DEMO_EMAIL, DEMO_PASSWORD)
        demo_teacher = sql(
            ref, f"select id from teachers where owner_user_id = '{demo_uid}'"
        )[0]["id"]
        demo_student = sql(
            ref,
            f"select id from students where teacher_id = '{demo_teacher}' limit 1",
        )[0]["id"]

        other_uid = create_user_sql(ref, "authz-other@teacher-app.test", pw_other)
        sql(
            ref,
            "insert into teachers (owner_user_id, display_name) values "
            f"('{other_uid}', 'authz fixture')",
        )
        other_jwt, _ = sign_in(url, anon, "authz-other@teacher-app.test", pw_other)

        asst_uid = create_user_sql(ref, "authz-asst@teacher-app.test", pw_asst)
        sql(
            ref,
            "insert into teacher_members (teacher_id, user_id, role, "
            "permissions, status) values "
            f"('{demo_teacher}', '{asst_uid}', 'assistant', "
            '\'{"can_take_attendance": true}\', \'active\')',
        )
        asst_jwt, _ = sign_in(url, anon, "authz-asst@teacher-app.test", pw_asst)

        # ---------- ANON ----------
        print("ANON:")
        s, b = rest(url, anon, "GET", "/rest/v1/students?select=id")
        check("anon reads no students", s == 200 and b == [], f"got {s} {str(b)[:80]}")
        s, b = rest(url, anon, "GET", "/rest/v1/invoices?select=id")
        check("anon reads no invoices", s == 200 and b == [], f"got {s}")
        s, b = rest(
            url, anon, "POST", "/rest/v1/students",
            body={"teacher_id": demo_teacher, "name": "authz intruder"},
        )
        check("anon cannot insert a student", s in (401, 403), f"got {s}")
        s, b = rest(
            url, anon, "POST", "/rest/v1/rpc/generate_teacher_sessions",
            body={"p_teacher_id": demo_teacher, "p_months": []},
        )
        check("anon cannot call generate_teacher_sessions", s in (401, 403, 404), f"got {s}")
        s, b = rest(
            url, anon, "POST", "/rest/v1/rpc/portal_student_overview",
            body={"p_token": "bogus-token"},
        )
        check("portal overview rejects a bogus token", s >= 400 or not b, f"got {s} {str(b)[:80]}")

        # ---------- OTHER TEACHER ----------
        print("OTHER TEACHER:")
        s, b = rest(url, anon, "GET",
                    f"/rest/v1/students?select=id&teacher_id=eq.{demo_teacher}",
                    jwt=other_jwt)
        check("other teacher reads none of demo's students", s == 200 and b == [], f"got {s} {str(b)[:80]}")
        s, b = rest(url, anon, "GET", "/rest/v1/invoices?select=id", jwt=other_jwt)
        check("other teacher reads no invoices at all", s == 200 and b == [], f"got {s}")
        s, b = rest(url, anon, "GET",
                    f"/rest/v1/teacher_settings?select=teacher_id&teacher_id=eq.{demo_teacher}",
                    jwt=other_jwt)
        check("other teacher reads none of demo's settings", s == 200 and b == [], f"got {s}")
        before = sql(ref, f"select name from students where id = '{demo_student}'")[0]["name"]
        s, b = rest(url, anon, "PATCH",
                    f"/rest/v1/students?id=eq.{demo_student}",
                    jwt=other_jwt, body={"name": "authz tampered"})
        after = sql(ref, f"select name from students where id = '{demo_student}'")[0]["name"]
        check("other teacher cannot update a demo student", after == before,
              f"name changed {before!r} -> {after!r}")
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/generate_teacher_sessions",
                    jwt=other_jwt,
                    body={"p_teacher_id": demo_teacher, "p_months": []})
        msg = json.dumps(b).lower()
        check("bulk sessions RPC guard rejects non-owner",
              s >= 400 and ("authoriz" in msg or "permission" in msg or "denied" in msg),
              f"got {s} {str(b)[:120]}")
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/claim_teacher_invites",
                    jwt=other_jwt, body={})
        claimed = b.get("claimed") if isinstance(b, dict) else b
        check("claim_teacher_invites claims nothing for a stranger",
              s == 200 and (claimed == 0 or claimed == "0" or b == [] or b is None),
              f"got {s} {b}")

        # ---------- ASSISTANT (attendance only) ----------
        print("ASSISTANT:")
        s, b = rest(url, anon, "GET", "/rest/v1/invoices?select=id", jwt=asst_jwt)
        check("assistant reads no invoices (finance is owner-only)",
              s == 200 and b == [], f"got {s} {str(b)[:80]}")
        s, b = rest(url, anon, "GET", "/rest/v1/payments?select=id", jwt=asst_jwt)
        check("assistant reads no payments", s == 200 and b == [], f"got {s}")
        s, b = rest(url, anon, "GET",
                    f"/rest/v1/students?select=id&teacher_id=eq.{demo_teacher}",
                    jwt=asst_jwt)
        other_teacher_id = sql(
            ref, f"select id from teachers where owner_user_id = '{other_uid}'"
        )[0]["id"]
        s2, b2 = rest(url, anon, "GET",
                      f"/rest/v1/students?select=id&teacher_id=eq.{other_teacher_id}",
                      jwt=asst_jwt)
        check("assistant sees nothing of a third tenant", s2 == 200 and b2 == [],
              f"got {s2}")
        before = sql(
            ref, f"select brand_name from teacher_settings where teacher_id = '{demo_teacher}'"
        )
        s, b = rest(url, anon, "PATCH",
                    f"/rest/v1/teacher_settings?teacher_id=eq.{demo_teacher}",
                    jwt=asst_jwt, body={"brand_name": "authz tampered"})
        after = sql(
            ref, f"select brand_name from teacher_settings where teacher_id = '{demo_teacher}'"
        )
        check("assistant cannot modify teacher settings", before == after,
              "settings changed")
        # بالتصميم (0020/0022): المالك أو عضو نشط — التوليد idempotent
        # والدالة الداخلية تعيد فحص التفويض. الحد الحقيقي: العضو الموقوف.
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/generate_teacher_sessions",
                    jwt=asst_jwt,
                    body={"p_teacher_id": demo_teacher, "p_months": []})
        check("active member may call the idempotent generation RPC",
              s == 200, f"got {s} {str(b)[:120]}")
        sql(ref, "update teacher_members set status = 'suspended' "
                 f"where user_id = '{asst_uid}'")
        try:
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/generate_teacher_sessions",
                        jwt=asst_jwt,
                        body={"p_teacher_id": demo_teacher, "p_months": []})
            check("suspended member is rejected by the RPC guard",
                  s >= 400, f"got {s} {str(b)[:120]}")
        finally:
            sql(ref, "update teacher_members set status = 'active' "
                     f"where user_id = '{asst_uid}'")

        # ---------- OWNER ----------
        print("OWNER:")
        admin_students = sql(
            ref, f"select count(*) as c from students where teacher_id = '{demo_teacher}'"
        )[0]["c"]
        s, b = rest(url, anon, "GET",
                    f"/rest/v1/students?select=id&teacher_id=eq.{demo_teacher}",
                    jwt=demo_jwt)
        check("owner reads exactly his own students",
              s == 200 and len(b) == admin_students,
              f"got {s} len={len(b) if isinstance(b, list) else '?'} admin={admin_students}")
        admin_invoices = sql(
            ref, f"select count(*) as c from invoices where teacher_id = '{demo_teacher}'"
        )[0]["c"]
        s, b = rest(url, anon, "GET",
                    f"/rest/v1/invoices?select=id&teacher_id=eq.{demo_teacher}",
                    jwt=demo_jwt)
        check("owner reads exactly his own invoices",
              s == 200 and len(b) == admin_invoices,
              f"got {s} admin={admin_invoices}")

        # ---------- SEC-L10 (0033 — teachers_self_insert) ----------
        print("SEC-L10 (teachers_self_insert):")
        # (1) الاستيلاء مرفوض: id = uid مستخدم آخر موجود (المساعد) مع
        # owner = نفسي — السياسة ترفض لأن الـ id مستخدم قائم وليس لي.
        s, b = rest(url, anon, "POST", "/rest/v1/teachers",
                    jwt=other_jwt,
                    body={"id": asst_uid, "owner_user_id": other_uid,
                          "display_name": "authz squat"})
        check("squatted teacher id (another user's uid) is rejected",
              s == 403, f"got {s} {str(b)[:120]}")
        # (2) الإدراج الذاتي يعمل: مستخدم ثالث يُدرج صفه بـ id = uid نفسه.
        pw_self = secrets.token_urlsafe(18)
        self_uid = create_user_sql(ref, "authz-self@teacher-app.test", pw_self)
        self_jwt, _ = sign_in(url, anon, "authz-self@teacher-app.test", pw_self)
        s, b = rest(url, anon, "POST", "/rest/v1/teachers",
                    jwt=self_jwt,
                    body={"id": self_uid, "owner_user_id": self_uid,
                          "display_name": "authz self"})
        check("self-id insert still works", s in (200, 201),
              f"got {s} {str(b)[:120]}")
        self_rows = sql(
            ref, f"select count(*) as c from teachers where owner_user_id = '{self_uid}'")
        check("self row is actually stored",
              self_rows and int(self_rows[0]["c"]) == 1, f"got {self_rows}")
        # (3) شكل createCentre يعمل: إدراج بلا id يولّد uuid عشوائياً
        # (لو كانت السياسة id = auth.uid() حرفياً لرفضت هذا).
        s, b = rest(url, anon, "POST", "/rest/v1/teachers",
                    jwt=self_jwt,
                    body={"owner_user_id": self_uid,
                          "display_name": "authz centre"})
        check("centre insert without id still works", s in (200, 201),
              f"got {s} {str(b)[:120]}")
        centre_rows = sql(
            ref, f"select count(*) as c from teachers where owner_user_id = '{self_uid}'")
        check("centre row is actually stored",
              centre_rows and int(centre_rows[0]["c"]) == 2, f"got {centre_rows}")
        # تنظيف الصف الإضافي فوراً؛ صف الذات نفسه يزيله التنظيف النهائي.
        sql(ref, "delete from teachers where owner_user_id = "
                 f"'{self_uid}' and id <> '{self_uid}'")

        # ---------- WHATSAPP CONFIG (0026 — النموذج الاختياري per-teacher) ----------
        print("WHATSAPP CONFIG:")
        # توكن اختبار وهمي يُولّد لكل تشغيل ولا يُطبع أبداً — الغرض إثبات
        # أنه لا يظهر في أي رد عميل وأنه يعيش في Vault فقط.
        dummy_token = "authtest-" + secrets.token_urlsafe(24)
        try:
            s, b = rest(url, anon, "POST", "/rest/v1/teacher_whatsapp_config",
                        jwt=demo_jwt,
                        body={"teacher_id": demo_teacher, "enabled": True,
                              "phone_number_id": "555000111",
                              "waba_id": "555222",
                              "template_name": "otp_code",
                              "template_language": "ar"})
            check("owner creates his whatsapp config row", s in (200, 201),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/set_teacher_whatsapp_token",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_token": dummy_token})
            check("owner stores his token via the write-only RPC",
                  s in (200, 204),  # دالة void ترجع 204 من PostgREST
                  f"got {s} {str(b)[:120]}")
            vault_rows = sql(
                ref,
                "select count(*) as c from vault.decrypted_secrets "
                f"where name = 'wa_token_{demo_teacher}'",
            )
            check("token landed in Vault under the teacher key",
                  vault_rows and int(vault_rows[0]["c"]) == 1,
                  f"got {vault_rows}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_config?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=demo_jwt)
            check("owner reads his own config row",
                  s == 200 and isinstance(b, list) and len(b) == 1,
                  f"got {s} {str(b)[:120]}")
            check("the token value never appears in any client response",
                  dummy_token not in json.dumps(b), "token leaked in config GET")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_config?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=other_jwt)
            check("other teacher reads none of demo's whatsapp config",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "PATCH",
                        f"/rest/v1/teacher_whatsapp_config?teacher_id=eq.{demo_teacher}",
                        jwt=other_jwt, body={"enabled": False})
            still = sql(
                ref,
                "select enabled from teacher_whatsapp_config "
                f"where teacher_id = '{demo_teacher}'",
            )
            check("other teacher cannot modify demo's whatsapp config",
                  still and still[0]["enabled"] is True, f"got {still}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/set_teacher_whatsapp_token",
                        jwt=other_jwt,
                        body={"p_teacher_id": demo_teacher,
                              "p_token": "intruder-token"})
            check("other teacher cannot set demo's token (RPC guard)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_config?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=asst_jwt)
            check("assistant reads no whatsapp config (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_config?select=*")
            check("anon reads no whatsapp config", s == 200 and b == [],
                  f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/resolve_whatsapp_channel_internal",
                        body={"p_user_id": demo_uid})
            check("anon cannot execute the internal channel resolver",
                  s in (401, 403, 404) and dummy_token not in json.dumps(b),
                  f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/get_teacher_whatsapp_token_internal",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("even the owner cannot execute the token reader RPC",
                  s in (401, 403, 404) and dummy_token not in json.dumps(b),
                  f"got {s}")
        finally:
            # تنظيف القسم نفسه: حذف التوكن من Vault عبر RPC المالك ثم الصف
            try:
                rest(url, anon, "POST", "/rest/v1/rpc/set_teacher_whatsapp_token",
                     jwt=demo_jwt,
                     body={"p_teacher_id": demo_teacher, "p_token": ""})
            except Exception:
                pass
            sql(ref, "delete from teacher_whatsapp_config "
                     f"where teacher_id = '{demo_teacher}'")

        # ---------- WHATSAPP MESSAGING (0045 — قوالب Utility + سجل الرسائل) ----------
        print("WHATSAPP MESSAGING (0045):")
        try:
            s, b = rest(url, anon, "POST", "/rest/v1/teacher_whatsapp_templates",
                        jwt=demo_jwt,
                        body={"teacher_id": demo_teacher, "kind": "arrival_notice",
                              "template_name": "arrival_notice", "language": "ar",
                              "status": "ready"})
            check("owner creates his whatsapp template row", s in (200, 201),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_templates?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=demo_jwt)
            check("owner reads his template rows",
                  s == 200 and isinstance(b, list) and len(b) == 1,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_templates?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=other_jwt)
            check("other teacher reads none of demo's templates",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "POST", "/rest/v1/teacher_whatsapp_templates",
                        jwt=other_jwt,
                        body={"teacher_id": demo_teacher, "kind": "absence_notice",
                              "template_name": "absence_notice", "language": "ar",
                              "status": "ready"})
            check("other teacher cannot create a template row for demo",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_templates?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=asst_jwt)
            check("assistant reads no whatsapp templates (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/teacher_whatsapp_templates?select=*")
            check("anon reads no whatsapp templates", s == 200 and b == [],
                  f"got {s}")
            # سجل الرسائل: الكتابة service-role فقط — حتى المالك لا يُدخل
            s, b = rest(url, anon, "POST", "/rest/v1/whatsapp_message_log",
                        jwt=demo_jwt,
                        body={"teacher_id": demo_teacher, "kind": "arrival_notice",
                              "template_name": "arrival_notice",
                              "recipient_phone": "201012345678", "status": "sent"})
            check("even the owner cannot insert a message log row (service-role writes only)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            sql(ref, "insert into whatsapp_message_log "
                     "(teacher_id, kind, template_name, recipient_phone, status, meta_message_id) "
                     f"values ('{demo_teacher}', 'arrival_notice', 'arrival_notice', "
                     "'201012345678', 'sent', 'wamid.authz')")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/whatsapp_message_log?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=demo_jwt)
            check("owner reads his message log rows",
                  s == 200 and isinstance(b, list) and len(b) == 1,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/whatsapp_message_log?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=other_jwt)
            check("other teacher reads none of demo's message log",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/whatsapp_message_log?select=*"
                        f"&teacher_id=eq.{demo_teacher}",
                        jwt=asst_jwt)
            check("assistant reads no message log (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/whatsapp_message_log?select=*")
            check("anon reads no message log", s == 200 and b == [],
                  f"got {s}")
            rest(url, anon, "PATCH",
                 f"/rest/v1/whatsapp_message_log?teacher_id=eq.{demo_teacher}",
                 jwt=demo_jwt, body={"status": "read"})
            still = sql(ref, "select status from whatsapp_message_log "
                             f"where teacher_id = '{demo_teacher}'")
            check("owner cannot update message log rows (webhook-only writes)",
                  still and still[0]["status"] == "sent", f"got {still}")
        finally:
            sql(ref, "delete from teacher_whatsapp_templates "
                     f"where teacher_id = '{demo_teacher}'")
            sql(ref, "delete from whatsapp_message_log "
                     f"where teacher_id = '{demo_teacher}'")

        # ---------- ASSISTANT RUNS (0048 — سجل المساعد + آلة التأكيد) ----------
        print("ASSISTANT RUNS (0048):")
        try:
            hash_a = "a" * 64
            s, b = rest(url, anon, "GET", "/rest/v1/assistant_runs?select=id")
            check("anon cannot read assistant_runs (no grant)",
                  s in (401, 403), f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/assistant_runs?select=id",
                        jwt=other_jwt)
            check("other teacher reads no assistant_runs",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "POST", "/rest/v1/assistant_runs",
                        jwt=demo_jwt,
                        body={"teacher_id": demo_teacher, "actor_user_id": demo_uid,
                              "actor_role": "owner", "kind": "read",
                              "tool": "unpaid_students", "status": "answered"})
            check("even the owner cannot insert an assistant run directly (RPC only)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "PATCH",
                        f"/rest/v1/assistant_runs?teacher_id=eq.{demo_teacher}",
                        jwt=demo_jwt, body={"status": "executed"})
            check("owner cannot update assistant runs directly (RPC only)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_begin_read",
                        jwt=other_jwt,
                        body={"p_teacher_id": demo_teacher, "p_tool": "unpaid_students",
                              "p_request": "unpaid", "p_result": {}})
            check("begin_read RPC rejects a non-member actor",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_begin_read",
                        body={"p_teacher_id": demo_teacher, "p_tool": "unpaid_students",
                              "p_request": "unpaid", "p_result": {}})
            check("anon cannot call assistant_begin_read",
                  s in (401, 403, 404), f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_begin_read",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_tool": "unpaid_students",
                              "p_request": "unpaid", "p_result": {"total_balance": 0}})
            check("owner logs a read run via RPC",
                  s == 200 and isinstance(b, str) and len(b) == 36,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/assistant_runs?select=id,status"
                        f"&teacher_id=eq.{demo_teacher}", jwt=demo_jwt)
            check("owner reads his assistant runs",
                  s == 200 and isinstance(b, list) and len(b) == 1
                  and b[0]["status"] == "answered",
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/assistant_runs?select=id"
                        f"&teacher_id=eq.{demo_teacher}", jwt=asst_jwt)
            check("assistant member reads no assistant runs (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_create_proposal",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_tool": "add_student",
                              "p_request": "add-student",
                              "p_payload": {"name": "authz", "group_id": demo_student},
                              "p_payload_hash": hash_a})
            run_id = b.get("id") if isinstance(b, dict) else None
            check("owner creates a proposal via RPC",
                  s == 200 and bool(run_id), f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_confirm_proposal",
                        jwt=demo_jwt,
                        body={"p_run_id": run_id, "p_payload_hash": "b" * 64})
            check("confirm with a wrong hash is rejected",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_confirm_proposal",
                        jwt=asst_jwt,
                        body={"p_run_id": run_id, "p_payload_hash": hash_a})
            check("confirm by a non-proposer is rejected",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_confirm_proposal",
                        jwt=demo_jwt,
                        body={"p_run_id": run_id, "p_payload_hash": hash_a})
            check("confirm with the stored hash returns the stored payload",
                  s == 200 and isinstance(b, dict) and b.get("tool") == "add_student",
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_complete_run",
                        jwt=demo_jwt,
                        body={"p_run_id": run_id, "p_success": True,
                              "p_result": {"student_id": "x"}, "p_error": None})
            check("confirmed run completes as executed",
                  s == 200, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_create_proposal",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_tool": "add_student",
                              "p_request": "add-student",
                              "p_payload": {"name": "authz2", "group_id": demo_student},
                              "p_payload_hash": hash_a})
            run2 = b.get("id") if isinstance(b, dict) else None
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_cancel_run",
                        jwt=demo_jwt,
                        body={"p_run_id": run2, "p_reason": "stopped"})
            check("pending proposal can be stopped by its proposer",
                  s == 200, f"got {s} {str(b)[:120]}")
            rows = sql(ref, "select status from assistant_runs "
                            f"where teacher_id = '{demo_teacher}' order by created_at")
            check("run states persisted (answered/executed/stopped)",
                  [r["status"] for r in rows] == ["answered", "executed", "stopped"],
                  f"got {rows}")
        finally:
            sql(ref, "delete from assistant_runs "
                     f"where teacher_id = '{demo_teacher}'")

        # ---------- PROVIDER KEYS (0049 — مفتاح المزوّد BYOK) ----------
        print("PROVIDER KEYS (0049):")
        fake_ct = "ZmFrZS1jaXBoZXJ0ZXh0LWZvci1hdXRoei10ZXN0cy0wMDE="
        fake_iv = "aXYtZm9yLWF1dGh6LXRlc3QtMDAx"
        try:
            s, b = rest(url, anon, "GET", "/rest/v1/teacher_ai_keys?select=teacher_id")
            check("anon cannot read teacher_ai_keys (no grant at all)",
                  s in (401, 403), f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/teacher_ai_keys?select=teacher_id",
                        jwt=demo_jwt)
            check("even the owner cannot read teacher_ai_keys directly (RPC only)",
                  s in (401, 403), f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/teacher_ai_keys?select=teacher_id",
                        jwt=asst_jwt)
            check("member cannot read teacher_ai_keys directly either",
                  s in (401, 403), f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/teacher_ai_keys",
                        jwt=demo_jwt,
                        body={"teacher_id": demo_teacher, "provider": "gemini",
                              "key_ciphertext": fake_ct, "key_iv": fake_iv})
            check("owner cannot insert a key row directly",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_save_provider_key",
                        jwt=asst_jwt,
                        body={"p_teacher_id": demo_teacher, "p_provider": "gemini",
                              "p_model": None, "p_base_url": None,
                              "p_ciphertext": fake_ct, "p_iv": fake_iv})
            check("member cannot save a provider key (owner-only)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_save_provider_key",
                        jwt=other_jwt,
                        body={"p_teacher_id": demo_teacher, "p_provider": "gemini",
                              "p_model": None, "p_base_url": None,
                              "p_ciphertext": fake_ct, "p_iv": fake_iv})
            check("a stranger cannot save a key for someone else's centre",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_save_provider_key",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_provider": "gemini",
                              "p_model": None, "p_base_url": None,
                              "p_ciphertext": fake_ct, "p_iv": fake_iv})
            check("owner saves a provider key via RPC (ciphertext only)",
                  s == 200 and isinstance(b, dict) and b.get("is_set") is True
                  and "key_ciphertext" not in str(b) and fake_ct not in str(b),
                  f"got {s} {str(b)[:160]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_provider_key_status",
                        jwt=asst_jwt, body={"p_teacher_id": demo_teacher})
            check("member cannot read key status (owner-only)",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_provider_key_status",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("owner key status is metadata only — never the ciphertext",
                  s == 200 and isinstance(b, dict) and b.get("is_set") is True
                  and b.get("provider") == "gemini" and fake_ct not in str(b),
                  f"got {s} {str(b)[:160]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_read_provider_key",
                        jwt=asst_jwt, body={"p_teacher_id": demo_teacher})
            check("member CAN read the ciphertext row (Edge function path — "
                  "useless without the platform encryption key)",
                  s == 200 and isinstance(b, dict)
                  and b.get("key_ciphertext") == fake_ct,
                  f"got {s} {str(b)[:160]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_read_provider_key",
                        jwt=other_jwt, body={"p_teacher_id": demo_teacher})
            check("a stranger cannot read the ciphertext row",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_delete_provider_key",
                        jwt=asst_jwt, body={"p_teacher_id": demo_teacher})
            check("member cannot delete the provider key",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_delete_provider_key",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("owner deletes the provider key",
                  s == 200, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/assistant_provider_key_status",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("status after delete reports no key",
                  s == 200 and isinstance(b, dict) and b.get("is_set") is False,
                  f"got {s} {str(b)[:120]}")
        finally:
            sql(ref, "delete from teacher_ai_keys "
                     f"where teacher_id = '{demo_teacher}'")

        # ---------- PORTAL ACCOUNTS (3A-385 — هجرات 0040/0041/0042) ----------
        print("PORTAL ACCOUNTS (3A-385):")
        pw_guardian = secrets.token_urlsafe(12)
        pw_student = secrets.token_urlsafe(12)
        pw_claimed = secrets.token_urlsafe(12)
        link_raw = "authz-link-" + secrets.token_urlsafe(24)
        link_hash = hashlib.sha256(link_raw.encode()).hexdigest()
        try:
            link_row = sql(
                ref,
                "select gs.guardian_id, gs.student_id, g.phone from "
                "guardian_students gs join guardians g on g.id = gs.guardian_id "
                f"where gs.teacher_id = '{demo_teacher}' limit 1",
            )[0]
            guardian_id = link_row["guardian_id"]
            linked_student = link_row["student_id"]
            guardian_phone = link_row["phone"]
            expected_username = re.sub(r"\D", "", guardian_phone)
            if expected_username.startswith("0020"):
                expected_username = "0" + expected_username[4:]
            elif expected_username.startswith("20") and len(expected_username) == 12:
                expected_username = "0" + expected_username[2:]
            unlinked_student = sql(
                ref,
                f"select id from students where teacher_id = '{demo_teacher}' "
                f"and id not in (select student_id from guardian_students "
                f"where guardian_id = '{guardian_id}') limit 1",
            )[0]["id"]
            student_code = sql(
                ref, f"select public_code from students where id = '{linked_student}'"
            )[0]["public_code"]

            # عزل الجدولين: لا قراءة إلا للمالك عبر RLS
            s, b = rest(url, anon, "GET", "/rest/v1/portal_accounts?select=id")
            check("anon reads no portal accounts", s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/portal_sessions?select=id")
            check("anon reads no portal sessions", s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/portal_accounts?select=id",
                        jwt=other_jwt)
            check("other teacher reads no portal accounts", s == 200 and b == [],
                  f"got {s}")
            s, b = rest(url, anon, "GET", "/rest/v1/portal_accounts?select=id",
                        jwt=asst_jwt)
            check("assistant reads no portal accounts (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                        body={"p_teacher_id": demo_teacher, "p_role": "student",
                              "p_target_id": linked_student, "p_password": "x" * 8})
            check("anon cannot execute portal_account_upsert",
                  s in (401, 403, 404), f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_norm_phone",
                        body={"p_phone": "01000000000"})
            check("anon cannot execute the internal phone normalizer",
                  s in (401, 403, 404), f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                        jwt=other_jwt,
                        body={"p_teacher_id": demo_teacher, "p_role": "student",
                              "p_target_id": linked_student, "p_password": "x" * 8})
            check("other teacher cannot upsert an account for demo (RPC guard)",
                  s >= 400 and "authoriz" in json.dumps(b).lower(), f"got {s}")

            # إنشاء الحسابين بيد المالك — اسم الدخول يُشتق خادمياً
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_role": "guardian",
                              "p_target_id": guardian_id, "p_password": pw_guardian})
            guardian_account = b.get("account_id") if isinstance(b, dict) else None
            check("owner upserts a guardian account with server-derived username",
                  s == 200 and isinstance(b, dict)
                  and b.get("username") == expected_username,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                        jwt=demo_jwt,
                        body={"p_teacher_id": demo_teacher, "p_role": "student",
                              "p_target_id": linked_student, "p_password": pw_student})
            check("owner upserts a student account (username = public code)",
                  s == 200 and isinstance(b, dict)
                  and b.get("username") == student_code.upper(),
                  f"got {s} {str(b)[:120]}")

            # الدخول: خطأ عام للفشل، وجلسة عاملة للنجاح
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": guardian_phone,
                              "p_password": "definitely-wrong"})
            # فشل الاعتماد يعود داخل النطاق {error} (0043) حتى يصمد
            # تحديث عدّاد المحاولات — لا جلسة ولا كشف إضافي.
            check("login with a wrong password is rejected generically",
                  s == 200 and isinstance(b, dict)
                  and b.get("error") == "invalid credentials"
                  and not b.get("session_token"),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": guardian_phone, "p_password": pw_guardian})
            g_session = b.get("session_token") if isinstance(b, dict) else None
            check("guardian login returns a session for his linked students",
                  s == 200 and bool(g_session) and isinstance(b, dict)
                  and any(st.get("id") == linked_student
                          for st in b.get("students", [])),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                        body={"p_token": g_session, "p_student_id": linked_student})
            check("guardian session opens the overview (unified validator)",
                  s == 200 and isinstance(b, dict) and "sections" in b,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                        body={"p_token": g_session, "p_student_id": unlinked_student})
            check("guardian session is rejected for an unlinked student",
                  s >= 400 and "authoriz" in json.dumps(b).lower(), f"got {s}")

            # التوافق الخلفي: رابط قديم يعمل، والـ claim يبني كلمة سر فوقه
            sql(
                ref,
                "insert into guardian_access_tokens (teacher_id, guardian_id, "
                "student_id, token_hash, expires_at) values "
                f"('{demo_teacher}', '{guardian_id}', '{linked_student}', "
                f"'{link_hash}', now() + interval '30 days')",
            )
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                        body={"p_token": link_raw, "p_student_id": linked_student})
            check("a pre-existing link token still works (backward compat)",
                  s == 200 and isinstance(b, dict) and "student" in b, f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_account_claim_guardian",
                        body={"p_token": link_raw, "p_student_id": linked_student,
                              "p_password": pw_claimed})
            check("guardian claims a password from inside the portal via his link",
                  s == 200 and isinstance(b, dict)
                  and b.get("username") == expected_username,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": guardian_phone, "p_password": pw_claimed})
            g_session2 = b.get("session_token") if isinstance(b, dict) else None
            check("login works with the claimed password",
                  s == 200 and bool(g_session2), f"got {s}")

            # إخفاء قسم المال: الرصيد لا يصل أصلاً (0038). الاعتماد هنا
            # هو الجلسة لا الرابط: منذ 0056 الـ claim يستهلك الرابط،
            # والجلسة صالحة قبلها وبعدها (المدقق الموحد 0042).
            rest(url, anon, "PATCH",
                 f"/rest/v1/teacher_settings?teacher_id=eq.{demo_teacher}",
                 jwt=demo_jwt, body={"portal_guardian_show_money": False})
            try:
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/portal_overview_by_token",
                            body={"p_token": g_session2,
                                  "p_student_id": linked_student})
                check("hidden money section: balance never leaves the server",
                      s == 200 and isinstance(b, dict)
                      and b.get("balance") is None
                      and b.get("sections", {}).get("money") is False,
                      f"got {s} {str(b)[:160]}")
            finally:
                rest(url, anon, "PATCH",
                     f"/rest/v1/teacher_settings?teacher_id=eq.{demo_teacher}",
                     jwt=demo_jwt, body={"portal_guardian_show_money": True})

            # دخول الطالب بكوده (أحرف صغيرة تُطبَّع) وجلسة تعمل ثم تُبطَل بالخروج
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": student_code.lower(),
                              "p_password": pw_student})
            s_session = b.get("session_token") if isinstance(b, dict) else None
            check("student login by public code (case-insensitive) works",
                  s == 200 and bool(s_session), f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/student_portal_overview_by_token",
                        body={"p_token": s_session})
            check("student session opens the student overview",
                  s == 200 and isinstance(b, dict) and "sections" in b, f"got {s}")
            rest(url, anon, "POST", "/rest/v1/rpc/portal_logout",
                 body={"p_session_token": s_session})
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/student_portal_overview_by_token",
                        body={"p_token": s_session})
            check("logout revokes the session immediately",
                  s >= 400, f"got {s}")

            # القفل بعد 8 محاولات فاشلة على حساب طالب آخر
            rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                 jwt=demo_jwt,
                 body={"p_teacher_id": demo_teacher, "p_role": "student",
                       "p_target_id": unlinked_student, "p_password": pw_student})
            unlinked_code = sql(
                ref, f"select public_code from students where id = '{unlinked_student}'"
            )[0]["public_code"]
            for _ in range(8):
                rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                     body={"p_username": unlinked_code, "p_password": "nope-nope"})
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": unlinked_code, "p_password": pw_student})
            check("account locks after 8 failed attempts (correct pw still rejected)",
                  s == 200 and isinstance(b, dict)
                  and b.get("error") == "invalid credentials"
                  and not b.get("session_token"),
                  f"got {s} {str(b)[:120]}")

            # تعطيل الحساب يوقف الدخول والجلسات الحية فوراً
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_set_active",
                        jwt=demo_jwt,
                        body={"p_account_id": guardian_account, "p_active": False})
            check("owner can disable a portal account", s == 200, f"got {s}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                        body={"p_username": guardian_phone, "p_password": pw_claimed})
            check("disabled account cannot log in",
                  s == 200 and isinstance(b, dict)
                  and b.get("error") == "invalid credentials"
                  and not b.get("session_token"),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                        body={"p_token": g_session2, "p_student_id": linked_student})
            check("disabling kills the account's live sessions",
                  s >= 400, f"got {s}")
        finally:
            sql(ref, "delete from portal_accounts "
                     f"where teacher_id = '{demo_teacher}'")
            sql(ref, "delete from guardian_access_tokens "
                     f"where token_hash = '{link_hash}'")
            rest(url, anon, "PATCH",
                 f"/rest/v1/teacher_settings?teacher_id=eq.{demo_teacher}",
                 jwt=demo_jwt, body={"portal_guardian_show_money": True})
            left = sql(ref, "select count(*) as c from portal_accounts "
                            f"where teacher_id = '{demo_teacher}'")
            check("portal account fixtures cleaned",
                  left and int(left[0]["c"]) == 0, f"got {left}")

        # ---------- PORTAL ACCOUNTS COMPLETION (0056 — المهمة 20 / 3A-895) ----------
        # ⚠️ المهاجرة 0056 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود دالة فتح الجلسة
        # الجديدة أولاً: إن غابت يطبع تخطياً موثقاً (لا فشل — الغياب هو
        # الحالة المتوقعة حتى البوابة)، وبعد التطبيق يشتغل كاملاً
        # تلقائياً في نفس التشغيلة.
        print("PORTAL ACCOUNTS COMPLETION (0056):")
        probe56 = sql(ref, "select count(*) as c from pg_proc "
                           "where proname = 'portal_issue_session'")
        if not probe56 or int(probe56[0]["c"]) == 0:
            print("  SKIP 0056 live section — migration 0056 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate)")
        else:
            pw56_student = secrets.token_urlsafe(12)
            pw56_claim = secrets.token_urlsafe(12)
            g56_raw = "authz56-g-" + secrets.token_urlsafe(24)
            g56_hash = hashlib.sha256(g56_raw.encode()).hexdigest()
            s56_raw = "authz56-s-" + secrets.token_urlsafe(24)
            s56_hash = hashlib.sha256(s56_raw.encode()).hexdigest()
            test_phone56 = "0100" + "".join(
                secrets.choice("0123456789") for _ in range(7))
            stu56 = None
            orig_phone56 = None
            try:
                link56 = sql(
                    ref,
                    "select gs.guardian_id, gs.student_id, g.phone from "
                    "guardian_students gs join guardians g on g.id = gs.guardian_id "
                    f"where gs.teacher_id = '{demo_teacher}' limit 1",
                )[0]
                g56 = link56["guardian_id"]
                stu56 = link56["student_id"]
                g56_phone = link56["phone"]
                orig_phone56 = sql(
                    ref, f"select phone from students where id = '{stu56}'"
                )[0]["phone"]
                sql(ref, f"update students set phone = '{test_phone56}' "
                         f"where id = '{stu56}'")

                # حساب طالب بيد المالك، ثم الدخول برقم الموبايل المسجل
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_account_upsert",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher, "p_role": "student",
                                  "p_target_id": stu56, "p_password": pw56_student})
                check("0056: owner upserts the student account",
                      s == 200 and isinstance(b, dict) and bool(b.get("account_id")),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                            body={"p_username": "+20" + test_phone56[1:],
                                  "p_password": "definitely-wrong"})
                check("0056: phone login rejects a wrong password generically",
                      s == 200 and isinstance(b, dict)
                      and b.get("error") == "invalid credentials"
                      and not b.get("session_token"),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                            body={"p_username": "+20" + test_phone56[1:],
                                  "p_password": pw56_student})
                s56_session = b.get("session_token") if isinstance(b, dict) else None
                check("0056: student logs in by his registered mobile number",
                      s == 200 and bool(s56_session) and isinstance(b, dict)
                      and b.get("student_id") == stu56,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/student_portal_overview_by_token",
                            body={"p_token": s56_session})
                check("0056: the phone-login session opens the student overview",
                      s == 200 and isinstance(b, dict) and "sections" in b,
                      f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                            body={"p_username": "01009999999",
                                  "p_password": pw56_student})
                check("0056: an unregistered phone gets the same generic error",
                      s == 200 and isinstance(b, dict)
                      and b.get("error") == "invalid credentials"
                      and not b.get("session_token"),
                      f"got {s} {str(b)[:120]}")

                # claim ولي الأمر: يستهلك الرابط ويفتح جلسة فوراً
                sql(ref, "insert into guardian_access_tokens (teacher_id, "
                         "guardian_id, student_id, token_hash, expires_at) values "
                         f"('{demo_teacher}', '{g56}', '{stu56}', '{g56_hash}', "
                         "now() + interval '30 days')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/portal_account_claim_guardian",
                            body={"p_token": g56_raw, "p_student_id": stu56,
                                  "p_password": pw56_claim})
                g56_session = b.get("session_token") if isinstance(b, dict) else None
                check("0056: guardian claim returns an open account session",
                      s == 200 and bool(g56_session) and isinstance(b, dict)
                      and bool(b.get("account_id")),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                            body={"p_token": g56_session, "p_student_id": stu56})
                check("0056: the claim session opens the guardian overview",
                      s == 200 and isinstance(b, dict) and "sections" in b,
                      f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_overview_by_token",
                            body={"p_token": g56_raw, "p_student_id": stu56})
                check("0056: the claimed guardian link is dead (first entry only)",
                      s >= 400, f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/portal_login",
                            body={"p_username": g56_phone, "p_password": pw56_claim})
                check("0056: guardian logs in with the claimed password",
                      s == 200 and isinstance(b, dict)
                      and bool(b.get("session_token")),
                      f"got {s}")

                # claim الطالب: يستهلك رابطه هو الآخر
                sql(ref, "insert into student_access_tokens (teacher_id, "
                         "student_id, token_hash, expires_at) values "
                         f"('{demo_teacher}', '{stu56}', '{s56_hash}', "
                         "now() + interval '30 days')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/portal_account_claim_student",
                            body={"p_token": s56_raw, "p_password": pw56_claim})
                sc56_session = b.get("session_token") if isinstance(b, dict) else None
                check("0056: student claim returns an open account session",
                      s == 200 and bool(sc56_session),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/student_portal_overview_by_token",
                            body={"p_token": s56_raw})
                check("0056: the claimed student link is dead (first entry only)",
                      s >= 400, f"got {s}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/student_portal_overview_by_token",
                            body={"p_token": sc56_session})
                check("0056: the student claim session opens the overview",
                      s == 200 and isinstance(b, dict) and "sections" in b,
                      f"got {s}")
            finally:
                sql(ref, "delete from portal_accounts "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from guardian_access_tokens "
                         f"where token_hash = '{g56_hash}'")
                sql(ref, "delete from student_access_tokens "
                         f"where token_hash = '{s56_hash}'")
                if stu56 is not None:
                    if orig_phone56 is None:
                        sql(ref, f"update students set phone = null "
                                 f"where id = '{stu56}'")
                    else:
                        sql(ref, f"update students set phone = '{orig_phone56}' "
                                 f"where id = '{stu56}'")
                left = sql(ref, "select count(*) as c from portal_accounts "
                                f"where teacher_id = '{demo_teacher}'")
                check("0056 fixtures cleaned",
                      left and int(left[0]["c"]) == 0, f"got {left}")

        # ---------- GUARDIAN NOTIFICATIONS LADDER (0050 — 3A-713) ----------
        # قناة داخل البوابة (غياب + فاتورة) + سلم البدائل بسجل تسليم لكل
        # محاولة + عزل الأولياء: وليّ لا يرى إشعارات طالب غير مرتبط به.
        print("GUARDIAN NOTIFICATIONS LADDER (0050):")
        raw_a = "authz0050-a-" + secrets.token_urlsafe(24)
        raw_b = "authz0050-b-" + secrets.token_urlsafe(24)
        hash_a50 = hashlib.sha256(raw_a.encode()).hexdigest()
        hash_b50 = hashlib.sha256(raw_b.encode()).hexdigest()
        pre50 = sql(
            ref,
            "select (select count(*) from guardian_notifications) as gn, "
            "(select count(*) from guardian_notification_deliveries) as dl, "
            "(select count(*) from push_subscriptions) as ps, "
            "(select count(*) from push_delivery_log) as pl",
        )[0]
        sess_ids50 = []
        sub_id50 = None
        inv_id50 = None
        try:
            link50 = sql(
                ref,
                "select gs.guardian_id, gs.student_id from guardian_students gs "
                f"where gs.teacher_id = '{demo_teacher}' limit 1",
            )[0]
            g50 = link50["guardian_id"]
            stu50 = link50["student_id"]
            other_link50 = sql(
                ref,
                "select gs.guardian_id, gs.student_id from guardian_students gs "
                f"where gs.teacher_id = '{demo_teacher}' "
                f"and gs.guardian_id <> '{g50}' and gs.student_id <> '{stu50}' "
                "limit 1",
            )[0]
            unlinked50 = sql(
                ref,
                f"select id from students where teacher_id = '{demo_teacher}' "
                f"and id not in (select student_id from guardian_students "
                f"where guardian_id = '{g50}') limit 1",
            )[0]["id"]
            grp50 = sql(
                ref,
                f"select id from groups where teacher_id = '{demo_teacher}' "
                "limit 1",
            )[0]["id"]
            tok_a50 = sql(
                ref,
                "insert into guardian_access_tokens (teacher_id, guardian_id, "
                "student_id, token_hash, expires_at) values "
                f"('{demo_teacher}', '{g50}', '{stu50}', '{hash_a50}', "
                "now() + interval '30 days') returning id",
            )[0]["id"]
            sql(
                ref,
                "insert into guardian_access_tokens (teacher_id, guardian_id, "
                "student_id, token_hash, expires_at) values "
                f"('{demo_teacher}', '{other_link50['guardian_id']}', "
                f"'{other_link50['student_id']}', '{hash_b50}', "
                "now() + interval '30 days')",
            )

            def mk_session50(day):
                sid = sql(
                    ref,
                    "insert into sessions (teacher_id, group_id, session_date, "
                    "start_time, duration_minutes, kind, status) values "
                    f"('{demo_teacher}', '{grp50}', '{day}', '10:00', 60, "
                    "'regular', 'scheduled') returning id",
                )[0]["id"]
                sess_ids50.append(sid)
                return sid

            def mark_absent50(sid):
                sql(
                    ref,
                    "insert into attendance (teacher_id, session_id, "
                    "student_id, status, homework_done, starred) values "
                    f"('{demo_teacher}', '{sid}', '{stu50}', 'a', false, false)",
                )

            def notif50(kind, extra):
                return sql(
                    ref,
                    "select id from guardian_notifications where "
                    f"student_id = '{stu50}' and kind = '{kind}' {extra}",
                )

            def ladder50(nid):
                return sql(
                    ref,
                    "select channel, status from "
                    "guardian_notification_deliveries where "
                    f"notification_id = '{nid}'",
                )

            # غياب: إشعار واحد + ٣ صفوف سلم (بوابة مُسلّمة، Push متخطّى بلا
            # اشتراك، واتساب متخطّى — قناة المدرس غير مفعّلة في الديمو)
            s1 = mk_session50("2099-01-05")
            mark_absent50(s1)
            n_abs = notif50("absence", f"and session_id = '{s1}'")
            check("absence generates exactly one portal notification",
                  len(n_abs) == 1, f"got {n_abs}")
            lad = {r["channel"]: r["status"] for r in ladder50(n_abs[0]["id"])}
            check("ladder rows recorded for the absence notification",
                  lad.get("in_portal") == "delivered"
                  and lad.get("web_push") == "skipped"
                  and lad.get("whatsapp") == "skipped",
                  f"got {lad}")
            sql(ref, "update attendance set status = 'p' where "
                     f"session_id = '{s1}' and student_id = '{stu50}'")
            sql(ref, "update attendance set status = 'a' where "
                     f"session_id = '{s1}' and student_id = '{stu50}'")
            n_abs2 = notif50("absence", f"and session_id = '{s1}'")
            check("re-saving absence does not duplicate the notification",
                  len(n_abs2) == 1, f"got {n_abs2}")

            # فاتورة: إشعار واحد بنوع invoice_issued + سلم كامل
            inv_id50 = sql(
                ref,
                "insert into invoices (teacher_id, student_id, group_id, "
                "period_month) values "
                f"('{demo_teacher}', '{stu50}', '{grp50}', '2099-01-01') "
                "returning id",
            )[0]["id"]
            n_inv = notif50("invoice_issued", f"and invoice_id = '{inv_id50}'")
            check("invoice issue generates exactly one portal notification",
                  len(n_inv) == 1, f"got {n_inv}")
            lad_inv = ladder50(n_inv[0]["id"])
            check("ladder rows recorded for the invoice notification",
                  len(lad_inv) == 3, f"got {lad_inv}")

            # Push: باشتراك فعّال تصبح محاولة البوابة «attempted»
            sub_id50 = sql(
                ref,
                "insert into push_subscriptions (teacher_id, subscriber_kind, "
                "portal_token_id, guardian_id, student_id, endpoint, p256dh, "
                "auth) values "
                f"('{demo_teacher}', 'guardian', '{tok_a50}', '{g50}', "
                f"'{stu50}', 'https://push.example.test/authz-0050', "
                "'authz-fake-p256dh', 'authz-fake-auth') returning id",
            )[0]["id"]
            s2 = mk_session50("2099-01-06")
            mark_absent50(s2)
            n_abs3 = notif50("absence", f"and session_id = '{s2}'")
            lad3 = {r["channel"]: r["status"]
                    for r in ladder50(n_abs3[0]["id"])}
            check("with an active subscription the push rung is attempted",
                  lad3.get("web_push") == "attempted", f"got {lad3}")

            # RLS سجل التسليم: مالك فقط، ولا كتابة مباشرة لأحد
            s, b = rest(url, anon, "GET",
                        "/rest/v1/guardian_notification_deliveries?select=id")
            check("anon reads no delivery log rows (RLS owner-only)",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/guardian_notification_deliveries?select=id"
                        f"&teacher_id=eq.{demo_teacher}", jwt=other_jwt)
            check("other teacher reads none of demo's delivery log",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/guardian_notification_deliveries?select=id"
                        f"&teacher_id=eq.{demo_teacher}", jwt=asst_jwt)
            check("assistant member reads no delivery log (owner-only)",
                  s == 200 and b == [], f"got {s}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/guardian_notification_deliveries?select=id"
                        f"&teacher_id=eq.{demo_teacher}", jwt=demo_jwt)
            check("owner reads his delivery log",
                  s == 200 and isinstance(b, list) and len(b) >= 9,
                  f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/guardian_notification_deliveries",
                        jwt=demo_jwt,
                        body={"notification_id": n_abs[0]["id"],
                              "teacher_id": demo_teacher,
                              "channel": "in_portal", "status": "delivered"})
            check("even the owner cannot insert delivery rows directly",
                  s >= 400, f"got {s} {str(b)[:120]}")

            # عزل البوابة: التوكن يرى طالبَه فقط
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_list_guardian_notifications",
                        body={"p_token": raw_a, "p_student_id": stu50})
            ids_seen = [n["id"] for n in b.get("notifications", [])] \
                if isinstance(b, dict) else []
            inv_row = next((n for n in b.get("notifications", [])
                            if n.get("id") == n_inv[0]["id"]), {}) \
                if isinstance(b, dict) else {}
            check("guardian token lists his student's new notifications",
                  s == 200 and n_abs[0]["id"] in ids_seen
                  and n_inv[0]["id"] in ids_seen
                  and inv_row.get("invoice_period") == "2099-01",
                  f"got {s} {str(b)[:160]}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_list_guardian_notifications",
                        body={"p_token": raw_a, "p_student_id": unlinked50})
            check("guardian token is rejected for an unlinked student",
                  s >= 400, f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_list_guardian_notifications",
                        body={"p_token": raw_b, "p_student_id": stu50})
            check("another guardian's token cannot list this student",
                  s >= 400, f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_list_guardian_notifications",
                        body={"p_token": "bogus-0050", "p_student_id": stu50})
            check("a bogus token lists nothing", s >= 400, f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_mark_notifications_read",
                        body={"p_token": raw_b, "p_student_id": stu50,
                              "p_ids": [n_abs[0]["id"]]})
            check("another guardian cannot mark this student's rows read",
                  s >= 400, f"got {s}")
            s, b = rest(url, anon, "POST",
                        "/rest/v1/rpc/portal_mark_notifications_read",
                        body={"p_token": raw_a, "p_student_id": stu50,
                              "p_ids": [n_abs[0]["id"]]})
            check("the guardian marks his own notification read",
                  s == 200, f"got {s} {str(b)[:120]}")
            after = sql(ref, "select read_at from guardian_notifications "
                             f"where id = '{n_abs[0]['id']}'")
            check("read state persisted on the notification row",
                  after and after[0]["read_at"] is not None, f"got {after}")
        finally:
            # مهلة قصيرة لاستقرار أي إرسال Push غير متزامن قبل التنظيف
            time.sleep(3)
            if sub_id50:
                sql(ref, "delete from push_delivery_log where "
                         f"subscription_id = '{sub_id50}'")
                sql(ref, "delete from push_subscriptions where "
                         f"id = '{sub_id50}'")
            if sess_ids50:
                sql(ref, "delete from guardian_notifications where "
                        "session_id in "
                        f"({','.join(repr(x) for x in sess_ids50)})")
            if inv_id50:
                sql(ref, "delete from guardian_notifications where "
                         f"invoice_id = '{inv_id50}'")
                sql(ref, f"delete from invoices where id = '{inv_id50}'")
            for sid in sess_ids50:
                sql(ref, "delete from attendance where "
                         f"session_id = '{sid}'")
                sql(ref, f"delete from sessions where id = '{sid}'")
            sql(ref, "delete from guardian_access_tokens where "
                    f"token_hash in ('{hash_a50}', '{hash_b50}')")
            post50 = sql(
                ref,
                "select (select count(*) from guardian_notifications) as gn, "
                "(select count(*) from guardian_notification_deliveries) as dl, "
                "(select count(*) from push_subscriptions) as ps, "
                "(select count(*) from push_delivery_log) as pl",
            )[0]
            check("0050 fixtures cleaned (counts restored)",
                  post50 == pre50, f"{pre50} -> {post50}")
        # ---------- CENTRE LEDGER (0051 — دفتر مشتريات/مبيعات السنتر) ----------
        # ⚠️ المهاجرة 0051 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجداول أولاً: إن
        # غابت يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        print("CENTRE LEDGER (0051):")
        ledger_probe = sql(ref, "select to_regclass('public.suppliers') as t")
        if not ledger_probe or not ledger_probe[0].get("t"):
            print("  SKIP 0051 live section — migration 0051 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PHASE2-T10-FINANCE.md)")
        else:
            ledger_supplier = None
            ledger_purchase = None
            ledger_sale = None
            try:
                s, b = rest(url, anon, "GET", "/rest/v1/suppliers?select=id")
                check("anon reads no suppliers (no grant)",
                      s in (401, 403) or (s == 200 and b == []), f"got {s}")
                s, b = rest(url, anon, "GET", "/rest/v1/suppliers?select=id",
                            jwt=asst_jwt)
                check("assistant reads no suppliers (finance is owner-only)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET", "/rest/v1/purchases?select=id",
                            jwt=asst_jwt)
                check("assistant reads no purchases (finance is owner-only)",
                      s == 200 and b == [], f"got {s}")
                s, b = rest(url, anon, "GET", "/rest/v1/sales?select=id",
                            jwt=asst_jwt)
                check("assistant reads no sales (finance is owner-only)",
                      s == 200 and b == [], f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/suppliers",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "name": "authz supplier"})
                rows = b if isinstance(b, list) else []
                check("owner creates a supplier",
                      s in (200, 201) and len(rows) == 1, f"got {s} {str(b)[:120]}")
                ledger_supplier = rows[0]["id"] if rows else None
                s, b = rest(url, anon, "GET",
                            f"/rest/v1/suppliers?select=id&teacher_id=eq.{demo_teacher}",
                            jwt=other_jwt)
                check("other teacher reads none of demo's suppliers",
                      s == 200 and b == [], f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/create_purchase",
                            jwt=asst_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_supplier_id": ledger_supplier,
                                  "p_purchase_date": "2026-11-01",
                                  "p_note": "authz",
                                  "p_lines": [{"description": "authz paper",
                                               "quantity": 10,
                                               "unit_price": 25}]})
                check("assistant cannot create a purchase (owner-only RPC)",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/create_purchase",
                            jwt=other_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_supplier_id": ledger_supplier,
                                  "p_purchase_date": "2026-11-01",
                                  "p_note": "authz",
                                  "p_lines": [{"description": "authz paper",
                                               "quantity": 10,
                                               "unit_price": 25}]})
                check("a stranger cannot create a purchase for demo's centre",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/create_purchase",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_supplier_id": ledger_supplier,
                                  "p_purchase_date": "2026-11-01",
                                  "p_note": "authz",
                                  "p_lines": [{"description": "authz paper",
                                               "quantity": 10,
                                               "unit_price": 25}]})
                check("owner creates a purchase via RPC (total computed server-side)",
                      s == 200 and isinstance(b, dict) and b.get("id")
                      and float(b.get("total") or 0) == 250.0,
                      f"got {s} {str(b)[:160]}")
                ledger_purchase = b.get("id") if isinstance(b, dict) else None
                s, b = rest(url, anon, "POST", "/rest/v1/purchase_payments",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "purchase_id": ledger_purchase,
                                  "amount": 100, "method": "cash",
                                  "paid_on": "2026-11-02"})
                prow = b if isinstance(b, list) else []
                check("owner records a purchase payment (ledger insert)",
                      s in (200, 201) and len(prow) == 1, f"got {s} {str(b)[:120]}")
                ledger_payment = prow[0]["id"] if prow else None
                if ledger_payment:
                    s, b = rest(url, anon, "PATCH",
                                f"/rest/v1/purchase_payments?id=eq.{ledger_payment}",
                            jwt=demo_jwt,
                                body={"amount": 999})
                    amt = sql(ref, "select amount from purchase_payments "
                                   f"where id = '{ledger_payment}'")
                    check("purchase_payments are immutable — no update path (RLS)",
                          amt and float(amt[0]["amount"]) == 100.0,
                          f"got {amt}")
                    s, b = rest(url, anon, "DELETE",
                                f"/rest/v1/purchase_payments?id=eq.{ledger_payment}",
                            jwt=demo_jwt)
                    left = sql(ref, "select count(*) as c from purchase_payments "
                                    f"where id = '{ledger_payment}'")
                    check("purchase_payments cannot be deleted (ledger — corrections "
                          "are negative entries only)",
                          left and int(left[0]["c"]) == 1, f"got {left}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/purchase_balances?select=purchase_id,remaining"
                            f"&purchase_id=eq.{ledger_purchase}",
                            jwt=demo_jwt)
                check("owner reads purchase_balances (paid 100 of 250 → 150)",
                      s == 200 and isinstance(b, list) and len(b) == 1
                      and float(b[0]["remaining"]) == 150.0,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/create_sale",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_student_id": demo_student,
                                  "p_buyer_name": None,
                                  "p_sale_date": "2026-11-03",
                                  "p_amount_paid": 40,
                                  "p_note": "authz",
                                  "p_lines": [{"description": "authz book",
                                               "quantity": 2,
                                               "unit_price": 30}]})
                check("owner creates a sale via RPC (paid ≤ total enforced)",
                      s == 200 and isinstance(b, dict) and b.get("id")
                      and float(b.get("remaining") or 0) == 20.0,
                      f"got {s} {str(b)[:160]}")
                ledger_sale = b.get("id") if isinstance(b, dict) else None
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/create_sale",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_student_id": demo_student,
                                  "p_buyer_name": None,
                                  "p_sale_date": "2026-11-03",
                                  "p_amount_paid": 999,
                                  "p_note": "authz overpay",
                                  "p_lines": [{"description": "authz book",
                                               "quantity": 1,
                                               "unit_price": 30}]})
                check("sale with amount_paid above the total is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/supplier_payables?select=supplier_id,remaining"
                            f"&supplier_id=eq.{ledger_supplier}",
                            jwt=demo_jwt)
                check("owner reads supplier_payables (remaining 150)",
                      s == 200 and isinstance(b, list) and len(b) == 1
                      and float(b[0]["remaining"]) == 150.0,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/monthly_centre_finance?select=month"
                            f"&teacher_id=eq.{demo_teacher}",
                            jwt=other_jwt)
                check("other teacher reads none of demo's monthly centre finance",
                      s == 200 and b == [], f"got {s}")
            finally:
                sql(ref, "delete from sale_lines "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from sales "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from purchase_payments "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from purchase_lines "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from purchases "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from suppliers "
                         f"where teacher_id = '{demo_teacher}'")
                left = sql(ref, "select "
                                "(select count(*) from suppliers "
                                f"where teacher_id = '{demo_teacher}') as s, "
                                "(select count(*) from purchases "
                                f"where teacher_id = '{demo_teacher}') as p, "
                                "(select count(*) from sales "
                                f"where teacher_id = '{demo_teacher}') as sl")
                check("0051 fixtures cleaned",
                      left and int(left[0]["s"]) == 0 and int(left[0]["p"]) == 0
                      and int(left[0]["sl"]) == 0, f"got {left}")

        # ---------- TEACHER FEEDBACK (0052 — قناة ملاحظات المدرس) ----------
        # ⚠️ المهاجرة 0052 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        print("TEACHER FEEDBACK (0052):")
        fb_probe = sql(ref, "select to_regclass('public.teacher_feedback') as t")
        if not fb_probe or not fb_probe[0].get("t"):
            print("  SKIP 0052 live section — migration 0052 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PHASE2-T11-FIRST-RUN.md)")
        else:
            try:
                s, b = rest(url, anon, "GET", "/rest/v1/teacher_feedback?select=id")
                check("anon reads no teacher feedback (no grant)",
                      s in (401, 403) or (s == 200 and b == []), f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/submit_teacher_feedback",
                            jwt=asst_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "suggestion",
                                  "p_body": "authz feedback from assistant"})
                check("active assistant member submits feedback via RPC",
                      s == 200 and isinstance(b, dict) and b.get("id"),
                      f"got {s} {str(b)[:120]}")
                fb_id = b.get("id") if isinstance(b, dict) else None
                s, b = rest(url, anon, "GET", "/rest/v1/teacher_feedback?select=id",
                            jwt=asst_jwt)
                check("assistant reads no feedback list (owner-only RLS)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/teacher_feedback?select=id,status",
                            jwt=demo_jwt)
                rows = b if isinstance(b, list) else []
                check("owner reads his centre's feedback",
                      s == 200 and len(rows) == 1 and rows[0].get("status") == "new",
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET", "/rest/v1/teacher_feedback?select=id",
                            jwt=other_jwt)
                check("other teacher reads none of demo's feedback",
                      s == 200 and b == [], f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/submit_teacher_feedback",
                            jwt=other_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "problem",
                                  "p_body": "authz stranger feedback"})
                check("a stranger cannot submit feedback for demo's centre",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/submit_teacher_feedback",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "bogus",
                                  "p_body": "authz invalid kind"})
                check("invalid feedback kind is rejected by the RPC",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/teacher_feedback",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "author_user_id": demo_uid,
                                  "kind": "praise",
                                  "body": "authz direct insert attempt"})
                check("even the owner cannot insert feedback directly (RPC only)",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "PATCH",
                            f"/rest/v1/teacher_feedback?id=eq.{fb_id}",
                            jwt=demo_jwt, body={"status": "read"})
                st = sql(ref, "select status from teacher_feedback "
                              f"where id = '{fb_id}'")
                check("owner marks feedback read (status persisted)",
                      s in (200, 204) and st and st[0]["status"] == "read",
                      f"got {s} {st}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/teacher_feedback?select=id&status=eq.new",
                            jwt=demo_jwt)
                check("unread count query returns zero after marking read",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
            finally:
                sql(ref, "delete from teacher_feedback "
                         f"where teacher_id = '{demo_teacher}'")
                left = sql(ref, "select count(*) as c from teacher_feedback "
                                f"where teacher_id = '{demo_teacher}'")
                check("0052 fixtures cleaned",
                      left and int(left[0]["c"]) == 0, f"got {left}")

        # ---------- ERROR REPORTS (0053 — سجل أخطاء الإنتاج الداخلي) ----------
        # ⚠️ المهاجرة 0053 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل)، وبعد التطبيق يشتغل كاملاً.
        print("ERROR REPORTS (0053):")
        er_probe = sql(ref, "select to_regclass('public.error_reports') as t")
        if not er_probe or not er_probe[0].get("t"):
            print("  SKIP 0053 live section — migration 0053 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PHASE2-T11-FIRST-RUN.md)")
        else:
            try:
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/report_client_error",
                            body={"p_teacher_id": None,
                                  "p_kind": "unhandled",
                                  "p_message": "authz anon pre-login error",
                                  "p_stack": None, "p_route": "/login",
                                  "p_app_version": "1.0.0"})
                check("anonymous pre-login error intake works (no context)",
                      s == 200 and isinstance(b, dict) and b.get("id"),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/report_client_error",
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "unhandled",
                                  "p_message": "authz anon with foreign context",
                                  "p_stack": None, "p_route": "/login",
                                  "p_app_version": "1.0.0"})
                check("anonymous report cannot claim a teacher context",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/report_client_error",
                            jwt=other_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "render",
                                  "p_message": "authz stranger context error",
                                  "p_stack": None, "p_route": "/",
                                  "p_app_version": "1.0.0"})
                check("a stranger cannot report under demo's teacher context",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/report_client_error",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "bogus",
                                  "p_message": "authz invalid kind",
                                  "p_stack": None, "p_route": "/",
                                  "p_app_version": "1.0.0"})
                check("invalid error kind is rejected by the intake RPC",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/report_client_error",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "render",
                                  "p_message": "authz owner error " + "x" * 3000,
                                  "p_stack": "authz stack", "p_route": "/money",
                                  "p_app_version": "1.0.0"})
                check("owner reports an error under his own context",
                      s == 200 and isinstance(b, dict) and b.get("id"),
                      f"got {s} {str(b)[:120]}")
                er_len = sql(ref, "select char_length(message) as n "
                                  "from error_reports "
                                  "where message like 'authz owner error%'")
                check("server truncates stored message to 2000 chars",
                      er_len and int(er_len[0]["n"]) == 2000, f"got {er_len}")
                s, b = rest(url, anon, "GET", "/rest/v1/error_reports?select=id",
                            jwt=demo_jwt)
                rows = b if isinstance(b, list) else []
                check("owner reads exactly his own context's reports",
                      s == 200 and len(rows) == 1, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET", "/rest/v1/error_reports?select=id",
                            jwt=asst_jwt)
                check("assistant reads no error reports (owner-only RLS)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET", "/rest/v1/error_reports?select=id")
                check("anon reads no error reports (no grant)",
                      s in (401, 403) or (s == 200 and b == []), f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/error_reports",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "kind": "render",
                                  "message": "authz direct insert attempt"})
                check("even the owner cannot insert error rows directly (RPC only)",
                      s >= 400, f"got {s} {str(b)[:120]}")
            finally:
                sql(ref, "delete from error_reports "
                         "where message like 'authz %'")
                left = sql(ref, "select count(*) as c from error_reports "
                                "where message like 'authz %'")
                check("0053 fixtures cleaned",
                      left and int(left[0]["c"]) == 0, f"got {left}")

        # ---------- PLATFORM ADMIN (0055 — أساس أدمن المنصة، T17) ----------
        # ⚠️ المهاجرة 0055 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: فصل نوعي المستخدمين في الاتجاهين — الأدمن يرى تجميعات
        # المنصة فقط ولا يلمس صفوف مدرس تشغيلية، والمدرس لا يلمس أي سطح
        # منصة (فحص/نظرة عامة/سجل تدقيق/قائمة أدمن).
        print("PLATFORM ADMIN (0055):")
        pa_probe = sql(ref, "select to_regclass('public.platform_admins') as t")
        if not pa_probe or not pa_probe[0].get("t"):
            print("  SKIP 0055 live section — migration 0055 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-FOUNDATION.md)")
        else:
            pw_admin = secrets.token_urlsafe(18)
            admin_uid = create_user_sql(
                ref, "authz-admin@teacher-app.test", pw_admin)
            try:
                admin_jwt, _ = sign_in(
                    url, anon, "authz-admin@teacher-app.test", pw_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{admin_uid}', 'authz fixture')")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_platform_admin",
                            jwt=admin_jwt, body={})
                check("platform admin passes my_platform_admin",
                      s == 200 and b is True, f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_platform_admin",
                            jwt=demo_jwt, body={})
                check("a teacher is NOT a platform admin",
                      s == 200 and b is False, f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_platform_admin",
                            body={})
                check("anon cannot call my_platform_admin (no grant)",
                      s in (401, 403, 404), f"got {s}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/platform_overview",
                            jwt=demo_jwt, body={})
                check("a teacher cannot call platform_overview",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/platform_overview",
                            jwt=admin_jwt, body={})
                totals = sql(ref, "select count(*) as c from teachers")
                check("admin overview returns aggregate counts only",
                      s == 200 and isinstance(b, dict)
                      and int(b.get("teachers_total", -1))
                      == int(totals[0]["c"]),
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET", "/rest/v1/students?select=id",
                            jwt=admin_jwt)
                check("admin reads NO teacher operational rows (students)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET", "/rest/v1/teachers?select=id",
                            jwt=admin_jwt)
                check("admin reads NO teacher rows via normal policies",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET", "/rest/v1/platform_admins?select=user_id",
                            jwt=demo_jwt)
                check("a teacher cannot read the platform_admins list",
                      s in (401, 403, 404) or (s == 200 and b == []),
                      f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/platform_audit_log",
                            jwt=admin_jwt,
                            body={"admin_user_id": admin_uid,
                                  "action": "authz_probe",
                                  "details": {}})
                check("admin writes an audit row under his own id",
                      s in (201, 204), f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/platform_audit_log?select=id,action",
                            jwt=admin_jwt)
                rows = b if isinstance(b, list) else []
                check("admin reads the platform audit log",
                      s == 200 and len(rows) == 1
                      and rows[0].get("action") == "authz_probe",
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/platform_audit_log?select=id",
                            jwt=demo_jwt)
                check("a teacher reads no platform audit rows",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/platform_audit_log",
                            jwt=demo_jwt,
                            body={"admin_user_id": admin_uid,
                                  "action": "authz_spoof",
                                  "details": {}})
                check("a teacher cannot spoof an audit row as the admin",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "PATCH",
                            "/rest/v1/platform_audit_log?action=eq.authz_probe",
                            jwt=admin_jwt, body={"action": "authz_tampered"})
                after = sql(ref, "select action from platform_audit_log "
                                 f"where admin_user_id = '{admin_uid}'")
                check("audit log is append-only (admin PATCH changes nothing)",
                      len(after) == 1 and after[0]["action"] == "authz_probe",
                      f"got {s} {after}")
            finally:
                sql(ref, "delete from platform_audit_log "
                         f"where admin_user_id = '{admin_uid}'")
                sql(ref, "delete from auth.users "
                         f"where id = '{admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{admin_uid}') as pa, "
                                "(select count(*) from platform_audit_log "
                                f"where admin_user_id = '{admin_uid}') as al")
                check("0055 fixtures cleaned",
                      left and int(left[0]["pa"]) == 0
                      and int(left[0]["al"]) == 0, f"got {left}")

        # ---------- REGISTRATION LOCK + ALLOWLIST (0057 — T17 الخطوة 2) ----------
        # ⚠️ المهاجرة 0057 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: البوابة قبل التسجيل (can_self_register — بلا جلسة) +
        # نقطة الإنفاذ الحقيقية (create_teacher_profile_for_self ببريد
        # JWT نفسه) — المرفوض لا يتحول لملف مدرس، والمسموح يولد غير
        # مفعّل حتى يفعّله الأدمن. ملحوظة: القفل يُختبر هنا بإغلاقه
        # مؤقتاً ثم إرجاعه مفتوحاً في الـ finally — أي فشل وسط القسم
        # يترك التسجيل مقفولاً، لذلك الإرجاع في finally لا في نهاية
        # المسار العادي.
        print("REGISTRATION LOCK + ALLOWLIST (0057):")
        al_probe = sql(ref, "select to_regclass('public.teacher_allowlist') as t")
        if not al_probe or not al_probe[0].get("t"):
            print("  SKIP 0057 live section — migration 0057 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-ALLOWLIST.md)")
        else:
            pw_allowed = secrets.token_urlsafe(18)
            pw_blocked = secrets.token_urlsafe(18)
            allowed_uid = create_user_sql(
                ref, "authz-allowed@teacher-app.test", pw_allowed)
            blocked_uid = create_user_sql(
                ref, "authz-blocked@teacher-app.test", pw_blocked)
            try:
                sql(ref, "insert into teacher_allowlist (email, note) values "
                         "('authz-allowed@teacher-app.test', 'authz fixture')")
                sql(ref, "update platform_settings set value = 'false'::jsonb "
                         "where key = 'registration_open'")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/can_self_register",
                            body={"p_email": "authz-allowed@teacher-app.test",
                                  "p_phone": None})
                check("allowlisted email passes the gate while locked",
                      s == 200 and b is True, f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/can_self_register",
                            body={"p_email": "authz-blocked@teacher-app.test",
                                  "p_phone": None})
                check("non-allowlisted email is refused while locked",
                      s == 200 and b is False, f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST", "/rest/v1/rpc/can_self_register",
                            body={"p_email": "AUTHZ-ALLOWED@teacher-app.test",
                                  "p_phone": None})
                check("allowlist email match is case-insensitive",
                      s == 200 and b is True, f"got {s} {str(b)[:80]}")
                blocked_jwt, _ = sign_in(
                    url, anon, "authz-blocked@teacher-app.test", pw_blocked)
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_teacher_profile_for_self",
                            jwt=blocked_jwt,
                            body={"p_display_name": "مرفوض",
                                  "p_phone": None})
                check("blocked user cannot create a teacher profile",
                      s >= 400, f"got {s} {str(b)[:120]}")
                allowed_jwt, _ = sign_in(
                    url, anon, "authz-allowed@teacher-app.test", pw_allowed)
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_teacher_profile_for_self",
                            jwt=allowed_jwt,
                            body={"p_display_name": "مسموح",
                                  "p_phone": None})
                check("allowlisted user creates a profile",
                      s == 200 and isinstance(b, dict)
                      and b.get("id") == allowed_uid,
                      f"got {s} {str(b)[:120]}")
                row = sql(ref, "select account_activated from teachers "
                               f"where id = '{allowed_uid}'")
                check("new self-registered profile starts non-activated",
                      row and row[0]["account_activated"] is False,
                      f"got {row}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_teacher_profile_for_self",
                            jwt=allowed_jwt,
                            body={"p_display_name": "مسموح",
                                  "p_phone": None})
                check("profile creation is idempotent (existing row returned)",
                      s == 200 and isinstance(b, dict)
                      and b.get("id") == allowed_uid,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/teacher_allowlist?select=id",
                            jwt=demo_jwt)
                check("a teacher cannot read the allowlist",
                      s in (401, 403, 404) or (s == 200 and b == []),
                      f"got {s} {str(b)[:80]}")
                # بلا سياسة UPDATE يرجع PostgREST ‏204 بلا أي صف معدَّل —
                # الحكم هنا من القاعدة نفسها (القيمة ما زالت false)، لا
                # من كود الحالة (نفس نمط فحص append-only في قسم 0055).
                s, b = rest(url, anon, "PATCH",
                            "/rest/v1/platform_settings?key=eq.registration_open",
                            jwt=demo_jwt, body={"value": True})
                val = sql(ref, "select value from platform_settings "
                               "where key = 'registration_open'")
                check("a teacher cannot flip the registration lock",
                      val and val[0]["value"] is False,
                      f"got {s} {val}")
            finally:
                sql(ref, "update platform_settings set value = 'true'::jsonb "
                         "where key = 'registration_open'")
                sql(ref, "delete from teacher_allowlist "
                         "where email = 'authz-allowed@teacher-app.test'")
                sql(ref, "delete from auth.users "
                         f"where id in ('{allowed_uid}', '{blocked_uid}')")
                left = sql(ref, "select "
                                "(select count(*) from teacher_allowlist "
                                "where email = 'authz-allowed@teacher-app.test') as al, "
                                "(select count(*) from teachers "
                                f"where id in ('{allowed_uid}', '{blocked_uid}')) as t, "
                                "(select value from platform_settings "
                                "where key = 'registration_open') as open")
                check("0057 fixtures cleaned + registration reopened",
                      left and int(left[0]["al"]) == 0
                      and int(left[0]["t"]) == 0
                      and left[0]["open"] is True, f"got {left}")

        # ---------- PLANS + SUBSCRIPTIONS (0058 — T19 الخطوة 3) ----------
        # ⚠️ المهاجرة 0058 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: الباقات كبيانات بلا أسعار (م1 للمالك) + ربط كل حساب
        # بباقة — المالك يرى اشتراكه هو فقط عبر my_subscription، ومدرس
        # آخر لا يرى اشتراكه ولا يغيّره، والزائر لا يرى شيئاً؛ والأدمن
        # يقرأ عبر RPC الحارس. ملحوظة: فحص باقة الديمو نفسها بلا
        # كتابة (التعبئة الرجعية ربطته بالتجريبي)؛ لا تُغيَّر باقة أي
        # حساب حي في هذا القسم — التغيير فعل أدمن لاحق (الخطوة 4).
        print("PLANS + SUBSCRIPTIONS (0058):")
        pl_probe = sql(ref, "select to_regclass('public.plans') as t")
        if not pl_probe or not pl_probe[0].get("t"):
            print("  SKIP 0058 live section — migration 0058 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-PLANS.md)")
        else:
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_subscription",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("owner reads his own subscription via my_subscription",
                  s == 200 and isinstance(b, dict)
                  and b.get("plan_slug") == "trial"
                  and isinstance(b.get("limits"), dict),
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/plan_limits",
                        jwt=demo_jwt, body={"p_teacher_id": demo_teacher})
            check("owner reads his plan limits via plan_limits",
                  s == 200 and isinstance(b, dict)
                  and int(b.get("max_students", -1)) == 50,
                  f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_subscription",
                        jwt=other_jwt, body={"p_teacher_id": demo_teacher})
            check("another teacher cannot read this subscription",
                  s >= 400, f"got {s} {str(b)[:120]}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/my_subscription",
                        body={"p_teacher_id": demo_teacher})
            check("anon cannot call my_subscription (no grant)",
                  s in (401, 403, 404), f"got {s}")
            s, b = rest(url, anon, "GET",
                        "/rest/v1/subscriptions?select=teacher_id,plan_slug",
                        jwt=other_jwt)
            check("another teacher reads no subscription rows",
                  s == 200 and b == [], f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "GET", "/rest/v1/plans?select=slug",
                        jwt=demo_jwt)
            check("a teacher cannot read the plans table directly",
                  s in (401, 403, 404) or (s == 200 and b == []),
                  f"got {s} {str(b)[:80]}")
            s, b = rest(url, anon, "PATCH",
                        "/rest/v1/subscriptions?teacher_id=eq." + demo_teacher,
                        jwt=demo_jwt, body={"plan_slug": "pro"})
            row = sql(ref, "select plan_slug from subscriptions "
                           f"where teacher_id = '{demo_teacher}'")
            check("owner cannot change his own plan (no client UPDATE)",
                  row and row[0]["plan_slug"] == "trial",
                  f"got {s} {row}")
            s, b = rest(url, anon, "POST", "/rest/v1/rpc/plan_limits",
                        jwt=other_jwt, body={"p_teacher_id": demo_teacher})
            check("another teacher cannot read this plan limits",
                  s >= 400, f"got {s} {str(b)[:120]}")

        # ---------- ACCOUNT OVERRIDES (0059 — T18 الخطوة 4) ----------
        # ⚠️ المهاجرة 0059 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: التجاوز يفوز على الباقة وينتهي في ميعاده — والمدرس لا
        # يرى تجاوزاته إطلاقاً (لا قراءة جدول ولا RPC كتابة)، ويرى
        # الأثر فقط عبر effective_entitlements(). كل تجاوز يُنشأ هنا
        # يُلغى وينظَّف في finally؛ باقة الديمو نفسها لا تتغير إطلاقاً.
        print("ACCOUNT OVERRIDES (0059):")
        ov_probe = sql(ref, "select to_regclass('public.account_overrides') as t")
        if not ov_probe or not ov_probe[0].get("t"):
            print("  SKIP 0059 live section — migration 0059 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-OVERRIDES.md)")
        else:
            pw_ov_admin = secrets.token_urlsafe(18)
            ov_admin_uid = create_user_sql(
                ref, "authz-ov-admin@teacher-app.test", pw_ov_admin)
            try:
                ov_admin_jwt, _ = sign_in(
                    url, anon, "authz-ov-admin@teacher-app.test", pw_ov_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{ov_admin_uid}', 'authz overrides fixture')")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/account_overrides?select=id",
                            jwt=demo_jwt)
                check("a teacher reads NO override rows directly",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                # «فارغ» هنا = لا تجاوزات نشطة: الإلغاء في 0059 يكون
                # بضبط expires_at (الصف يبقى سجلاً تاريخياً بالتصميم)،
                # فأي تشغيلة سابقة تترك صفوفاً منتهية تكسر فحص فراغ
                # الجدول الخام — نحوّل الفحص للنشط فقط بنفس محمول
                # عدّ التنظيف في قسم 0062.
                s, b = rest(url, anon, "GET",
                            "/rest/v1/account_overrides?select=id"
                            "&or=(expires_at.is.null,expires_at.gt.now())",
                            jwt=ov_admin_jwt)
                check("admin reads the overrides table (empty)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "limit",
                                  "p_key": "max_students",
                                  "p_value": 999,
                                  "p_reason": "authz spoof"})
                check("a teacher cannot set an override",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=ov_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "limit",
                                  "p_key": "max_students",
                                  "p_value": 200,
                                  "p_reason": "authz fixture"})
                ov_id = b if isinstance(b, str) and b else None
                check("admin sets a limit override",
                      s == 200 and ov_id, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/effective_entitlements",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher})
                check("override wins over the plan in effective_entitlements",
                      s == 200 and isinstance(b, dict)
                      and int(b.get("limits", {}).get("max_students", -1)) == 200
                      and "limit:max_students" in (b.get("overrides_applied") or []),
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/effective_entitlements",
                            jwt=other_jwt,
                            body={"p_teacher_id": demo_teacher})
                check("another teacher cannot read these entitlements",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=ov_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "feature",
                                  "p_key": "whatsapp_auto",
                                  "p_value": "yes",
                                  "p_reason": "authz bad value"})
                check("feature override with a non-boolean value is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                left = sql(ref, "select count(*) as c from account_overrides "
                                f"where teacher_id = '{demo_teacher}' "
                                "and kind = 'feature'")
                check("rejected override left no feature row",
                      left and int(left[0]["c"]) == 0, f"got {left}")
                if ov_id:
                    s, b = rest(url, anon, "POST",
                                "/rest/v1/rpc/revoke_account_override",
                                jwt=ov_admin_jwt,
                                body={"p_override_id": ov_id})
                    check("admin revokes the override",
                          s == 200 and b == ov_id,
                          f"got {s} {str(b)[:120]}")
                    s, b = rest(url, anon, "POST",
                                "/rest/v1/rpc/effective_entitlements",
                                jwt=demo_jwt,
                                body={"p_teacher_id": demo_teacher})
                    check("after revoke the plan limit returns (trial 50)",
                          s == 200 and isinstance(b, dict)
                          and int(b.get("limits", {}).get("max_students", -1)) == 50
                          and (b.get("overrides_applied") or []) == [],
                          f"got {s} {str(b)[:160]}")
                audit = sql(ref, "select action, count(*) as c "
                                 "from platform_audit_log "
                                 f"where target_teacher_id = '{demo_teacher}' "
                                 "and action in ('override_set', 'override_revoked') "
                                 "group by action order by action")
                acts = {r["action"]: int(r["c"]) for r in audit}
                check("set + revoke both left audit rows",
                      acts.get("override_set", 0) >= 1
                      and acts.get("override_revoked", 0) >= 1,
                      f"got {acts}")
            finally:
                sql(ref, "delete from account_overrides "
                         f"where teacher_id = '{demo_teacher}'")
                sql(ref, "delete from platform_audit_log "
                         f"where target_teacher_id = '{demo_teacher}' "
                         "and action in ('override_set', 'override_revoked')")
                sql(ref, "delete from auth.users "
                         f"where id = '{ov_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from account_overrides "
                                f"where teacher_id = '{demo_teacher}') as ov, "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{ov_admin_uid}') as pa")
                check("0059 fixtures cleaned",
                      left and int(left[0]["ov"]) == 0
                      and int(left[0]["pa"]) == 0, f"got {left}")

        # ---------- PLATFORM PANEL (0061 — T17 الخطوة 7) ----------
        # ⚠️ المهاجرة 0061 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الدوال أولاً: إن
        # غابت يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: دوال اللوحة للأدمن فقط (قوائم ومؤشرات وأفعال) — المدرس
        # والمجهول مرفوضان، وقلب التفعيل يكتب سطر تدقيق، والإيراد المتوقع
        # null (لا أسعار معتمدة — قرار مالك م1). حالة الديمو (التفعيل +
        # الباقة) تُقرأ قبل أي لمس وتُستعاد حرفياً في finally.
        print("PLATFORM PANEL (0061):")
        panel_probe = sql(ref, "select to_regprocedure("
                               "'public.platform_workspaces()') as f")
        if not panel_probe or not panel_probe[0].get("f"):
            print("  SKIP 0061 live section — migration 0061 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-PANEL.md)")
        else:
            pw_panel_admin = secrets.token_urlsafe(18)
            panel_admin_uid = create_user_sql(
                ref, "authz-panel-admin@teacher-app.test", pw_panel_admin)
            orig = sql(ref, "select t.account_activated as act, "
                            "s.plan_slug as plan from teachers t "
                            "left join subscriptions s "
                            "on s.teacher_id = t.id "
                            f"where t.id = '{demo_teacher}'")
            orig_act = bool(orig[0]["act"]) if orig else True
            orig_plan = orig[0]["plan"] if orig else None
            try:
                panel_admin_jwt, _ = sign_in(
                    url, anon, "authz-panel-admin@teacher-app.test",
                    pw_panel_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{panel_admin_uid}', 'authz panel fixture')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_workspaces",
                            jwt=demo_jwt, body={})
                check("a teacher cannot list platform workspaces",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_indicators",
                            jwt=demo_jwt, body={})
                check("a teacher cannot read platform indicators",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_set_account_activated",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_activated": False,
                                  "p_reason": "authz spoof"})
                check("a teacher cannot flip account activation",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_workspaces",
                            jwt=None, body={})
                check("anon cannot list platform workspaces",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_workspaces",
                            jwt=panel_admin_jwt, body={})
                demo_row = None
                if s == 200 and isinstance(b, list):
                    demo_row = next(
                        (r for r in b
                         if r.get("teacher_id") == demo_teacher), None)
                check("admin lists workspaces incl. the demo teacher",
                      demo_row is not None
                      and demo_row.get("plan_slug") == orig_plan,
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_indicators",
                            jwt=panel_admin_jwt, body={})
                check("admin reads indicators; revenue stays null (no prices)",
                      s == 200 and isinstance(b, dict)
                      and int(b.get("teachers_total", 0)) >= 1
                      and b.get("expected_revenue") is None
                      and set((b.get("subscriptions_by_plan") or {}).keys())
                      == {"trial", "basic", "pro", "pilot"},
                      f"got {s} {str(b)[:200]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_set_account_activated",
                            jwt=panel_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_activated": not orig_act,
                                  "p_reason": "authz flip"})
                check("admin flips the demo activation flag",
                      s == 200, f"got {s} {str(b)[:120]}")
                flipped = sql(ref, "select account_activated as act "
                                   "from teachers "
                                   f"where id = '{demo_teacher}'")
                check("the flip landed in teachers.account_activated",
                      flipped and bool(flipped[0]["act"]) == (not orig_act),
                      f"got {flipped}")
                audit = sql(ref, "select count(*) as c "
                                 "from platform_audit_log "
                                 f"where target_teacher_id = '{demo_teacher}' "
                                 "and action in ('account_activated', "
                                 "'account_deactivated')")
                check("the flip wrote a platform audit row",
                      audit and int(audit[0]["c"]) >= 1, f"got {audit}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_set_subscription_plan",
                            jwt=panel_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_plan_slug": "no-such-plan"})
                check("assigning an unknown plan is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
            finally:
                sql(ref, "update teachers set account_activated = "
                         f"{'true' if orig_act else 'false'} "
                         f"where id = '{demo_teacher}'")
                if orig_plan:
                    sql(ref, "update subscriptions set plan_slug = "
                             f"'{orig_plan}' where teacher_id = "
                             f"'{demo_teacher}'")
                sql(ref, "delete from platform_audit_log "
                         f"where target_teacher_id = '{demo_teacher}' "
                         "and action in ('account_activated', "
                         "'account_deactivated', "
                         "'subscription_plan_changed')")
                sql(ref, "delete from auth.users "
                         f"where id = '{panel_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{panel_admin_uid}') as pa, "
                                "(select account_activated from teachers "
                                f"where id = '{demo_teacher}') as act")
                check("0061 fixtures cleaned + demo state restored",
                      left and int(left[0]["pa"]) == 0
                      and bool(left[0]["act"]) == orig_act, f"got {left}")

        # ---------- USAGE COUNTERS + ENFORCEMENT (0062 — T19 الخطوة 5) ----------
        # ⚠️ المهاجرة 0062 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الدالة أولاً: إن
        # غابت يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: ملخص الاستخدام للمالك/العضو/الأدمن فقط (المجهول
        # مرفوض)، وعدّاد الرسائل بلا كتابة عميل، وإنفاذ حد الطلاب
        # خادمياً: تجاوز max_students=0 يرفض إدراج طالب جديد، وسحب
        # التجاوز يعيد الإدراج — ثم تنظيف كامل (حذف الطالب الاستكشافي
        # + سحب التجاوز + حذف مستخدم الأدمن المؤقت).
        print("USAGE COUNTERS (0062):")
        usage_probe = sql(ref, "select to_regprocedure(\n"
                               "'public.usage_summary(uuid)') as f")
        if not usage_probe or not usage_probe[0].get("f"):
            print("  SKIP 0062 live section — migration 0062 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate)")
        else:
            pw_usage_admin = secrets.token_urlsafe(18)
            usage_admin_uid = create_user_sql(
                ref, "authz-usage-admin@teacher-app.test", pw_usage_admin)
            usage_override_id = None
            try:
                usage_admin_jwt, _ = sign_in(
                    url, anon, "authz-usage-admin@teacher-app.test",
                    pw_usage_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{usage_admin_uid}', 'authz usage fixture')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/usage_counters",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "period_month": "2026-11-01",
                                  "counter_key": "messages_month",
                                  "value": 1})
                check("a teacher cannot insert into usage_counters",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/usage_summary",
                            body={"p_teacher_id": demo_teacher})
                check("anon cannot call usage_summary",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/usage_summary",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher})
                summary_ok = (
                    s == 200 and isinstance(b, dict)
                    and str(b.get("period_month", ""))[:7]
                    == time.strftime("%Y-%m", time.gmtime())
                    and all(
                        isinstance(b.get(k), dict)
                        and isinstance(b[k].get("used"), int)
                        and b[k].get("used") >= 0
                        and isinstance(b[k].get("at_limit"), bool)
                        for k in ("students", "messages_month", "storage_mb",
                                  "team_members", "ai_messages_month")))
                summary_body = b if summary_ok else None
                check("owner reads own usage summary (5 keys, used >= 0)",
                      summary_ok, f"got {s} {str(b)[:200]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/check_usage_limit",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_key": "max_students"})
                check("check_usage_limit agrees with the summary",
                      s == 200 and isinstance(b, dict)
                      and b.get("key") == "max_students"
                      and isinstance(b.get("allowed"), bool)
                      and (summary_body is None
                           or b.get("allowed")
                           == (not summary_body["students"]["at_limit"])),
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/check_usage_limit",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_key": "no_such_key"})
                check("an unknown usage key is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                # حد مضبوط على صفر عبر تجاوز أدمن: الملخص والفحص
                # يرفضان، وإدراج طالب جديد يرفضه التريجر، وسحب التجاوز
                # يعيد الإدراج.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=usage_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "limit",
                                  "p_key": "max_students",
                                  "p_value": 0,
                                  "p_reason": "authz limit probe"})
                usage_override_id = b if isinstance(b, str) else None
                check("admin sets a max_students=0 override",
                      s == 200 and usage_override_id,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/usage_summary",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher})
                check("the override flows into the summary (limit 0)",
                      s == 200 and isinstance(b, dict)
                      and b.get("students", {}).get("limit") == 0
                      and b.get("students", {}).get("at_limit") is True,
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/check_usage_limit",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_key": "max_students"})
                check("the override makes check_usage_limit refuse",
                      s == 200 and isinstance(b, dict)
                      and b.get("allowed") is False
                      and b.get("limit") == 0,
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/students",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "name": "authz-limit-probe"})
                check("the student-limit trigger rejects the insert",
                      s >= 400, f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/revoke_account_override",
                            jwt=usage_admin_jwt,
                            body={"p_override_id": usage_override_id})
                check("admin revokes the override",
                      s == 200, f"got {s} {str(b)[:120]}")
                usage_override_id = None
                s, b = rest(url, anon, "POST",
                            "/rest/v1/students",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "name": "authz-limit-probe"})
                # إدراج الجدول مع return=representation يرجّع قائمة
                # بصف واحد لا كائناً (نمط PR #60) — نلتقط الصف من
                # أيّ الشكلين.
                probe_row = b[0] if isinstance(b, list) and b else (
                    b if isinstance(b, dict) else None)
                check("the insert works again after the revoke",
                      s in (200, 201) and probe_row
                      and probe_row.get("name") == "authz-limit-probe",
                      f"got {s} {str(b)[:160]}")
            finally:
                if usage_override_id:
                    sql(ref, "delete from account_overrides "
                             f"where id = '{usage_override_id}'")
                sql(ref, "delete from students "
                         f"where teacher_id = '{demo_teacher}' "
                         "and name = 'authz-limit-probe'")
                # بلا حذف من usage_counters: محاولة الإدراج المرفوضة لا
                # تترك صفاً أصلاً، وحذف صف بعدّاد حقيقي (قيمة 1) كان
                # سيفسد بيانات استخدام فعلية.
                sql(ref, "delete from platform_audit_log "
                         f"where target_teacher_id = '{demo_teacher}' "
                         "and action in ('override_set', 'override_revoked')")
                sql(ref, "delete from auth.users "
                         f"where id = '{usage_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{usage_admin_uid}') as pa, "
                                "(select count(*) from account_overrides "
                                f"where teacher_id = '{demo_teacher}' "
                                "and key = 'max_students' "
                                "and (expires_at is null "
                                "or expires_at > now())) as ov, "
                                "(select count(*) from students "
                                f"where teacher_id = '{demo_teacher}' "
                                "and name = 'authz-limit-probe') as st")
                check("0062 fixtures cleaned + demo state restored",
                      left and int(left[0]["pa"]) == 0
                      and int(left[0]["ov"]) == 0
                      and int(left[0]["st"]) == 0, f"got {left}")
        # ---------- ROLE TEMPLATES (0063 — T18 قوالب الأدوار الجاهزة) ----------
        # ⚠️ المهاجرة 0063 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: القالب حزمة استحقاقات جاهزة — تطبيقه يكتب تجاوزاً
        # فردياً واحداً لكل إدخال عبر set_account_override نفسه، فيُحلّ
        # عبر effective_entitlements (بما فيها خريطة settings الجديدة
        # ومفتاحا التأكيد الإلزامي 17:19)، والمدرس لا يرى القوالب
        # إطلاقاً. كل ما يُنشأ هنا يُلغى وينظَّف في finally؛ باقة
        # الديمو نفسها لا تتغير إطلاقاً.
        print("ROLE TEMPLATES (0063):")
        tpl_probe = sql(ref, "select to_regclass('public.role_templates') as t")
        if not tpl_probe or not tpl_probe[0].get("t"):
            print("  SKIP 0063 live section — migration 0063 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-TEMPLATES.md)")
        else:
            pw_tpl_admin = secrets.token_urlsafe(18)
            tpl_admin_uid = create_user_sql(
                ref, "authz-tpl-admin@teacher-app.test", pw_tpl_admin)
            tpl_id = None
            try:
                tpl_admin_jwt, _ = sign_in(
                    url, anon, "authz-tpl-admin@teacher-app.test", pw_tpl_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{tpl_admin_uid}', 'authz templates fixture')")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/role_templates?select=id",
                            jwt=demo_jwt)
                check("a teacher reads NO template rows directly",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/role_templates?select=id",
                            jwt=tpl_admin_jwt)
                check("admin reads the templates table (empty)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_role_template",
                            jwt=demo_jwt,
                            body={"p_slug": "authz-pilot",
                                  "p_name": "authz spoof",
                                  "p_description": "",
                                  "p_entitlements": {"features": {}}})
                check("a teacher cannot create a template",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_role_template",
                            jwt=tpl_admin_jwt,
                            body={"p_slug": "authz-bad",
                                  "p_name": "bad entitlements",
                                  "p_description": "",
                                  "p_entitlements": {
                                      "features": {"not_a_feature": True}}})
                check("a template with an unknown feature is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/create_role_template",
                            jwt=tpl_admin_jwt,
                            body={"p_slug": "authz-pilot",
                                  "p_name": "authz pilot template",
                                  "p_description": "authz fixture",
                                  "p_entitlements": {
                                      "features": {
                                          "confirmation_required": True},
                                      "limits": {"max_students": 200},
                                      "settings": {
                                          "confirmation_channel": "whatsapp"}}})
                tpl_id = b if isinstance(b, str) and b else None
                check("admin creates a template (feature + limit + setting)",
                      s == 200 and tpl_id, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/apply_role_template",
                            jwt=demo_jwt,
                            body={"p_template_id": tpl_id,
                                  "p_teacher_id": demo_teacher,
                                  "p_reason": "authz template fixture"})
                check("a teacher cannot apply a template",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/apply_role_template",
                            jwt=tpl_admin_jwt,
                            body={"p_template_id": tpl_id,
                                  "p_teacher_id": demo_teacher,
                                  "p_reason": "authz template fixture"})
                check("admin applies the template (3 overrides written)",
                      s == 200 and isinstance(b, list) and len(b) == 3,
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/effective_entitlements",
                            jwt=tpl_admin_jwt,
                            body={"p_teacher_id": demo_teacher})
                check("applied template resolves via effective_entitlements",
                      s == 200 and isinstance(b, dict)
                      and b.get("features", {}).get(
                          "confirmation_required") is True
                      and b.get("settings", {}).get(
                          "confirmation_channel") == "whatsapp"
                      and int(b.get("limits", {}).get("max_students", -1)) == 200
                      and "setting:confirmation_channel" in (
                          b.get("overrides_applied") or []),
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/update_role_template",
                            jwt=tpl_admin_jwt,
                            body={"p_template_id": tpl_id,
                                  "p_name": "authz pilot template",
                                  "p_description": "authz fixture",
                                  "p_entitlements": {
                                      "features": {
                                          "confirmation_required": True},
                                      "limits": {"max_students": 200},
                                      "settings": {
                                          "confirmation_channel": "whatsapp"}},
                                  "p_is_active": False})
                check("admin deactivates the template",
                      s == 200 and b == tpl_id, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/apply_role_template",
                            jwt=tpl_admin_jwt,
                            body={"p_template_id": tpl_id,
                                  "p_teacher_id": demo_teacher,
                                  "p_reason": "authz template fixture"})
                check("a deactivated template cannot be applied",
                      s >= 400, f"got {s} {str(b)[:120]}")
                audit = sql(ref, "select action, count(*) as c "
                                 "from platform_audit_log "
                                 f"where details->>'template_id' = '{tpl_id}' "
                                 "group by action order by action")
                acts = {r["action"]: int(r["c"]) for r in audit}
                check("template create + apply both left audit rows",
                      acts.get("role_template_created", 0) >= 1
                      and acts.get("role_template_applied", 0) >= 1,
                      f"got {acts}")
            finally:
                sql(ref, "delete from account_overrides "
                         f"where teacher_id = '{demo_teacher}' "
                         "and reason = 'authz template fixture'")
                sql(ref, "delete from platform_audit_log "
                         f"where target_teacher_id = '{demo_teacher}' "
                         "and details->>'reason' = 'authz template fixture'")
                if tpl_id:
                    sql(ref, "delete from platform_audit_log "
                             f"where details->>'template_id' = '{tpl_id}'")
                    sql(ref, "delete from role_templates "
                             f"where id = '{tpl_id}'")
                sql(ref, "delete from auth.users "
                         f"where id = '{tpl_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from role_templates "
                                "where slug = 'authz-pilot') as tpl, "
                                "(select count(*) from account_overrides "
                                f"where teacher_id = '{demo_teacher}' "
                                "and reason = 'authz template fixture') as ov, "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{tpl_admin_uid}') as pa")
                check("0063 fixtures cleaned",
                      left and int(left[0]["tpl"]) == 0
                      and int(left[0]["ov"]) == 0
                      and int(left[0]["pa"]) == 0, f"got {left}")

        # ---------- TEAM LIMIT + SUSPEND (0064 — T21 المهمة 21) ----------
        # ⚠️ المهاجرة 0064 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود التريجر أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: إنفاذ حدّ max_team_members خادمياً (تريجر team_limit_trg)
        # + الإيقاف/التفعيل يقطع/يعيد وصول العضو فوراً (سياسات المساعد
        # تشترط status='active').
        # ملحوظة: تشغيلة الـ authz نفسها تضيف عضواً للمدرّس التجريبي
        # (asst_uid — فعّال) قبل هذا القسم، فالمقاعد المشغولة = 1
        # والحدّ التجريبي = 1: التسلسل يرفع الحدّ بتجاوز 2 أولاً
        # (إثبات الضابط)، ثم يخفضه إلى 0 (إثبات الرفض)، ثم يسحب
        # التجاوز فيعود الحدّ 1 مع مقعدين مشغولين فيبقى الرفض صحيحاً.
        print("TEAM LIMIT + SUSPEND (0064):")
        team_probe = sql(ref, "select to_regprocedure(\n"
                               "'public.enforce_team_limit()') as f")
        if not team_probe or not team_probe[0].get("f"):
            print("  SKIP 0064 live section — migration 0064 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate)")
        else:
            pw_team_admin = secrets.token_urlsafe(18)
            pw_team_member = secrets.token_urlsafe(18)
            pw_team_member2 = secrets.token_urlsafe(18)
            team_admin_uid = create_user_sql(
                ref, "authz-team-admin@teacher-app.test", pw_team_admin)
            team_member_uid = create_user_sql(
                ref, "authz-team-member@teacher-app.test", pw_team_member)
            team_member2_uid = create_user_sql(
                ref, "authz-team-member2@teacher-app.test", pw_team_member2)
            team_override_id = None
            team_member_row = None
            try:
                team_admin_jwt, _ = sign_in(
                    url, anon, "authz-team-admin@teacher-app.test",
                    pw_team_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{team_admin_uid}', 'authz team fixture')")
                # رفع الحدّ إلى 2 بتجاوز أدمن — الضابط: إدراج عضو جديد ينجح.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=team_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "limit",
                                  "p_key": "max_team_members",
                                  "p_value": 2,
                                  "p_reason": "authz team limit probe"})
                team_override_id = b if isinstance(b, str) else None
                check("admin sets a max_team_members=2 override",
                      s == 200 and team_override_id,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/teacher_members",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "user_id": team_member_uid,
                                  "role": "assistant",
                                  # can_manage_students لازم لقراءة
                                  # الطلاب: سياسة students_assistant_all
                                  # (0001) تشترطها، وبصلاحية الحضور فقط
                                  # يقرأ العضو صفر طلاب بالتصميم.
                                  "permissions": {
                                      "can_take_attendance": True,
                                      "can_manage_students": True},
                                  "status": "active"})
                # إدراج الجدول مع return=representation يرجّع قائمة
                # بصف واحد لا كائناً (نمط PR #60) — الالتقاط من
                # الشكلين؛ البقاء على الكائن وحده أبقى الصف None
                # وانهار القسم عند أول استخدام له (تشغيلة 28b).
                team_member_row = b[0] if isinstance(b, list) and b else (
                    b if isinstance(b, dict) else None)
                check("the team-limit trigger allows the insert under the raised limit",
                      s in (200, 201) and team_member_row
                      and team_member_row.get("user_id") == team_member_uid,
                      f"got {s} {str(b)[:160]}")
                team_member_jwt, _ = sign_in(
                    url, anon, "authz-team-member@teacher-app.test",
                    pw_team_member)
                s, b = rest(url, anon, "GET",
                            "/rest/v1/students?select=id&limit=1",
                            jwt=team_member_jwt)
                check("an active member reads the host teacher's students",
                      s == 200 and isinstance(b, list) and len(b) == 1,
                      f"got {s} {str(b)[:120]}")
                # إيقاف العضو — الوصول يُقطع فوراً (سياسات المساعد تشترط active).
                s, b = rest(url, anon, "PATCH",
                            f"/rest/v1/teacher_members?id=eq.{team_member_row['id']}",
                            jwt=demo_jwt,
                            body={"status": "suspended"})
                check("the owner suspends the member",
                      s in (200, 204), f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/students?select=id&limit=1",
                            jwt=team_member_jwt)
                check("a suspended member reads no students",
                      s == 200 and b == [], f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "PATCH",
                            f"/rest/v1/teacher_members?id=eq.{team_member_row['id']}",
                            jwt=demo_jwt,
                            body={"status": "active"})
                check("the owner reactivates the member",
                      s in (200, 204), f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/students?select=id&limit=1",
                            jwt=team_member_jwt)
                check("a reactivated member reads students again",
                      s == 200 and isinstance(b, list) and len(b) == 1,
                      f"got {s} {str(b)[:120]}")
                # خفض الحدّ إلى 0 — التريجر يرفض أي إدراج جديد.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_account_override",
                            jwt=team_admin_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_kind": "limit",
                                  "p_key": "max_team_members",
                                  "p_value": 0,
                                  "p_reason": "authz team limit probe 0"})
                team_override_id = b if isinstance(b, str) else None
                check("admin sets a max_team_members=0 override",
                      s == 200 and team_override_id,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/teacher_members",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "user_id": team_member2_uid,
                                  "role": "assistant",
                                  "permissions": {"can_take_attendance": True},
                                  "status": "active"})
                check("the team-limit trigger rejects the insert at limit 0",
                      s >= 400, f"got {s} {str(b)[:160]}")
                # سحب التجاوز: الحدّ يعود 1 (تجريبي) مع مقعدين مشغولين
                # (عضو التشغيلة + عضو الاستكشاف) فيبقى الرفض صحيحاً.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/revoke_account_override",
                            jwt=team_admin_jwt,
                            body={"p_override_id": team_override_id})
                check("admin revokes the override",
                      s == 200, f"got {s} {str(b)[:120]}")
                team_override_id = None
                s, b = rest(url, anon, "POST",
                            "/rest/v1/teacher_members",
                            jwt=demo_jwt,
                            body={"teacher_id": demo_teacher,
                                  "user_id": team_member2_uid,
                                  "role": "assistant",
                                  "permissions": {"can_take_attendance": True},
                                  "status": "active"})
                check("the insert is still rejected at the trial limit",
                      s >= 400, f"got {s} {str(b)[:160]}")
                # قيد CHECK على activity_log يقبل حدث الإيقاف الجديد
                # (0064 §2): بلا التمديد يفشل هذا الإدراج ويرفع sql()
                # خطأً صريحاً — إثبات حيّ أن سجل النشاط يقبل الحدثين.
                sql(ref, "insert into activity_log "
                         f"(teacher_id, actor_id, actor_role, event_type, "
                         f"entity_type, entity_id, details) values "
                         f"('{demo_teacher}', '{demo_uid}', 'owner', "
                         f"'member_suspended', 'member', "
                         f"'{team_member_row['id']}', '{{}}'::jsonb)")
                probe = sql(ref, "select count(*) as n from activity_log "
                                 f"where teacher_id = '{demo_teacher}' "
                                 f"and event_type = 'member_suspended' "
                                 f"and entity_id = '{team_member_row['id']}'")
                check("the activity_log CHECK accepts member_suspended",
                      probe and probe[0].get("n", 0) >= 1, f"got {probe}")
                sql(ref, "delete from activity_log "
                         f"where teacher_id = '{demo_teacher}' "
                         f"and event_type = 'member_suspended' "
                         f"and entity_id = '{team_member_row['id']}'")
            finally:
                if team_override_id:
                    sql(ref, "delete from account_overrides "
                             f"where id = '{team_override_id}'")
                sql(ref, "delete from teacher_members "
                         f"where teacher_id = '{demo_teacher}' "
                         f"and user_id in ('{team_member_uid}', "
                         f"'{team_member2_uid}')")
                sql(ref, "delete from platform_audit_log "
                         f"where target_teacher_id = '{demo_teacher}' "
                         "and action in ('override_set', 'override_revoked')")
                sql(ref, "delete from auth.users "
                         f"where id in ('{team_admin_uid}', "
                         f"'{team_member_uid}', '{team_member2_uid}')")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{team_admin_uid}') as pa, "
                                "(select count(*) from account_overrides "
                                f"where teacher_id = '{demo_teacher}' "
                                "and key = 'max_team_members' "
                                "and (expires_at is null "
                                "or expires_at > now())) as ov, "
                                "(select count(*) from teacher_members "
                                f"where teacher_id = '{demo_teacher}' "
                                f"and user_id in ('{team_member_uid}', "
                                f"'{team_member2_uid}')) as tm")
                check("0064 fixtures cleaned + demo state restored",
                      left and int(left[0]["pa"]) == 0
                      and int(left[0]["ov"]) == 0
                      and int(left[0]["tm"]) == 0, f"got {left}")
        # ---------- ANNOUNCEMENTS + TICKETS (0065 — T17/T23 الخطوة 8) ----------
        # ⚠️ المهاجرة 0065 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: الإعلان يُنشر من الأدمن ويُقرأ من أي مدرس عبر RPC
        # وحده (بلا قراءة جدول مباشرة)؛ التذكرة ملك حسابها — مدرس آخر
        # لا يراها ولا يرد عليها؛ الرد يقلب الحالة (أدمن →
        # waiting_teacher، مدرس → in_progress)؛ والمغلقة ترفض أي رد.
        # كل ما يُنشأ هنا يُلغى وينظَّف في finally؛ باقة الديمو نفسها
        # لا تتغير إطلاقاً.
        print("ANNOUNCEMENTS + TICKETS (0065):")
        at_probe = sql(ref, "select to_regclass('public.support_tickets') as t")
        if not at_probe or not at_probe[0].get("t"):
            print("  SKIP 0065 live section — migration 0065 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-ANNOUNCEMENTS-TICKETS.md)")
        else:
            pw_at_admin = secrets.token_urlsafe(18)
            at_admin_uid = create_user_sql(
                ref, "authz-at-admin@teacher-app.test", pw_at_admin)
            at_ann_id = None
            at_ticket_id = None
            try:
                at_admin_jwt, _ = sign_in(
                    url, anon, "authz-at-admin@teacher-app.test", pw_at_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{at_admin_uid}', 'authz announcements fixture')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_announcement_publish",
                            jwt=demo_jwt,
                            body={"p_title": "authz spoof",
                                  "p_body": "spoof",
                                  "p_kind": "general"})
                check("a teacher cannot publish an announcement",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_announcement_publish",
                            jwt=at_admin_jwt,
                            body={"p_title": "authz announcement",
                                  "p_body": "authz fixture body",
                                  "p_kind": "update"})
                at_ann_id = b if isinstance(b, str) and b else None
                check("admin publishes an announcement",
                      s == 200 and at_ann_id, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_announcements_for_me",
                            jwt=demo_jwt,
                            body={})
                check("a teacher reads the published announcement via RPC",
                      s == 200 and isinstance(b, list)
                      and any(isinstance(x, dict)
                              and x.get("id") == at_ann_id for x in b),
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "GET",
                            "/rest/v1/platform_announcements?select=id",
                            jwt=demo_jwt)
                check("a teacher reads NO announcement rows directly",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/submit_support_ticket",
                            jwt=demo_jwt,
                            body={"p_teacher_id": demo_teacher,
                                  "p_subject": "authz ticket",
                                  "p_body": "authz fixture body"})
                at_ticket_id = (b.get("id") if isinstance(b, dict) else None)
                check("a teacher opens a support ticket",
                      s == 200 and at_ticket_id, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/support_ticket_thread",
                            jwt=other_jwt,
                            body={"p_ticket_id": at_ticket_id})
                check("another teacher cannot read the ticket thread",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/reply_support_ticket",
                            jwt=at_admin_jwt,
                            body={"p_ticket_id": at_ticket_id,
                                  "p_body": "admin reply"})
                check("admin reply flips status to waiting_teacher",
                      s == 200 and isinstance(b, dict)
                      and b.get("status") == "waiting_teacher"
                      and b.get("author_kind") == "admin",
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/reply_support_ticket",
                            jwt=demo_jwt,
                            body={"p_ticket_id": at_ticket_id,
                                  "p_body": "teacher reply"})
                check("teacher reply flips status to in_progress",
                      s == 200 and isinstance(b, dict)
                      and b.get("status") == "in_progress"
                      and b.get("author_kind") == "teacher",
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/set_ticket_status",
                            jwt=at_admin_jwt,
                            body={"p_ticket_id": at_ticket_id,
                                  "p_status": "closed"})
                check("admin closes the ticket",
                      s == 200 and isinstance(b, dict)
                      and b.get("status") == "closed",
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/reply_support_ticket",
                            jwt=demo_jwt,
                            body={"p_ticket_id": at_ticket_id,
                                  "p_body": "too late"})
                check("a reply to a closed ticket is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_announcement_delete",
                            jwt=at_admin_jwt,
                            body={"p_id": at_ann_id})
                check("admin deletes the announcement",
                      s == 200 and b is True, f"got {s} {str(b)[:120]}")
                audit = sql(ref, "select action, count(*) as c "
                                 "from platform_audit_log "
                                 "where action in ('announcement_published', "
                                 "'announcement_deleted', 'ticket_status_changed') "
                                 "and (details->>'announcement_id' = "
                                 f"'{at_ann_id}' or details->>'ticket_id' = "
                                 f"'{at_ticket_id}') "
                                 "group by action order by action")
                acts = {r["action"]: int(r["c"]) for r in audit}
                check("announcement publish/delete + ticket close left audit rows",
                      acts.get("announcement_published", 0) >= 1
                      and acts.get("announcement_deleted", 0) >= 1
                      and acts.get("ticket_status_changed", 0) >= 1,
                      f"got {acts}")
            finally:
                if at_ann_id:
                    sql(ref, "delete from platform_announcements "
                             f"where id = '{at_ann_id}'")
                if at_ticket_id:
                    sql(ref, "delete from support_tickets "
                             f"where id = '{at_ticket_id}'")
                sql(ref, "delete from platform_audit_log "
                         "where action in ('announcement_published', "
                         "'announcement_deleted', 'ticket_status_changed') "
                         "and (details->>'announcement_id' = "
                         f"'{at_ann_id}' or details->>'ticket_id' = "
                         f"'{at_ticket_id}')")
                sql(ref, "delete from auth.users "
                         f"where id = '{at_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_announcements "
                                f"where id = '{at_ann_id}') as ann, "
                                "(select count(*) from support_tickets "
                                f"where id = '{at_ticket_id}') as tk, "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{at_admin_uid}') as pa")
                check("0065 fixtures cleaned",
                      left and int(left[0]["ann"]) == 0
                      and int(left[0]["tk"]) == 0
                      and int(left[0]["pa"]) == 0, f"got {left}")

        # ---------- AUDIT INTEGRATION (0066 — T23 الخطوة 6) ----------
        # ⚠️ المهاجرة 0066 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الدوال أولاً: إن
        # غابت يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: سجل التدقيق كامل — إضافة/حذف السماح وقلب قفل التسجيل
        # عبر RPCs موثّقة تكتب سطراً لكل فعل، وقراءة السجل للأدمن فقط
        # بمرشّحاتها، والتزوير باسم أدمن آخر مرفوض (الإدراج المباشر
        # باسمه غير اسمه). حالة التسجيل (مفتوح/مقفول) تُقرأ قبل أي لمس
        # وتُستعاد حرفياً في finally؛ صفوف السماح الاستكشافية تُحذف.
        print("AUDIT INTEGRATION (0066):")
        audit_probe = sql(ref, "select to_regprocedure("
                               "'public.platform_audit_log_list(int, int, uuid, text)') as f")
        if not audit_probe or not audit_probe[0].get("f"):
            print("  SKIP 0066 live section — migration 0066 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-AUDIT.md)")
        else:
            pw_audit_admin = secrets.token_urlsafe(18)
            audit_admin_uid = create_user_sql(
                ref, "authz-audit-admin@teacher-app.test", pw_audit_admin)
            orig_open = sql(ref, "select (value)::text = 'true' as open "
                                 "from platform_settings "
                                 "where key = 'registration_open'")
            orig_open_val = bool(orig_open[0]["open"]) if orig_open else True
            try:
                audit_admin_jwt, _ = sign_in(
                    url, anon, "authz-audit-admin@teacher-app.test", pw_audit_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{audit_admin_uid}', 'authz audit fixture')")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_audit_log_list",
                            jwt=demo_jwt,
                            body={})
                check("a teacher cannot list the platform audit log",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_audit_log_list",
                            jwt=audit_admin_jwt,
                            body={})
                check("admin lists the audit log (object with rows+total)",
                      s == 200 and isinstance(b, dict)
                      and isinstance(b.get("rows"), list)
                      and isinstance(b.get("total"), int),
                      f"got {s} {str(b)[:160]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_allowlist_add",
                            jwt=demo_jwt,
                            body={"p_email": "authz-audit@teacher-app.test"})
                check("a teacher cannot add an allowlist entry",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_allowlist_add",
                            jwt=audit_admin_jwt,
                            body={"p_email": "authz-audit@teacher-app.test",
                                  "p_note": "authz fixture"})
                allow_id = b if isinstance(b, str) and b else None
                check("admin adds an allowlist entry via the audited RPC",
                      s == 200 and allow_id, f"got {s} {str(b)[:120]}")
                audit = sql(ref, "select count(*) as c "
                                 "from platform_audit_log "
                                 "where action = 'allowlist_added' "
                                 "and details ->> 'email' = "
                                 "'authz-audit@teacher-app.test'")
                check("the allowlist add wrote one audit row",
                      audit and int(audit[0]["c"]) == 1, f"got {audit}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_set_registration_open",
                            jwt=demo_jwt,
                            body={"p_open": not orig_open_val})
                check("a teacher cannot flip the registration lock",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_set_registration_open",
                            jwt=audit_admin_jwt,
                            body={"p_open": not orig_open_val,
                                  "p_reason": "authz fixture"})
                check("admin flips the registration lock",
                      s == 200 and b == (not orig_open_val),
                      f"got {s} {str(b)[:120]}")
                flipped = sql(ref, "select (value)::text = 'true' as open "
                                   "from platform_settings "
                                   "where key = 'registration_open'")
                check("the flip landed in platform_settings",
                      flipped and bool(flipped[0]["open"]) == (not orig_open_val),
                      f"got {flipped}")
                audit = sql(ref, "select count(*) as c "
                                 "from platform_audit_log "
                                 "where action = 'registration_open_changed'")
                check("the flip wrote a platform audit row",
                      audit and int(audit[0]["c"]) >= 1, f"got {audit}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/platform_audit_log_list",
                            jwt=audit_admin_jwt,
                            body={"p_action": "allowlist_added"})
                check("audit list filters by action",
                      s == 200 and isinstance(b, dict)
                      and all(r.get("action") == "allowlist_added"
                              for r in (b.get("rows") or [])),
                      f"got {s} {str(b)[:160]}")
                # تزوير: إدراج مباشر في السجل باسم أدمن آخر (admin_user_id
                # ≠ auth.uid()) — سياسة الإدراج ترفضه، فلا سطر بلا فاعل.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/platform_audit_log",
                            jwt=audit_admin_jwt,
                            body={"admin_user_id": demo_teacher,
                                  "action": "spoofed",
                                  "details": {}})
                check("a spoofed audit insert under another admin is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                if allow_id:
                    s, b = rest(url, anon, "POST",
                                "/rest/v1/rpc/platform_allowlist_remove",
                                jwt=audit_admin_jwt,
                                body={"p_allowlist_id": allow_id})
                    check("admin removes the allowlist entry via the audited RPC",
                          s == 200 and b == allow_id,
                          f"got {s} {str(b)[:120]}")
                    audit = sql(ref, "select count(*) as c "
                                     "from platform_audit_log "
                                     "where action = 'allowlist_removed' "
                                     "and details ->> 'allowlist_id' = "
                                     f"'{allow_id}'")
                    check("the allowlist remove wrote one audit row",
                          audit and int(audit[0]["c"]) == 1, f"got {audit}")
            finally:
                sql(ref, "update platform_settings set value = "
                         f"'{str(orig_open_val).lower()}'::jsonb, "
                         "updated_at = now() where key = 'registration_open'")
                sql(ref, "delete from teacher_allowlist "
                         "where email = 'authz-audit@teacher-app.test'")
                sql(ref, "delete from platform_audit_log "
                         "where action in ('allowlist_added', "
                         "'allowlist_removed', 'registration_open_changed') "
                         "and details ->> 'email' = "
                         "'authz-audit@teacher-app.test'")
                sql(ref, "delete from platform_audit_log "
                         "where action = 'registration_open_changed' "
                         "and details ->> 'reason' = 'authz fixture'")
                sql(ref, "delete from auth.users "
                         f"where id = '{audit_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{audit_admin_uid}') as pa, "
                                "(select count(*) from teacher_allowlist "
                                "where email = 'authz-audit@teacher-app.test') as al, "
                                "(select (value)::text = 'true' from platform_settings "
                                "where key = 'registration_open') as open")
                check("0066 fixtures cleaned + registration lock restored",
                      left and int(left[0]["pa"]) == 0
                      and int(left[0]["al"]) == 0
                      and bool(left[0]["open"]) == orig_open_val,
                      f"got {left}")

        # ---------- PLATFORM ADMIN MFA GUARD (0067 — T23 التحقق بخطوتين) ----------
        # ⚠️ المهاجرة 0067 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الحارس وجدول
        # platform_admins أولاً: إن غابا يطبع تخطياً موثقاً (لا فشل —
        # الغياب هو الحالة المتوقعة حتى البوابة)، وبعد التطبيق يشتغل
        # كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: حارس aal2 خادمياً — my_platform_admin_aal2() ترجع true
        # فقط لجلسة أدمن بـ aal2، وfalse لغيرها. الاختبار الإيجابي
        # الكامل يسجّل TOTP حقيقياً عبر GoTrue (enroll → TOTP بايثون
        # خالص RFC 6238 → challenge+verify) ثم ينادي الـ RPC بالـ JWT
        # الجديد. إن كان MFA نفسه غير مفعّل في إعدادات المشروع (خطوة
        # لوحة تحكم يدوية، لا مهاجرة) فالتدفق الإيجابي يُتخطى بتوثيق
        # بينما تبقى الفحوصات السلبية (aal1 → false) دليلاً على الحارس.
        print("PLATFORM ADMIN MFA GUARD (0067):")
        mfa_probe = sql(ref, "select to_regprocedure(\n"
                              "'public.platform_admin_aal2()') as f")
        mfa_admin_table = sql(ref, "select to_regclass(\n"
                                    "'public.platform_admins') as t")
        if (not mfa_probe or not mfa_probe[0].get("f")
                or not mfa_admin_table or not mfa_admin_table[0].get("t")):
            print("  SKIP 0067 live section — migration 0067 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate)")
        else:
            pw_mfa_admin = secrets.token_urlsafe(18)
            mfa_admin_uid = create_user_sql(
                ref, "authz-mfa-admin@teacher-app.test", pw_mfa_admin)
            try:
                mfa_admin_jwt, _ = sign_in(
                    url, anon, "authz-mfa-admin@teacher-app.test",
                    pw_mfa_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{mfa_admin_uid}', 'authz mfa fixture')")
                # سلبية (1): أدمن بجلسة aal1 (كلمة سر فقط) → false.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/my_platform_admin_aal2",
                            jwt=mfa_admin_jwt, body={})
                check("an aal1 admin gets false from my_platform_admin_aal2",
                      s == 200 and b is False, f"got {s} {str(b)[:120]}")
                # سلبية (2): مدرس بـ aal1 → false.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/my_platform_admin_aal2",
                            jwt=demo_jwt, body={})
                check("a teacher (aal1) gets false from my_platform_admin_aal2",
                      s == 200 and b is False, f"got {s} {str(b)[:120]}")
                # سلبية (3): بلا JWT (دور anon بلا تنفيذ على الدالة) →
                # رفض (401/403/404 حسب إخفاء PostgREST للدالة).
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/my_platform_admin_aal2",
                            jwt=None, body={})
                check("anonymous cannot call my_platform_admin_aal2",
                      s in (401, 403, 404), f"got {s} {str(b)[:120]}")
                # إيجابية: تسجيل TOTP حقيقي عبر GoTrue.
                s, b = rest(url, anon, "POST", "/auth/v1/factors",
                            jwt=mfa_admin_jwt,
                            body={"friendly_name": "authz mfa probe",
                                  "factor_type": "totp",
                                  "issuer": "Mister"})
                if s != 200 and "mfa" in str(b).lower():
                    print("  SKIP 0067 positive flow — MFA is not enabled on "
                          "the Supabase project yet (enable it in the "
                          "dashboard: Authentication → MFA) — the negatives "
                          "above still prove the aal2 guard")
                else:
                    check("TOTP factor enrolls for the fixture admin",
                          s == 200 and isinstance(b, dict) and b.get("id")
                          and isinstance(b.get("totp"), dict)
                          and b["totp"].get("secret"),
                          f"got {s} {str(b)[:160]}")
                    if s == 200:
                        factor_id = b["id"]
                        secret = b["totp"]["secret"]
                        aal2_jwt = None
                        for _ in range(3):
                            code = totp_code(secret)
                            s, b = rest(
                                url, anon, "POST",
                                f"/auth/v1/factors/{factor_id}/challenge",
                                jwt=mfa_admin_jwt, body={})
                            if s != 200 or not isinstance(b, dict) \
                                    or not b.get("id"):
                                break
                            s, b = rest(
                                url, anon, "POST",
                                f"/auth/v1/factors/{factor_id}/verify",
                                jwt=mfa_admin_jwt,
                                body={"challenge_id": b["id"],
                                      "code": code})
                            if s == 200 and isinstance(b, dict) \
                                    and b.get("access_token"):
                                aal2_jwt = b["access_token"]
                                break
                            time.sleep(1)
                        check("TOTP challenge+verify promotes the session to aal2",
                              bool(aal2_jwt),
                              "no aal2 token after 3 attempts")
                        if aal2_jwt:
                            s, b = rest(url, anon, "POST",
                                        "/rest/v1/rpc/my_platform_admin_aal2",
                                        jwt=aal2_jwt, body={})
                            check("an aal2 admin gets true from my_platform_admin_aal2",
                                  s == 200 and b is True,
                                  f"got {s} {str(b)[:120]}")
            finally:
                sql(ref, "delete from platform_admins "
                         f"where user_id = '{mfa_admin_uid}'")
                sql(ref, "delete from auth.users "
                         f"where id = '{mfa_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{mfa_admin_uid}') as pa, "
                                "(select count(*) from auth.users "
                                f"where id = '{mfa_admin_uid}') as u")
                check("0067 fixtures cleaned + demo state restored",
                      left and int(left[0]["pa"]) == 0
                      and int(left[0]["u"]) == 0, f"got {left}")

        # ---------- NEW-DEVICE ALERTS (0068 — T23 تنبيهات الأجهزة الجديدة) ----------
        # ⚠️ المهاجرة 0068 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود الجدول أولاً: إن
        # غاب يطبع تخطياً موثقاً (لا فشل — الغياب هو الحالة المتوقعة حتى
        # البوابة)، وبعد التطبيق يشتغل كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: تسجيل جهاز الأدمن ببصمة SHA-256 (upsert + is_new) +
        # قائمة أجهزته + توثيق/إلغاء — كلها بحارس is_platform_admin().
        print("NEW-DEVICE ALERTS (0068):")
        dev_probe = sql(ref, "select to_regclass('public.platform_admin_devices') as t")
        if not dev_probe or not dev_probe[0].get("t"):
            print("  SKIP 0068 live section — migration 0068 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate — docs/PLATFORM-ADMIN-DEVICE-ALERTS.md)")
        else:
            pw_dev_admin = secrets.token_urlsafe(18)
            dev_admin_uid = create_user_sql(
                ref, "authz-dev-admin@teacher-app.test", pw_dev_admin)
            dev_id = None
            try:
                dev_admin_jwt, _ = sign_in(
                    url, anon, "authz-dev-admin@teacher-app.test",
                    pw_dev_admin)
                sql(ref, "insert into platform_admins (user_id, note) values "
                         f"('{dev_admin_uid}', 'authz devices fixture')")
                dev_hash = "b" * 64
                # سلبيات: المدرّس والمجهول لا يسجلان جهازاً ولا يقرآن قائمة
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/register_platform_device",
                            jwt=demo_jwt,
                            body={"p_device_hash": dev_hash, "p_label": "chrome / windows"})
                check("a teacher cannot register a device",
                      s >= 400, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/register_platform_device",
                            body={"p_device_hash": dev_hash, "p_label": "chrome / windows"})
                check("anon cannot register a device",
                      s in (401, 403, 404), f"got {s}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/list_platform_devices",
                            jwt=demo_jwt)
                check("a teacher lists no devices (empty, not an error)",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                # هاش مشوه يُرفض من الضابط نفسه
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/register_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_hash": "not-a-hash", "p_label": "x"})
                check("a malformed device hash is rejected",
                      s >= 400, f"got {s} {str(b)[:120]}")
                # إيجابية: أول تسجيل is_new=true، والثاني is_new=false
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/register_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_hash": dev_hash, "p_label": "chrome / windows"})
                dev_row = b[0] if isinstance(b, list) and b else None
                dev_id = dev_row.get("device_id") if dev_row else None
                check("admin registers a device (is_new=true)",
                      s == 200 and dev_row and dev_row.get("is_new") is True and dev_id,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/register_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_hash": dev_hash, "p_label": "chrome / windows"})
                check("re-registering the same device is not new",
                      s == 200 and isinstance(b, list) and b
                      and b[0].get("is_new") is False,
                      f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/list_platform_devices",
                            jwt=dev_admin_jwt)
                check("admin lists exactly one device",
                      s == 200 and isinstance(b, list) and len(b) == 1
                      and b[0].get("device_hash") == dev_hash,
                      f"got {s} {str(b)[:120]}")
                # توثيق ثم إلغاء
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/trust_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_id": dev_id})
                check("admin trusts the device",
                      s == 200 and b is True, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/list_platform_devices",
                            jwt=dev_admin_jwt)
                check("the device shows trusted after trust",
                      s == 200 and isinstance(b, list) and b
                      and b[0].get("trusted") is True,
                      f"got {s} {str(b)[:120]}")
                # جهاز غير موجود: التوثيق يرجع null لا true
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/trust_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_id": str(uuid.uuid4())})
                check("trusting an unknown device returns null, not true",
                      s == 200 and b is None, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/revoke_platform_device",
                            jwt=dev_admin_jwt,
                            body={"p_device_id": dev_id})
                check("admin revokes the device",
                      s == 200 and b is True, f"got {s} {str(b)[:120]}")
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/list_platform_devices",
                            jwt=dev_admin_jwt)
                check("the device list is empty after revoke",
                      s == 200 and b == [], f"got {s} {str(b)[:80]}")
                dev_id = None
                # التدقيق (0066): إن كانت log_platform_audit مطبّقة، فحدث
                # device_new يصل سجل التدقيق عبر نفس النداء الذي تستخدمه
                # الواجهة — وإلا يُتخطى بتوثيق (الترتيب عند البوابة 0066 ثم 0068).
                audit_probe = sql(ref, "select to_regprocedure("
                                       "'public.log_platform_audit(text, uuid, jsonb)') as f")
                if not audit_probe or not audit_probe[0].get("f"):
                    print("  SKIP 0068 audit check — log_platform_audit (0066) "
                          "not applied yet (expected until the freeze gate)")
                else:
                    s, b = rest(url, anon, "POST",
                                "/rest/v1/rpc/log_platform_audit",
                                jwt=dev_admin_jwt,
                                body={"p_action": "device_new",
                                      "p_target_teacher_id": None,
                                      "p_details": {"device_label": "chrome / windows",
                                                    "device_hash_prefix": "bbbbbbbb"}})
                    check("device_new audit event lands via log_platform_audit",
                          s == 200 and isinstance(b, str) and b,
                          f"got {s} {str(b)[:120]}")
                    audit = sql(ref, "select count(*) as c from platform_audit_log "
                                     "where action = 'device_new' "
                                     "and details->>'device_label' = 'chrome / windows'")
                    check("the device_new row is in platform_audit_log",
                          audit and int(audit[0]["c"]) >= 1, f"got {audit}")
            finally:
                sql(ref, "delete from platform_admin_devices "
                         f"where user_id = '{dev_admin_uid}'")
                sql(ref, "delete from platform_audit_log "
                         "where action = 'device_new' "
                         "and details->>'device_label' = 'chrome / windows'")
                sql(ref, "delete from auth.users "
                         f"where id = '{dev_admin_uid}'")
                left = sql(ref, "select "
                                "(select count(*) from platform_admin_devices "
                                f"where user_id = '{dev_admin_uid}') as dv, "
                                "(select count(*) from platform_admins "
                                f"where user_id = '{dev_admin_uid}') as pa, "
                                "(select count(*) from platform_audit_log "
                                "where action = 'device_new' "
                                "and details->>'device_label' = 'chrome / windows') as au")
                check("0068 fixtures cleaned",
                      left and int(left[0]["dv"]) == 0
                      and int(left[0]["pa"]) == 0
                      and int(left[0]["au"]) == 0, f"got {left}")

        # ---------- SOFT ACCOUNT DELETE (0075 — F1 من اختبار سند) ----------
        # ⚠️ المهاجرة 0075 مكتوبة ومراجعة في الـPR لكنها **غير مطبّقة على
        # الإنتاج** بقاعدة تجميد الفيز (أمر مالك 2026-11-25): التطبيق عند
        # بوابة تجميد فيز 2 + QA فقط. القسم يفحص وجود عمود
        # teachers.deleted_at أولاً: إن غاب يطبع تخطياً موثقاً (لا فشل —
        # الغياب هو الحالة المتوقعة حتى البوابة)، وبعد التطبيق يشتغل
        # كاملاً تلقائياً في نفس التشغيلة.
        # الغرض: حذف الحساب صار ناعماً وبحجة تأكيد خادمية — بلا تأكيد
        # مطابق لبريد الحساب يُرفض النداء قبل أي تغيير، وبالتأكيد
        # الصحيح يُعلَّم الحساب محذوفاً (البيانات تبقى)، تُقطع جلساته،
        # ويُحظر دخوله من جديد، ونداء ثانٍ يُرفض بـ already deleted.
        print("SOFT ACCOUNT DELETE (0075):")
        del_probe = sql(ref, "select 1 as x from information_schema.columns "
                             "where table_schema = 'public' "
                             "and table_name = 'teachers' "
                             "and column_name = 'deleted_at'")
        if not del_probe:
            print("  SKIP 0075 live section — migration 0075 is written but NOT "
                  "applied (phase-freeze rule 2026-11-25: application deferred "
                  "to the Phase-2 freeze + QA gate)")
        else:
            pw_del = secrets.token_urlsafe(18)
            del_uid = create_user_sql(
                ref, "authz-softdel@teacher-app.test", pw_del)
            try:
                sql(ref, "insert into teachers (id, owner_user_id, "
                         "display_name) values "
                         f"('{del_uid}', '{del_uid}', 'authz softdel fixture')")
                del_jwt, _ = sign_in(
                    url, anon, "authz-softdel@teacher-app.test", pw_del)
                # (1) بلا حجة تأكيد أصلاً → رفض (لا مسار حذف بلا تأكيد).
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/delete_my_teacher_account",
                            jwt=del_jwt, body={})
                check("0075 delete without confirmation is rejected",
                      s in (400, 404) and ("confirmation" in str(b)
                                           or "p_confirmation" in str(b)),
                      f"got {s} {str(b)[:140]}")
                # (2) تأكيد خاطئ → 'confirmation mismatch' ولا شيء يتغير.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/delete_my_teacher_account",
                            jwt=del_jwt,
                            body={"p_confirmation": "wrong@example.com"})
                check("0075 wrong confirmation is rejected",
                      s == 400 and "confirmation mismatch" in str(b),
                      f"got {s} {str(b)[:140]}")
                row = sql(ref, "select deleted_at from teachers "
                               f"where id = '{del_uid}'")
                check("0075 rejected calls leave the account untouched",
                      row and row[0]["deleted_at"] is None,
                      f"got {row}")
                # (3) التأكيد الصحيح (بريد الحساب نفسه) → حذف ناعم.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/delete_my_teacher_account",
                            jwt=del_jwt,
                            body={"p_confirmation":
                                  "authz-softdel@teacher-app.test"})
                check("0075 confirmed delete soft-deletes",
                      s == 200 and isinstance(b, dict)
                      and b.get("soft_deleted") is True,
                      f"got {s} {str(b)[:140]}")
                row = sql(ref, "select deleted_at from teachers "
                               f"where id = '{del_uid}'")
                check("0075 teacher row is retained with deleted_at set",
                      row and row[0]["deleted_at"] is not None,
                      f"got {row}")
                # (4) الدخول من جديد مرفوض (banned_until من المهاجرة).
                s, b = rest(url, anon, "POST",
                            "/auth/v1/token?grant_type=password",
                            body={"email": "authz-softdel@teacher-app.test",
                                  "password": pw_del})
                check("0075 soft-deleted account cannot sign in again",
                      s != 200 and "access_token" not in str(b),
                      f"got {s} {str(b)[:140]}")
                # (5) نداء ثانٍ بنفس التوكن → 'account already deleted'.
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/delete_my_teacher_account",
                            jwt=del_jwt,
                            body={"p_confirmation":
                                  "authz-softdel@teacher-app.test"})
                check("0075 second delete is rejected as already deleted",
                      s == 400 and "account already deleted" in str(b),
                      f"got {s} {str(b)[:140]}")
            finally:
                sql(ref, "delete from teachers "
                         f"where owner_user_id = '{del_uid}'")
                sql(ref, f"delete from auth.users where id = '{del_uid}'")
                left = sql(ref, "select count(*) as c from teachers "
                                f"where owner_user_id = '{del_uid}'")
                check("0075 fixtures cleaned",
                      left and int(left[0]["c"]) == 0, f"got {left}")

        # ---------- SEC-L3 (3A-383 — فرض نوع/حجم إثبات الدفع خادمياً) ----------
        # الـ bucket نفسه (0005) يفرض 5MB + jpeg/png/webp على الخادم فوق
        # سياسة الرفع؛ هذه الفحوص تثبت الفرض حياً: نوع خاطئ وحجم زائد
        # يُرفضان، ورفع صالح صغير ينجح (ضابط)، ثم تنظيف كامل.
        print("SEC-L3 STORAGE:")
        proof_id = str(uuid.uuid4())
        proof_path = f"{demo_teacher}/{proof_id}.png"
        try:
            link_row = sql(
                ref,
                "select gs.guardian_id, gs.student_id from "
                "guardian_students gs join students st "
                "on st.id = gs.student_id "
                f"where st.teacher_id = '{demo_teacher}' limit 1",
            )[0]
            proof_student = link_row["student_id"]
            sql(
                ref,
                "insert into payment_proofs (id, teacher_id, guardian_id, "
                "student_id, amount, method, storage_path, status) values "
                f"('{proof_id}', '{demo_teacher}', "
                f"'{link_row['guardian_id']}', '{proof_student}', 100, "
                f"'instapay', '{proof_path}', 'pending')",
            )
            s, b = storage_upload(url, anon, proof_path, "text/plain",
                                  b"not an image at all")
            check("SEC-L3 wrong mime type rejected server-side",
                  s == 400, f"got {s} {b[:120]}")
            s, b = storage_upload(url, anon, proof_path, "image/png",
                                  b"\x89PNG\r\n\x1a\n" + b"\0" * (5 * 1024 * 1024))
            check("SEC-L3 oversize rejected server-side",
                  s == 400, f"got {s} {b[:120]}")
            tiny_png = base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
                "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
            s, b = storage_upload(url, anon, proof_path, "image/png", tiny_png)
            check("SEC-L3 valid tiny png upload succeeds (control)",
                  s == 200, f"got {s} {b[:120]}")
        finally:
            storage_delete(url, anon, demo_jwt, proof_path)
            sql(ref, f"delete from payment_proofs where id = '{proof_id}'")
            left = sql(ref, "select count(*) as c from payment_proofs "
                            f"where id = '{proof_id}'")
            left_obj = sql(ref, "select count(*) as c from storage.objects "
                                "where bucket_id = 'payment-proofs' "
                                f"and name = '{proof_path}'")
            check("SEC-L3 fixtures cleaned",
                  left and int(left[0]["c"]) == 0
                  and left_obj and int(left_obj[0]["c"]) == 0,
                  f"got rows={left} objects={left_obj}")
    finally:
        # ---------- cleanup ----------
        ids = [u for u in (other_uid, asst_uid, self_uid) if u]
        if ids:
            in_list = ",".join(f"'{u}'" for u in ids)
            sql(ref, f"delete from teacher_members where user_id in ({in_list})")
            sql(ref, f"delete from teachers where owner_user_id in ({in_list})")
            sql(ref, f"delete from auth.users where id in ({in_list})")
        base1 = baseline(ref)
        print(f"cleanup baseline: {base1}")
        check("baseline restored after cleanup", base1 == base0,
              f"{base0} -> {base1}")

    print(f"\nauthz tests: {CHECKS - len(FAILURES)}/{CHECKS} passed")
    if FAILURES:
        print("FAILED:", ", ".join(FAILURES))
        sys.exit(1)


if __name__ == "__main__":
    main()
