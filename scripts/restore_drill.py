#!/usr/bin/env python3
"""
تجربة استرجاع نسخة احتياطية فعلية (3A-299 — معيار §16، بند go/no-go):
1) يبني ملف نسخة احتياطية JSON لمدرّس الديمو بنفس مواصفة التطبيق حرفياً
   (BACKUP_TABLES تُقرأ من src/features/settings/api.ts حتى لا تنحرف).
2) يسترجعها إلى مستأجر مؤقت معزول تماماً (مستخدم + مدرّس جديدان) مع إعادة
   ربط كل المفاتيح الخارجية بمعرّفات جديدة — نفس قواعد importBackup.
3) يتحقق عددياً (عدد الصفوف لكل جدول + مجاميع مالية) وبنيوياً (لا أيتام).
4) ينظّف كل شيء ويتحقق أن عدّادات الأساس رجعت كما كانت.
النتيجة: حكم GO / NO-GO مطبوع في النهاية. التشغيل: python3 scripts/restore_drill.py
"""
import json
import os
import re
import secrets
import subprocess
import sys
import uuid

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
REF = "qkwdyqocazwhojpyifbv"
DEMO_TEACHER = "a8cfc920-dd1d-4191-8ac0-fec303b0d5bd"

FAILURES = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name} {detail if not cond else ''}")
    if not cond:
        FAILURES.append(name)


def sql(query):
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", REF, query],
        capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout) if out.stdout.strip() else []


def lit(value):
    """قيمة JSON كسلسلة SQL آمنة."""
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'"


def load_spec():
    src = open(os.path.join(REPO, "src/features/settings/api.ts"), encoding="utf8").read()
    spec = []
    for m in re.finditer(
        r"\{\s*key: '(\w+)',\s*table: '(\w+)',\s*label: '[^']*',\s*pk: \[([^\]]*)\],\s*columns: \[([^\]]*)\]\s*\}",
        src,
    ):
        cols = re.findall(r"'(\w+)'", m.group(4))
        spec.append({"key": m.group(1), "table": m.group(2), "columns": cols})
    if len(spec) < 20:
        raise RuntimeError(f"BACKUP_TABLES parse suspicious: {len(spec)} tables")
    return spec


def fetch_backup(spec):
    backup = {}
    for t in spec:
        cols = ", ".join(t["columns"])
        rows = sql(
            f"select coalesce(jsonb_agg(r), '[]'::jsonb) as rows from "
            f"(select {cols} from public.{t['table']} "
            f"where teacher_id = '{DEMO_TEACHER}') r"
        )
        backup[t["key"]] = rows[0]["rows"]
    settings = sql(
        f"select row_to_json(s) as row from teacher_settings s "
        f"where teacher_id = '{DEMO_TEACHER}'"
    )
    backup["teacher_settings"] = settings[0]["row"] if settings else None
    return backup


def create_user(email, password):
    pw = password.replace("'", "''")
    rows = sql(
        "insert into auth.users (instance_id, id, aud, role, email, "
        "encrypted_password, email_confirmed_at, raw_app_meta_data, "
        "raw_user_meta_data, created_at, updated_at, confirmation_token, "
        "email_change, email_change_token_new, recovery_token) values "
        "('00000000-0000-0000-0000-000000000000', gen_random_uuid(), "
        f"'authenticated', 'authenticated', '{email}', "
        f"crypt('{pw}', gen_salt('bf')), now(), "
        '\'{"provider":"email","providers":["email"]}\', \'{}\', now(), now(), '
        "'', '', '', '') returning id"
    )
    uid = rows[0]["id"]
    sql(
        "insert into auth.identities (id, user_id, provider_id, identity_data, "
        "provider, last_sign_in_at, created_at, updated_at) values "
        f"(gen_random_uuid(), '{uid}', '{uid}', "
        f"jsonb_build_object('sub', '{uid}', 'email', '{email}'), 'email', "
        "now(), now(), now())"
    )
    return uid


# إعادة الربط: عمود -> جدول المعرّفات المرجعية
FK = {
    "group_id": "groups", "student_id": "students", "guardian_id": "guardians",
    "invoice_id": "invoices", "session_id": "sessions",
    "assessment_id": "assessments", "exam_id": "online_exams",
    "payment_id": "payments",
}


