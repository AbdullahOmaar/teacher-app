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
import json
import os
import secrets
import subprocess
import sys

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
    other_uid = asst_uid = None
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
    finally:
        # ---------- cleanup ----------
        ids = [u for u in (other_uid, asst_uid) if u]
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
