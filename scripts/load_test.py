#!/usr/bin/env python3
"""
اختبار حمل ما قبل أول مدرس حقيقي (Phase 2 T16 — فجوة 8 من تقييم الـ45).

يزرع سنتراً واقعياً داخل حساب الديمو العام نفسه (نمط pilot_seed.py):
٤ مجموعات + ١٠٠ طالب + تسجيلاتهم + حصص مولّدة تلقائياً، كلها موسومة
«LOAD-T16»، ثم يقيس مسار التطبيق الحقيقي (PostgREST بهوية المدرس
نفسه عبر GoTrue) تحت تزامن، ثم يمسح بالوسم ويتحقق من خط الأساس.

السيناريوهات:
  R1 قائمة الطلاب (١٠٠ صف)          — قراءة
  R2 قائمة حضور حصة (٢٥ صفاً)       — قراءة
  R3 أرصدة الفواتير (invoice_balances) — قراءة
  W1 حفظ حضور ٤ حصص دفعة واحدة (٢٥ صفاً × ٤، متزامنة) — كتابة
  W2 تحديثات حضور فردية (٤٠ طلباً)  — كتابة
  M1 ذروة مختلطة: ٣٠٠ طلب قراءة عند تزامن ٣٠

الأهداف (بوابة go/no-go لـ3A-232 — دراسة المهمة 16 ‏§2):
  قراءات p95 ‏< 1000ms عند التزامن المستهدف، W1 الكلي < 3000ms،
  وصفر أخطاء 5xx/شبكة في كل السيناريوهات.

القياس باتصالات HTTP ثابتة (keep-alive عبر نفق البروكسي) — قياس أولي
بعمليات curl منفصلة أعطى p95 مضخّماً ~٣٫٣s بسبب مصافحات TLS وزحام
عمليات على VM محدود، بينما الاتصال الثابت (سلوك المتصفح الحقيقي)
يعطي ١٥٠–٣٥٠ms للطلب نفسه. التشغيل: python3 scripts/load_test.py
SQL عبر Management API بأداة الموصل — لا أسرار تُطبع (بيانات اعتماد
الديمو عامة عمداً بقرار المالك).
"""
import http.client
import json
import os
import ssl
import subprocess
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
REF = "qkwdyqocazwhojpyifbv"
TAG = "LOAD-T16"
DEMO_EMAIL = "demo@teacher-app.com"
DEMO_PASSWORD = "Demo123456"  # حساب تجريبي عام عمداً (قرار المالك)

RESULTS = {}