def main():
    spec = load_spec()
    print(f"spec: {len(spec)} tables from BACKUP_TABLES")
    base0 = sql(
        "select (select count(*) from teachers) as teachers, "
        "(select count(*) from students) as students, "
        "(select count(*) from auth.users) as users"
    )[0]

    print("building backup for the demo teacher (app spec, service read)…")
    backup = fetch_backup(spec)
    total_rows = sum(len(v) for k, v in backup.items() if isinstance(v, list))
    print(f"backup built: {total_rows} rows across {len(spec)} tables + settings")

    pw = secrets.token_urlsafe(18)
    uid = new_teacher = None
    try:
        uid = create_user("restore-drill@teacher-app.test", pw)
        sql(
            "insert into teachers (id, owner_user_id, display_name) values "
            f"('{uid}', '{uid}', 'restore drill')"
        )
        new_teacher = uid  # ببناء التطبيق: teachers.id == owner_user_id
        print(f"isolated tenant created: {new_teacher}")

        # teacher_settings أولاً (بلا مفاتيح خارجية داخل النسخة)
        if backup["teacher_settings"]:
            row = dict(backup["teacher_settings"])
            row["teacher_id"] = new_teacher
            sql(
                "insert into teacher_settings select * from "
                f"jsonb_populate_record(null::teacher_settings, {lit(row)})"
            )

        id_map = {}   # table -> {old_id: new_id}
        deferred_scores = []
        deferred_refs = []
        expected_counts = {}  # table -> expected restored rows (after exclusions)
        exclusions = []
        for t in spec:
            table = t["table"]
            rows = backup[t["key"]]
            id_map.setdefault(table, {})
            out_rows = []
            for r in rows:
                r = dict(r)
                r["teacher_id"] = new_teacher
                if "id" in r and r["id"]:
                    new_id = str(uuid.uuid4())
                    id_map[table][r["id"]] = new_id
                    r["id"] = new_id
                for col, ref_table in FK.items():
                    if col in r and r[col]:
                        mapped = id_map.get(ref_table, {}).get(r[col])
                        if mapped:
                            r[col] = mapped
                        else:
                            raise RuntimeError(f"unmapped FK {table}.{col}={r[col]}")
                # قواعد toInsertRow في التطبيق حرفياً (مراجع auth.users
                # تُعاد نسبتها للمستورِد = teacher_id نفسه ببناء التطبيق)
                if table == "guardians":
                    r["user_id"] = None
                if table == "daily_closings":
                    r["closed_by"] = new_teacher
                if table == "payment_proofs" and r.get("reviewed_by"):
                    r["reviewed_by"] = new_teacher
                if table == "activity_log":
                    if r.get("actor_id"):
                        r["actor_id"] = new_teacher
                    r["actor_role"] = "owner"
                if table == "push_subscriptions" and r.get("subscriber_kind") == "teacher":
                    r["user_id"] = new_teacher
                if table == "at_risk_followups" and r.get("followed_by"):
                    r["followed_by"] = new_teacher
                # مراجع ذاتية/متأخرة تُرحَّل للمرور الثاني كالتطبيق تماماً
                if table == "sessions" and r.get("origin_session_id"):
                    deferred_refs.append(("sessions", r["id"], "origin_session_id",
                                          id_map["sessions"].get(r["origin_session_id"])))
                    r["origin_session_id"] = None
                if table == "payments" and r.get("reverses_payment_id"):
                    deferred_refs.append(("payments", r["id"], "reverses_payment_id",
                                          id_map["payments"].get(r["reverses_payment_id"])))
                    r["reverses_payment_id"] = None
                if table == "scores" and r.get("exam_attempt_id"):
                    deferred_scores.append((r, r["exam_attempt_id"]))
                    r["exam_attempt_id"] = None
                out_rows.append(r)
            if table == "push_subscriptions":
                # endpoint فريد عالمياً (push_subscriptions_endpoint_key):
                # اشتراك متصفح قائم في نفس المشروع لا يمكن تكراره — وفي
                # التطبيق يُحتسب فاشلاً/مكرراً ويعيد المتصفح الاشتراك من
                # جهاز المستورِد (توثيق toInsertRow). نستبعده هنا كاستبعاد
                # موثق بالتصميم ونعدّله من التوقع.
                existing_eps = {
                    r["endpoint"]
                    for r in sql("select endpoint from push_subscriptions")
                }
                kept = []
                for r in out_rows:
                    if r.get("endpoint") in existing_eps:
                        exclusions.append(
                            "push_subscriptions: endpoint already registered "
                            "in this project (global uniqueness)")
                    else:
                        kept.append(r)
                out_rows = kept
            expected_counts[table] = len(out_rows)
            if table == "guardian_notifications":
                # يعكس إصلاح importBackup: حذف تنبيهات التريجر المولّدة أثناء
                # هذا الاسترجاع (من إدراج الحضور) قبل إدراج صفوف النسخة
                sql(
                    "delete from guardian_notifications where "
                    f"teacher_id = '{new_teacher}'"
                )
            if out_rows:
                cols = ", ".join(t["columns"])
                # دفعات ١٠٠ صف: حمولة JSON كوسيط CLI لها سقف طول (ARG_MAX)
                for i in range(0, len(out_rows), 100):
                    chunk = out_rows[i:i + 100]
                    sql(
                        f"insert into public.{table} ({cols}) select {cols} from "
                        f"jsonb_populate_recordset(null::public.{table}, {lit(chunk)})"
                    )
            print(f"  restored {table}: {len(out_rows)}")
        # المرور الثاني أ: المراجع الذاتية المؤجلة (حصص/دفعات عكسية)
        for tbl, row_id, field, target in deferred_refs:
            if target:
                sql(f"update public.{tbl} set {field} = '{target}' "
                    f"where id = '{row_id}'")
        # المرور الثاني ب: ربط درجات الامتحانات بمحاولاتها (قاعدة importBackup)
        for r, old_attempt in deferred_scores:
            new_attempt = id_map["exam_attempts"][old_attempt]
            sql(
                "update scores set exam_attempt_id = "
                f"'{new_attempt}' where teacher_id = '{new_teacher}' "
                f"and assessment_id = '{r['assessment_id']}' "
                f"and student_id = '{r['student_id']}'"
            )

        print("VERIFICATION:")
        for t in spec:
            src_n = expected_counts.get(t["table"], len(backup[t["key"]]))
            got = sql(
                f"select count(*) as c from public.{t['table']} "
                f"where teacher_id = '{new_teacher}'"
            )[0]["c"]
            check(f"row count {t['table']}", got == src_n, f"{got} != {src_n}")
        for table, col in (("payments", "amount"), ("invoice_lines", "amount"),
                           ("expenses", "amount")):
            s_src = sql(
                f"select coalesce(sum({col}),0) as s from public.{table} "
                f"where teacher_id = '{DEMO_TEACHER}'"
            )[0]["s"]
            s_new = sql(
                f"select coalesce(sum({col}),0) as s from public.{table} "
                f"where teacher_id = '{new_teacher}'"
            )[0]["s"]
            check(f"sum {table}.{col} preserved", float(s_src) == float(s_new),
                  f"{s_src} != {s_new}")
        orphans = sql(
            "select count(*) as c from attendance a where "
            f"a.teacher_id = '{new_teacher}' and not exists "
            "(select 1 from sessions s where s.id = a.session_id)"
        )[0]["c"]
        check("no orphan attendance rows", orphans == 0, f"{orphans} orphans")
        orphans = sql(
            "select count(*) as c from invoice_lines l where "
            f"l.teacher_id = '{new_teacher}' and not exists "
            "(select 1 from invoices i where i.id = l.invoice_id)"
        )[0]["c"]
        check("no orphan invoice lines", orphans == 0, f"{orphans} orphans")
        linked = sql(
            "select count(*) as c from scores where "
            f"teacher_id = '{new_teacher}' and exam_attempt_id is not null"
        )[0]["c"]
        check("exam score links re-bound in pass 2", linked == len(deferred_scores),
              f"{linked} != {len(deferred_scores)}")
    finally:
        if new_teacher:
            for t in reversed(spec):
                sql(f"delete from public.{t['table']} where teacher_id = '{new_teacher}'")
            sql(f"delete from teacher_settings where teacher_id = '{new_teacher}'")
            sql(f"delete from teachers where id = '{new_teacher}'")
        if uid:
            sql(f"delete from auth.users where id = '{uid}'")
        base1 = sql(
            "select (select count(*) from teachers) as teachers, "
            "(select count(*) from students) as students, "
            "(select count(*) from auth.users) as users"
        )[0]
        check("global baseline restored", base1 == base0, f"{base0} -> {base1}")

    for ex in exclusions:
        print(f"documented exclusion: {ex}")
    verdict = "GO" if not FAILURES else "NO-GO"
    print(f"\nRESTORE DRILL VERDICT: {verdict} "
          f"({len(FAILURES)} failures: {FAILURES if FAILURES else 'none'})")
    sys.exit(0 if not FAILURES else 1)


if __name__ == "__main__":
    main()
