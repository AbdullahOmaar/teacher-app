#!/usr/bin/env python3
"""
بذر/مسح السنتر التجريبي للمساعد الذكي (Phase 2 T6 — البند ٦: الطيار).

يزرع داخل حساب الديمو العام نفسه (مدرّسنا نحن — بيانات اعتماده عامة
عمداً بقرار المالك): ٤ مجموعات + ١٠٠ طالب + تسجيلاتهم + حصص الشهر
الحالي، كلها موسومة بوسم الدفعة «PILOT-T6» في الاسم — والمسح يحذف
بأثر الوسم وحده (تسجيلات ← حضور ← حصص ← طلاب ← مجموعات) فلا يلمس
بيانات الأساس أبداً. تشغيلات المساعد التجريبية (assistant_runs)
تُحذف كلها لحساب الديمو لأن خط الأساس صفر فيها.

الاستخدام:
  python3 scripts/pilot_seed.py seed    # مسح قديم ثم زرع جديد (idempotent)
  python3 scripts/pilot_seed.py count   # عدّ المزروع + عدّادات الديمو
  python3 scripts/pilot_seed.py wipe    # مسح كامل وإعادة الأساس

SQL عبر Management API بأداة الموصل (نفس نمط authz_tests.py) — لا
أسرار تُطبع، ولا أي مفتاح مزوّد يمر من هنا.
"""
import json
import os
import subprocess
import sys

HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
REF = "qkwdyqocazwhojpyifbv"
TAG = "PILOT-T6"
GROUPS = 4
STUDENTS = 100
PER_GROUP = STUDENTS // GROUPS


def sql(query):
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", REF, query],
        capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout) if out.stdout.strip() else []


def demo_teacher():
    rows = sql(
        "select t.id from teachers t "
        "join auth.users u on u.id = t.owner_user_id "
        "where u.email = 'demo@teacher-app.com'"
    )
    if not rows:
        raise RuntimeError("demo teacher not found")
    return rows[0]["id"]


def wipe(tid):
    sql(f"delete from attendance where teacher_id = '{tid}' and session_id in "
        f"(select id from sessions where teacher_id = '{tid}' and group_id in "
        f"(select id from groups where teacher_id = '{tid}' and name like '%{TAG}%'))")
    sql(f"delete from sessions where teacher_id = '{tid}' and group_id in "
        f"(select id from groups where teacher_id = '{tid}' and name like '%{TAG}%')")
    sql(f"delete from enrollments where teacher_id = '{tid}' and student_id in "
        f"(select id from students where teacher_id = '{tid}' and name like '%{TAG}%')")
    sql(f"delete from students where teacher_id = '{tid}' and name like '%{TAG}%'")
    sql(f"delete from groups where teacher_id = '{tid}' and name like '%{TAG}%'")
    sql(f"delete from assistant_runs where teacher_id = '{tid}'")
    sql(f"delete from teacher_ai_keys where teacher_id = '{tid}'")


def seed(tid):
    wipe(tid)
    group_ids = []
    for i in range(1, GROUPS + 1):
        rows = sql(
            "insert into groups (teacher_id, name, billing_type, price, days, "
            "start_time, duration_minutes) values "
            f"('{tid}', 'مجموعة طيار {TAG} {i}', 'monthly', 300, "
            f"'{{6}}', '17:00', 60) returning id"
        )
        group_ids.append(rows[0]["id"])
    arr = "array[" + ",".join(f"'{g}'::uuid" for g in group_ids) + "]"
    sql(
        "with s as ("
        "  insert into students (teacher_id, name) "
        f"  select '{tid}', 'طالب طيار {TAG} ' || lpad(g::text, 3, '0') "
        "  from generate_series(1, 100) g returning id, name"
        "), ranked as ("
        "  select id, row_number() over (order by name) rn from s"
        ") insert into enrollments (teacher_id, student_id, group_id) "
        f"select '{tid}', id, ({arr})[((rn - 1) / {PER_GROUP}) + 1] from ranked"
    )
    for gid in group_ids:
        sql("select generate_group_sessions("
            f"'{tid}', '{gid}', date_trunc('month', current_date)::date)")
    return group_ids


def count(tid):
    rows = sql(
        "select "
        f"(select count(*) from students where teacher_id = '{tid}' and name like '%{TAG}%') as pilot_students, "
        f"(select count(*) from groups where teacher_id = '{tid}' and name like '%{TAG}%') as pilot_groups, "
        f"(select count(*) from sessions where teacher_id = '{tid}' and group_id in (select id from groups where teacher_id = '{tid}' and name like '%{TAG}%')) as pilot_sessions, "
        f"(select count(*) from assistant_runs where teacher_id = '{tid}') as demo_runs, "
        f"(select count(*) from teacher_ai_keys where teacher_id = '{tid}') as demo_keys, "
        "(select count(*) from teachers) as teachers, "
        "(select count(*) from students) as students, "
        "(select count(*) from groups) as groups_, "
        "(select count(*) from invoices) as invoices, "
        "(select count(*) from payments) as payments, "
        "(select count(*) from attendance) as attendance, "
        "(select count(*) from teacher_members) as members, "
        "(select count(*) from auth.users) as users"
    )
    return rows[0]


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "count"
    tid = demo_teacher()
    if cmd == "seed":
        gids = seed(tid)
        print(f"seeded: groups={len(gids)} students={STUDENTS} tag={TAG}")
    elif cmd == "wipe":
        wipe(tid)
        print("wiped: pilot data + demo assistant runs + demo provider key")
    elif cmd != "count":
        raise SystemExit(f"unknown command: {cmd}")
    print(json.dumps(count(tid), ensure_ascii=False))


if __name__ == "__main__":
    main()