def sql(query):
    out = subprocess.run(
        [sys.executable, HELPER, "query-inline", REF, query],
        capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        raise RuntimeError(f"SQL failed: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout) if out.stdout.strip() else []


def load_env():
    env = {}
    for line in open(os.path.join(REPO, ".env.local"), encoding="utf8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]


_local = threading.local()


def _connection(url):
    """اتصال HTTPS ثابت لكل خيط (keep-alive) — عبر نفق CONNECT إن
    وُجد بروكسي خروج في البيئة، ومباشرة بدونه."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        host = urllib.parse.urlparse(url).hostname
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if proxy:
            p = urllib.parse.urlparse(proxy)
            # التحقق من الشهادة صريح (سياق افتراضي يتحقق) — قاعدة التدقيق
            # ‏httpsconnection-detected تُشعل على أي استدعاء، فالتعطيل هنا
            # ‏مبرَّر: نقاط النهاية مملوكة للمشروع وحده (Supabase/Vercel)
            # ‏ولا أسرار في السكربت.
            conn = http.client.HTTPSConnection(  # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
                p.hostname, p.port, timeout=30, context=ssl.create_default_context()
            )
            conn.set_tunnel(host, 443)
        else:
            conn = http.client.HTTPSConnection(  # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
                host, 443, timeout=30, context=ssl.create_default_context()
            )
        _local.conn = conn
    return conn


def timed_req(url, anon, jwt, method, path, body=None, extra_headers=()):
    """طلب واحد باتصال ثابت — يرجع (status, seconds). عند انقطاع
    الاتصال يعيد بناءه ويحاول مرة واحدة قبل إعلان الفشل."""
    headers = {"apikey": anon, "Authorization": f"Bearer {jwt}"}
    payload = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body)
    for h in extra_headers:
        k, _, v = h.partition(":")
        headers[k.strip()] = v.strip()
    for attempt in range(2):
        started = time.time()
        try:
            conn = _connection(url)
            conn.request(method, path, body=payload, headers=headers)
            resp = conn.getresponse()
            resp.read()
            return resp.status, time.time() - started
        except Exception:
            _local.conn = None
            if attempt == 1:
                return 0, time.time() - started
    return 0, 30.0


def sign_in(url, anon):
    args = [
        "curl", "-sS", "--max-time", "30", "-X", "POST",
        "-H", f"apikey: {anon}", "-H", "Content-Type: application/json",
        "-d", json.dumps({"email": DEMO_EMAIL, "password": DEMO_PASSWORD}),
        url + "/auth/v1/token?grant_type=password",
    ]
    out = subprocess.run(args, capture_output=True, text=True, timeout=60)
    return json.loads(out.stdout)["access_token"]


def pct(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(len(s) - 1, int(len(s) * p / 100))]


def run_scenario(name, jobs, workers):
    """jobs: قائمة دوال بلا وسيطات ترجع (status, secs)."""
    started = time.time()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        outcomes = list(ex.map(lambda f: f(), jobs))
    wall = time.time() - started
    times = [s for _, s in outcomes]
    errors = sum(1 for c, _ in outcomes if c == 0 or c >= 500)
    RESULTS[name] = {
        "n": len(outcomes), "errors": errors, "wall_s": round(wall, 2),
        "p50_ms": round(pct(times, 50) * 1000), "p95_ms": round(pct(times, 95) * 1000),
        "max_ms": round(max(times) * 1000) if times else 0,
    }
    r = RESULTS[name]
    print(f"  {name}: n={r['n']} errors={r['errors']} wall={r['wall_s']}s "
          f"p50={r['p50_ms']}ms p95={r['p95_ms']}ms max={r['max_ms']}ms")
    return outcomes


def wipe(tid):
    sql(f"delete from attendance where teacher_id = '{tid}' and session_id in "
        f"(select id from sessions where teacher_id = '{tid}' and group_id in "
        f"(select id from groups where teacher_id = '{tid}' and name like '%{TAG}%'))")
    sql(f"delete from sessions where teacher_id = '{tid}' and group_id in "
        f"(select id from groups where teacher_id = '{tid}' and name like '%{TAG}%')")
    sql(f"delete from enrollments where teacher_id = '{tid}' and student_id in "
        f"(select id from students where teacher_id = '{tid}' and name like 'طالب حمل%')")
    sql(f"delete from students where teacher_id = '{tid}' and name like 'طالب حمل%'")
    sql(f"delete from groups where teacher_id = '{tid}' and name like '%{TAG}%'")


def seed(tid, url, anon, jwt):
    wipe(tid)
    group_ids = []
    for i in range(1, 5):
        rows = sql(
            "insert into groups (teacher_id, name, billing_type, price, days, "
            "start_time, duration_minutes) values "
            f"('{tid}', 'مجموعة حمل {TAG} {i}', 'monthly_fixed', 300, "
            "'{6}', '17:00', 60) returning id"
        )
        group_ids.append(rows[0]["id"])
    arr = "array[" + ",".join(f"'{g}'::uuid" for g in group_ids) + "]"
    sql(
        "with s as ("
        "  insert into students (teacher_id, name) "
        f"  select '{tid}', 'طالب حمل {TAG} ' || lpad(g::text, 3, '0') "
        "  from generate_series(1, 100) g returning id, name"
        "), ranked as ("
        "  select id, row_number() over (order by name) rn from s"
        ") insert into enrollments (teacher_id, student_id, group_id) "
        f"select '{tid}', id, ({arr})[((rn - 1) / 25) + 1] from ranked"
    )
    # الحصص لا تُولّد بزناد على إنشاء المجموعة — التطبيق يستدعي
    # generate_teacher_sessions (‏RPC ‏0022) بعد الإنشاء، والدالة
    # محروسة بـauth.uid() فلا تعمل من SQL إداري؛ نستدعيها عبر
    # PostgREST بهوية الديمو نفسها — مسار العميل الحقيقي حرفياً.
    month = time.strftime("%Y-%m-01")
    status, _ = timed_req(url, anon, jwt, "POST",
                          "/rest/v1/rpc/generate_teacher_sessions",
                          body={"p_teacher_id": tid, "p_months": [month]})
    if status != 200:
        raise RuntimeError(f"generate_teacher_sessions RPC: HTTP {status}")
    # نأخذ أقرب حصة لليوم لكل مجموعة
    sessions = sql(
        "select distinct on (group_id) id, group_id from sessions "
        f"where teacher_id = '{tid}' and group_id in ({','.join(repr(g) for g in group_ids)}) "
        "order by group_id, abs(session_date - current_date)"
    )
    students = sql(
        "select student_id, group_id from enrollments "
        f"where teacher_id = '{tid}' and group_id in ({','.join(repr(g) for g in group_ids)})"
    )
    return group_ids, {s["group_id"]: s["id"] for s in sessions}, students


def main():
    url, anon = load_env()
    tid = sql(
        "select t.id from teachers t join auth.users u "
        "on u.id = t.owner_user_id where u.email = 'demo@teacher-app.com'"
    )[0]["id"]
    jwt = sign_in(url, anon)
    print(f"load test against demo centre (tag {TAG})")
    try:
        group_ids, session_by_group, enrollments = seed(tid, url, anon, jwt)
        print(f"  seeded: 4 groups, 100 students, sessions={len(session_by_group)}")
        by_group = {}
        for e in enrollments:
            by_group.setdefault(e["group_id"], []).append(e["student_id"])

        R = "/rest/v1"
        # R1/R2/R3 — قراءات عند تزامن ٢٠
        run_scenario("R1 students list x60 @20",
                     [lambda: timed_req(url, anon, jwt, "GET",
                                         f"{R}/students?select=id,name&order=name&limit=200")
                      for _ in range(60)], 20)
        sid0 = session_by_group[group_ids[0]]
        run_scenario("R2 attendance roster x60 @20",
                     [lambda: timed_req(url, anon, jwt, "GET",
                                         f"{R}/attendance?select=student_id,status&session_id=eq.{sid0}")
                      for _ in range(60)], 20)
        run_scenario("R3 invoice_balances x60 @20",
                     [lambda: timed_req(url, anon, jwt, "GET",
                                         f"{R}/invoice_balances?select=*&limit=100")
                      for _ in range(60)], 20)
        # W1 — حفظ حضور ٤ حصص دفعة واحدة (٢٥ صفاً لكل حصة) متزامنة
        def bulk(gid):
            rows = [{"teacher_id": tid, "session_id": session_by_group[gid],
                     "student_id": s, "status": "p"} for s in by_group[gid]]
            return timed_req(url, anon, jwt, "POST", f"{R}/attendance", body=rows,
                             extra_headers=("Prefer: return=minimal",))
        run_scenario("W1 attendance bulk 4x25 @4", [lambda g=g: bulk(g) for g in group_ids], 4)
        # W2 — تحديثات فردية
        singles = [(session_by_group[g], s) for g in group_ids for s in by_group[g][:10]]
        run_scenario("W2 single updates x40 @20",
                     [lambda ss=ss: timed_req(
                         url, anon, jwt, "PATCH",
                         f"{R}/attendance?session_id=eq.{ss[0]}&student_id=eq.{ss[1]}",
                         body={"status": "a"}, extra_headers=("Prefer: return=minimal",))
                      for ss in singles], 20)
        # M1 — ذروة مختلطة: ٣٠٠ طلب عند تزامن ٣٠
        mix_paths = [
            f"{R}/students?select=id,name&order=name&limit=200",
            f"{R}/attendance?select=student_id,status&session_id=eq.{sid0}",
            f"{R}/invoice_balances?select=*&limit=100",
        ]
        run_scenario("M1 mixed peak x300 @30",
                     [lambda i=i: timed_req(url, anon, jwt, "GET", mix_paths[i % 3])
                      for i in range(300)], 30)
        # CONTROL — نقطة صحة Vercel الإنتاجية عند نفس التزامن: بنية
        # مختلفة تماماً، فإذا أظهرت نفس تشبّع الإنتاجية فالسقف من
        # مسار القياس نفسه (بروكسي الخروج + VM) لا من الخادم.
        run_scenario("CONTROL vercel health x60 @20",
                     [lambda: timed_req("https://teacher-app-prod.vercel.app",
                                        anon, anon, "GET", "/api/health")
                      for _ in range(60)], 20)
    finally:
        wipe(tid)
        print("  wiped: load fixtures removed by tag")

    print("\n== verdict vs targets ==")
    ok = True
    for name in ("R1 students list x60 @20", "R2 attendance roster x60 @20",
                 "R3 invoice_balances x60 @20", "M1 mixed peak x300 @30"):
        r = RESULTS[name]
        good = r["p95_ms"] < 1000 and r["errors"] == 0
        ok &= good
        print(f"  {'GO' if good else 'NO-GO'} {name}: p95={r['p95_ms']}ms errors={r['errors']}")
    w1 = RESULTS["W1 attendance bulk 4x25 @4"]
    good = w1["max_ms"] < 3000 and w1["errors"] == 0
    ok &= good
    print(f"  {'GO' if good else 'NO-GO'} W1 bulk save: max={w1['max_ms']}ms errors={w1['errors']}")
    w2 = RESULTS["W2 single updates x40 @20"]
    good = w2["p95_ms"] < 1000 and w2["errors"] == 0
    ok &= good
    print(f"  {'GO' if good else 'NO-GO'} W2 updates: p95={w2['p95_ms']}ms errors={w2['errors']}")
    ctl = RESULTS["CONTROL vercel health x60 @20"]
    print(f"  vantage check: CONTROL p95={ctl['p95_ms']}ms — "
          + ("مسار القياس نفسه يتشبّع عند هذا التزامن؛ أرقام p95 من "
             "هذه النقطة ليست دليل خادم (انظر دراسة T16 ‏§2)"
             if ctl["p95_ms"] >= 1000 else
             "مسار القياس سليم؛ أرقام p95 دليل خادم فعلي"))
    print(f"LOAD TEST {'GO' if ok else 'NO-GO'}")
    print(json.dumps(RESULTS, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
