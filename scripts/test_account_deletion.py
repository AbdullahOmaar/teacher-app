#!/usr/bin/env python3
"""E2E test: account deletion (gap 32 — Phase 2 T3, migration 0046).

Creates a throwaway teacher (auth user + teacher row + seeded rows across
the teacher's tables + one proof + one storage object), then:
  1. anon call to the RPC -> must fail (no session);
  2. demo-user call to the RPC -> must fail ('demo account cannot be deleted');
  3. throwaway-user call to the RPC -> must succeed with a per-table report;
  4. verifies the cascade: teacher row, all seeded rows, and the auth user
     are gone; the proof's storage.objects row REMAINS as a documented
     orphan (0047: protect_delete blocks direct storage deletes); the demo
     baseline is untouched (teachers=2, students=42, auth.users=3).
Secrets (anon key, passwords) are read in-process from .env.local and never
printed. Exits non-zero on any failure; best-effort cleanup on failure.
"""
import json
import os
import secrets
import subprocess
import sys
import time

sys.path.insert(0, os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin"))
from supabase_api import call  # noqa: E402

REF = "qkwdyqocazwhojpyifbv"
REPO = os.path.expanduser("~/workspace/teacher-app-identity2")

FAILURES = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def sql(query):
    return call("POST", f"/v1/projects/{REF}/database/query", {"query": query})


def env():
    out = {}
    with open(os.path.join(REPO, ".env.local")) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def rest(url, anon, method, path, jwt=None, body=None):
    """REST via curl — Semgrep flags dynamic urllib use
    (python.lang.security.audit.dynamic-urllib-use-detected), and curl also
    survives the sandbox proxy drops that broke urllib here (same reason
    authz_tests.py uses curl for REST). Retries twice on transport failure."""
    cmd = ["curl", "-sS", "-w", "\n%{http_code}", "-X", method, url + path,
           "-H", f"apikey: {anon}",
           "-H", f"Authorization: Bearer {jwt or anon}",
           "-H", "Content-Type: application/json",
           "--max-time", "30"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    last_exc = None
    for attempt in range(3):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True,
                                 timeout=40)
        except (subprocess.SubprocessError, OSError) as e:
            last_exc = e
            time.sleep(2 * (attempt + 1))
            continue
        if out.returncode != 0:
            last_exc = RuntimeError(out.stderr.strip()[:200] or "curl failed")
            time.sleep(2 * (attempt + 1))
            continue
        text, _, code = out.stdout.rpartition("\n")
        status = int(code) if code.isdigit() else 0
        try:
            return status, json.loads(text or "null")
        except Exception:
            return status, {"raw": text[:300]}
    raise last_exc


def sign_in(url, anon, email, password):
    s, b = rest(url, anon, "POST",
                "/auth/v1/token?grant_type=password",
                body={"email": email, "password": password})
    assert s == 200, f"sign-in failed for {email}: {s} {b}"
    return b["access_token"]


def main():
    e = env()
    url = e["VITE_SUPABASE_URL"]
    anon = e["VITE_SUPABASE_ANON_KEY"]
    stamp = str(int(time.time()))
    email = f"test-delete-{stamp}@teacher-app.test"
    password = secrets.token_urlsafe(16)

    # pre-cleanup: remove leftovers of any previous interrupted run
    for r in sql("select id, owner_user_id from public.teachers "
                 "where display_name='اختبار الحذف'"):
        sql(f"delete from public.teachers where id='{r['id']}'")
        sql(f"delete from auth.users where id='{r['owner_user_id']}'")

    print("baseline:")
    base_teachers = sql("select count(*) c from public.teachers")[0]["c"]
    base_users = sql("select count(*) c from auth.users")[0]["c"]
    base_students = sql("select count(*) c from public.students")[0]["c"]
    print(f"  teachers={base_teachers} users={base_users} students={base_students}")
    assert (base_teachers, base_users, base_students) == (2, 3, 42), "baseline drifted"

    # --- fixture: throwaway auth user + teacher + seeded rows ---
    # User creation reuses the established pattern from scripts/authz_tests.py
    # (create_user_sql): direct insert into auth.users with a bcrypt hash +
    # an email identity row. The Management API has no POST /auth/users.
    pw_esc = password.replace("'", "''")
    em_esc = email.replace("'", "''")
    uid = sql(
        "insert into auth.users (instance_id, id, aud, role, email, "
        "encrypted_password, email_confirmed_at, raw_app_meta_data, "
        "raw_user_meta_data, created_at, updated_at, confirmation_token, "
        "email_change, email_change_token_new, recovery_token) values "
        "('00000000-0000-0000-0000-000000000000', gen_random_uuid(), "
        f"'authenticated', 'authenticated', '{em_esc}', "
        f"crypt('{pw_esc}', gen_salt('bf')), now(), "
        "'{\"provider\":\"email\",\"providers\":[\"email\"]}', '{}', now(), now(), '"
        "', '', '', '') returning id")[0]["id"]
    sql(
        "insert into auth.identities (id, user_id, provider_id, identity_data, "
        "provider, last_sign_in_at, created_at, updated_at) values "
        f"(gen_random_uuid(), '{uid}', '{uid}', "
        f"jsonb_build_object('sub', '{uid}', 'email', '{em_esc}'), 'email', "
        "now(), now(), now())")
    print(f"  fixture auth user created: {uid[:8]}…")
    teacher = sql(
        "insert into public.teachers (owner_user_id, display_name) values "
        f"('{uid}', 'اختبار الحذف') returning id")[0]["id"]
    sql(f"insert into public.teacher_settings (teacher_id) values ('{teacher}')")
    group = sql(
        "insert into public.groups (teacher_id, name, start_time) values "
        f"('{teacher}', 'مجموعة الحذف', '16:00') returning id")[0]["id"]
    student = sql(
        "insert into public.students (teacher_id, name, public_code) values "
        f"('{teacher}', 'طالب الحذف', 'DEL{stamp[-6:]}') returning id")[0]["id"]
    invoice = sql(
        "insert into public.invoices (teacher_id, student_id, group_id, period_month) values "
        f"('{teacher}', '{student}', '{group}', '2026-11-01') returning id")[0]["id"]
    sql(f"insert into public.invoice_lines (teacher_id, invoice_id, line_type, description, amount) "
        f"values ('{teacher}', '{invoice}', 'base', 'قسط', 100)")
    sql(f"insert into public.payments (teacher_id, invoice_id, amount, method, paid_on, receipt_no) "
        f"values ('{teacher}', '{invoice}', 100, 'cash', '2026-11-24', 'DEL-1')")
    proof_path = f"{teacher}/proof-{stamp}.png"
    guardian = sql(
        "insert into public.guardians (teacher_id, display_name, phone) values "
        f"('{teacher}', 'ولي أمر الحذف', '01000000000') returning id")[0]["id"]
    sql("insert into public.payment_proofs (teacher_id, guardian_id, student_id, invoice_id, amount, "
        "method, storage_path, status) values "
        f"('{teacher}', '{guardian}', '{student}', '{invoice}', 100, 'instapay', '{proof_path}', 'pending')")
    sql("insert into storage.objects (bucket_id, name, owner, metadata) values "
        f"('payment-proofs', '{proof_path}', '{uid}', '{{\"mimetype\": \"image/png\"}}')")
    sql("insert into public.guardian_access_tokens (teacher_id, guardian_id, student_id, token_hash, expires_at) "
        f"values ('{teacher}', '{guardian}', '{student}', 'deadbeef', now() + interval '1 day')")
    sql("insert into public.push_subscriptions (teacher_id, user_id, subscriber_kind, endpoint, p256dh, auth) values "
        f"('{teacher}', '{uid}', 'teacher', 'https://example.test/push/{stamp}', 'k', 'a')")
    sql(f"insert into public.activity_log (teacher_id, actor_id, actor_role, event_type) values ('{teacher}', '{uid}', 'owner', 'payment_created')")

    jwt = sign_in(url, anon, email, password)

    try:
        print("negative tests:")
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/delete_my_teacher_account")
        check("anon call rejected", s in (401, 403), f"status={s} body={b}")
        check("teacher still exists after anon call",
              sql(f"select count(*) c from public.teachers where id='{teacher}'")[0]["c"] == 1)

        demo_jwt = sign_in(url, anon, "demo@teacher-app.com", "Demo123456")
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/delete_my_teacher_account", jwt=demo_jwt)
        msg = json.dumps(b, ensure_ascii=False)
        check("demo call refused", s >= 400 and "demo account cannot be deleted" in msg,
              f"status={s} body={msg[:200]}")
        check("demo teacher still exists",
              sql("select count(*) c from public.teachers "
                  "where owner_user_id = (select id from auth.users "
                  "where email='demo@teacher-app.com')")[0]["c"] == 1)

        print("positive test:")
        s, b = rest(url, anon, "POST", "/rest/v1/rpc/delete_my_teacher_account", jwt=jwt)
        check("owner call succeeds", s == 200, f"status={s} body={json.dumps(b)[:300]}")
        if s == 200:
            rep = b
            check("report names the teacher", rep.get("teacher_id") == teacher)
            dt = rep.get("deleted_tables", {})
            check("report counts seeded rows",
                  dt.get("students") == 1 and dt.get("groups") == 1
                  and dt.get("invoices") == 1 and dt.get("payments") == 1
                  and dt.get("payment_proofs") == 1,
                  f"deleted_tables={dt}")
            check("report counts the orphaned storage object",
                  rep.get("storage_objects_orphaned") == 1)

        print("verification:")
        check("teacher row gone",
              sql(f"select count(*) c from public.teachers where id='{teacher}'")[0]["c"] == 0)
        for tbl, col in (("students", "teacher_id"), ("groups", "teacher_id"),
                         ("invoices", "teacher_id"), ("payments", "teacher_id"),
                         ("payment_proofs", "teacher_id"),
                         ("guardian_access_tokens", "teacher_id"),
                         ("push_subscriptions", "teacher_id"),
                         ("activity_log", "teacher_id"),
                         ("teacher_settings", "teacher_id")):
            check(f"{tbl} rows gone",
                  sql(f"select count(*) c from public.{tbl} where {col}='{teacher}'")[0]["c"] == 0)
        check("storage object row REMAINS as documented orphan (0047: "
              "protect_delete blocks direct deletes; file unreachable in "
              "the private bucket)",
              sql(f"select count(*) c from storage.objects where name='{proof_path}'")[0]["c"] == 1)
        check("auth user gone",
              sql(f"select count(*) c from auth.users where id='{uid}'")[0]["c"] == 0)
        check("other teachers untouched",
              sql("select count(*) c from public.teachers")[0]["c"] == 2)
        check("baseline restored",
              sql("select count(*) c from auth.users")[0]["c"] == 3
              and sql("select count(*) c from public.students")[0]["c"] == 42)
    finally:
        # best-effort cleanup if anything above failed mid-way. The storage
        # row needs the documented session escape hatch (protect_delete
        # blocks direct deletes) — used here only to remove this test's own
        # orphan; the product itself leaves orphans by design (0047).
        sql(f"delete from public.teachers where id='{teacher}'")
        sql(f"delete from auth.users where id='{uid}'")
        sql("select set_config('storage.allow_delete_query','true',false); "
            f"delete from storage.objects where name='{proof_path}'")

    print(f"\naccount-deletion E2E: {'ALL PASS' if not FAILURES else f'{len(FAILURES)} FAILURES: {FAILURES}'}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
