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
import json
import os
import re
import secrets
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
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:300]}")
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
        args += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
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

            # إخفاء قسم المال: الرصيد لا يصل أصلاً (0038)
            rest(url, anon, "PATCH",
                 f"/rest/v1/teacher_settings?teacher_id=eq.{demo_teacher}",
                 jwt=demo_jwt, body={"portal_guardian_show_money": False})
            try:
                s, b = rest(url, anon, "POST",
                            "/rest/v1/rpc/portal_overview_by_token",
                            body={"p_token": link_raw,
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
