#!/usr/bin/env python3
"""
فحص/استعادة خط أساس بيئة الديمو (Phase 2 T16 — بند تحصين الديمو، ج3).

خط الأساس هو العقد الذي تُقاس عليه كل التشغيلات الحية في هذا الريبو:
١٨ نقطة عدّية موثقة (دراسة المهمة 11 ‏§3 + سجل المهام 9/10/12).
الانحراف المعروف والمتكرر: تدفقات e2e الصادقة (بوابات/دخول) تُنشئ
حسابات وجلسات بوابة في حساب الديمو العام — بقايا تشغيلية لا بيانات.

الاستخدام:
  python3 scripts/demo_baseline.py            # فحص فقط (exit 1 عند انحراف)
  python3 scripts/demo_baseline.py --restore  # فحص + استعادة جراحية + إعادة فحص

قاعدة الاستعادة الجراحية: تُلمس فقط فئتا الانحراف الموثقتان —
portal_sessions ثم portal_accounts (ترتيب FK) — لأن الأساس فيهما صفر
تماماً. أي عدّاد آخر منحرف يُبلَّغ ولا يُلمس أبداً من هذه الأداة.

ملحوظة activity: القيمة الصادقة الحالية 22 لا 20 — صفّا proof_rejected
شرعيان من تنظيف لقطات المهمة 10 (2026-11-25 09:29/09:34 UTC)؛ حذف
تاريخ نشاط شرعي لفرض الرقم تزوير، فالأساس الموثق هو 22 (T11 ‏§3).

SQL عبر Management API بأداة الموصل (نمط authz_tests.py نفسه) — لا
أسرار تُطبع.
"""
import json
import os
import subprocess
import sys

HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
REF = "qkwdyqocazwhojpyifbv"
DEMO_TEACHER = "a8cfc920-dd1d-4191-8ac0-fec303b0d5bd"

# الاسم المعروض ← (تعبير SQL، القيمة المتوقعة)
EXPECTED = [
    ("teachers", "select count(*) from teachers", 2),
    ("students", "select count(*) from students", 42),
    ("groups", "select count(*) from groups", 4),
    ("auth.users", "select count(*) from auth.users", 3),
    ("invoices", "select count(*) from invoices", 81),
    ("payments", "select count(*) from payments", 70),
    ("attendance", "select count(*) from attendance", 505),
    ("activity (=22 الموثقة)", "select count(*) from activity_log", 22),
    ("members", "select count(*) from teacher_members", 0),
    ("waitlist", "select count(*) from group_waitlist", 3),
    ("wa_config", "select count(*) from teacher_whatsapp_config", 0),
    ("scores", "select count(*) from scores", 102),
    ("portal_accounts", "select count(*) from portal_accounts", 0),
    ("portal_sessions", "select count(*) from portal_sessions", 0),
    ("teacher_ai_keys", "select count(*) from teacher_ai_keys", 0),
    ("assistant_runs", "select count(*) from assistant_runs", 0),
    (
        "active portal sessions",
        "select count(*) from portal_sessions "
        "where revoked_at is null and expires_at > now()",
        0,
    ),
    (
        "demo show_mascot",
        f"select show_mascot from teacher_settings "
        f"where teacher_id = '{DEMO_TEACHER}'",
        True,
    ),
]


def sql(query):
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", REF, query],
        capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout) if out.stdout.strip() else []


def measure():
    exprs = ", ".join(
        f"({expr}) as c{i}" for i, (_, expr, _) in enumerate(EXPECTED)
    )
    row = sql(f"select {exprs}")[0]
    return [(name, row[f"c{i}"], want) for i, (name, _, want) in enumerate(EXPECTED)]


def report(rows):
    drift = []
    for name, got, want in rows:
        ok = got == want
        print(f"  {'OK  ' if ok else 'DRIFT'} {name}: {got} (متوقع {want})")
        if not ok:
            drift.append((name, got, want))
    return drift


def restore():
    """استعادة جراحية: فئتا البوابة فقط (الأساس فيهما صفر)."""
    sql("delete from portal_sessions")
    sql("delete from portal_accounts")
    print("  restored: portal_sessions + portal_accounts cleared (baseline = 0)")


def main():
    do_restore = "--restore" in sys.argv
    print("demo baseline check:")
    drift = report(measure())
    if not drift:
        print("BASELINE OK — 18/18")
        return 0
    print(f"BASELINE DRIFT — {len(drift)} point(s): "
          + ", ".join(d[0] for d in drift))
    if not do_restore:
        print("فحص فقط — أعد التشغيل بـ --restore للاستعادة الجراحية "
              "(فئتا البوابة فقط؛ أي انحراف آخر يُبلَّغ ولا يُلمس)")
        return 1
    restorable = {"portal_accounts", "portal_sessions", "active portal sessions"}
    others = [d for d in drift if d[0] not in restorable]
    restore()
    print("demo baseline re-check:")
    drift2 = report(measure())
    if others:
        print(f"تنبيه: {len(others)} انحراف خارج فئات الاستعادة لم يُلمس: "
              + ", ".join(d[0] for d in others))
    if drift2:
        print(f"BASELINE STILL DRIFTED — {len(drift2)} point(s)")
        return 1
    print("BASELINE RESTORED — 18/18")
    return 0


if __name__ == "__main__":
    sys.exit(main())
