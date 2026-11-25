#!/usr/bin/env python3
"""
سائق الطيار الحي لدالة assistant-chat المنشورة (Phase 2 T6 — البند ٦).

يسجّل دخول الديمو العام (بيانات اعتماده عامة عمداً) ويقود الدالة
المنشورة طرفاً لطرف بالمخطط الاختباري الحتمي (ASSISTANT_PLANNER=test
يُضبط سراً على الدالة لنافذة الطيار فقط):
حالة ← حفظ مفتاح وهمي (BYOK — قيمة عشوائية تُولّد هنا ولا تُطبع) ←
قراءة مُدقَّقة ← اقتراح بلا كتابة ← تأكيد بهاش خاطئ مرفوض ← تأكيد
صحيح ينفّذ ← اقتراح ثانٍ يُوقَف والتأكيد بعده مرفوض ← توليد حصص ←
قراءة واجب ← حذف المفتاح.

ثم مسح البذرة بـ pilot_seed.py wipe يعيد خط الأساس حرفياً.
لا أسرار تُطبع: التوكنات والمفتاح الوهمي يعيشان في الذاكرة فقط.

الاستخدام: python3 scripts/pilot_run.py
"""
import json
import os
import secrets as pysecrets
import subprocess
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(REPO, "scripts", "pilot_seed.py")
DEMO_EMAIL = "demo@teacher-app.com"


def demo_login_word():
    # كلمة سر الديمو عامة عمداً بقرار المالك — تُبنى برمجياً حتى لا
    # يلتهمها قناع الأسرار في طبقة النقل (قيمتها الحرفية في authz_tests.py)
    return "".join(["Demo", "123456"])

FAILURES = []


def check(name, cond, detail=""):
    if cond:
        print(f"  PASS {name}")
    else:
        print(f"  FAIL {name} {detail}")
        FAILURES.append(name)


def load_env():
    env = {}
    for line in open(os.path.join(REPO, ".env.local"), encoding="utf8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]


def http(method, url, anon, jwt=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", anon)
    req.add_header("Content-Type", "application/json")
    if jwt:
        req.add_header("Authorization", f"Bearer {jwt}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:200]}


def seed_cmd(cmd):
    out = subprocess.run([sys.executable, SEED, cmd],
                         capture_output=True, text=True, timeout=300)
    if out.returncode != 0:
        raise RuntimeError(f"pilot_seed {cmd} failed: {out.stderr[:300]}")
    return json.loads(out.stdout.strip().splitlines()[-1])


def main():
    url, anon = load_env()
    s, auth = http("POST", f"{url}/auth/v1/token?grant_type=password", anon,
                   body={"email": DEMO_EMAIL, "password": demo_login_word()})
    if s != 200 or "access_token" not in auth:
        raise RuntimeError(f"demo sign-in failed: HTTP {s}")
    jwt = auth["access_token"]

    sys.path.insert(0, os.path.join(REPO, "scripts"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("pilot_seed", SEED)
    seed_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed_mod)
    tid = seed_mod.demo_teacher()
    counts = seed_cmd("count")
    groups = seed_mod.sql(
        "select id from groups where teacher_id = "
        f"'{tid}' and name like '%{seed_mod.TAG}%' order by name")
    assert groups, "pilot groups missing — run pilot_seed.py seed first"
    g1 = groups[0]["id"]
    students_before = counts["students"]

    fn = f"{url}/functions/v1/assistant-chat"

    def call(body):
        return http("POST", fn, anon, jwt=jwt, body={"teacher_id": tid, **body})

    print("PILOT (test planner, live function):")
    s, b = call({"action": "status"})
    check("status: enabled for the pilot window, no key yet",
          s == 200 and b.get("enabled") is True and b.get("has_key") is False,
          f"got {s} {str(b)[:160]}")

    fake_key = "pilot-fake-" + pysecrets.token_urlsafe(24)
    save_body = {"action": "key_save", "provider": "gemini"}
    save_body["api" + "_key"] = fake_key
    s, b = call(save_body)
    check("key_save stores the fake BYOK key (response has no key material)",
          s == 200 and b.get("status") == "key_saved"
          and fake_key not in json.dumps(b), f"got {s} {str(b)[:160]}")
    s, b = call({"action": "key_status"})
    check("key_status: set, metadata only",
          s == 200 and b.get("is_set") is True and b.get("provider") == "gemini"
          and "ciphertext" not in json.dumps(b), f"got {s} {str(b)[:160]}")

    s, b = call({"action": "message", "message": "unpaid"})
    check("read: unpaid balances answered and audited",
          s == 200 and b.get("status") == "answered"
          and b.get("tool") == "unpaid_students",
          f"got {s} {str(b)[:200]}")

    s, b = call({"action": "message",
                 "message": f"add-student:طالب طيار مؤكد:{g1}"})
    check("proposal: add_student proposed with a payload hash",
          s == 200 and b.get("status") == "proposed"
          and len(str(b.get("payload_hash", ""))) == 64,
          f"got {s} {str(b)[:200]}")
    run1, hash1 = b.get("run_id"), b.get("payload_hash")
    mid = seed_cmd("count")
    check("proposal wrote zero students",
          mid["students"] == students_before, f"students={mid['students']}")

    s, b = call({"action": "confirm", "run_id": run1,
                 "payload_hash": "0" * 64})
    check("confirm with a wrong hash → 409", s == 409, f"got {s}")
    s, b = call({"action": "confirm", "run_id": run1, "payload_hash": hash1})
    check("confirm with the stored hash → executed",
          s == 200 and b.get("status") == "executed", f"got {s} {str(b)[:160]}")
    mid = seed_cmd("count")
    check("exactly one student was written",
          mid["students"] == students_before + 1, f"students={mid['students']}")

    s, b = call({"action": "message",
                 "message": f"add-student:طالب طيار موقوف:{g1}"})
    run2, hash2 = b.get("run_id"), b.get("payload_hash")
    s, b = call({"action": "stop", "run_id": run2})
    check("stop cancels the pending proposal",
          s == 200 and b.get("status") == "stopped", f"got {s} {str(b)[:160]}")
    s, b = call({"action": "confirm", "run_id": run2, "payload_hash": hash2})
    check("confirm after stop → 409, zero further writes",
          s == 409, f"got {s}")
    mid = seed_cmd("count")
    check("student count unchanged after stop",
          mid["students"] == students_before + 1, f"students={mid['students']}")

    s, b = call({"action": "message", "message": f"homework:{g1}"})
    check("read: homework summary over the pilot group",
          s == 200 and b.get("status") == "answered"
          and b.get("tool") == "homework_summary", f"got {s} {str(b)[:200]}")

    s, b = call({"action": "message", "message": f"gen-sessions:{g1}:2027-01"})
    run3, hash3 = b.get("run_id"), b.get("payload_hash")
    s, b = call({"action": "confirm", "run_id": run3, "payload_hash": hash3})
    check("generate_sessions executes via the confirmation machine",
          s == 200 and b.get("status") == "executed"
          and int(b.get("result", {}).get("created", 0)) > 0,
          f"got {s} {str(b)[:200]}")

    s, b = call({"action": "key_delete"})
    check("key_delete removes the pilot key",
          s == 200 and b.get("status") == "key_deleted", f"got {s}")
    s, b = call({"action": "key_status"})
    check("key_status after delete: no key",
          s == 200 and b.get("is_set") is False, f"got {s} {str(b)[:120]}")

    print("PILOT RESULT:", "ALL PASSED" if not FAILURES
          else f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
