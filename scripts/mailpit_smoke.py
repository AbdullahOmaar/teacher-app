#!/usr/bin/env python3
# ============================================================================
# اعتراض البريد بـ Mailpit — فجوة 45 من تقييم الـ45 (Phase 2، المهمة 7)
# ----------------------------------------------------------------------------
# يثبت أن مسار إرسال SMTP كامل يمكن اعتراضه محلياً/في CI بلا أي إرسال
# حقيقي: نرسل رسالة اختبار عبر SMTP إلى Mailpit، ثم نتحقق عبر واجهته
# البرمجية (HTTP API) أن الرسالة وصلت بعناوينها وموضوعها كما هي.
# تدفقات بريد المنتج الفعلية (تأكيد/استرداد Supabase Auth) تُرسَل من
# المنصة عبر Brevo في الإنتاج (3A-308) ولا تمرّ بهذا السكربت — دوره
# إثبات طبقة الاعتراض نفسها وتوثيق كيفية توجيه أي SMTP اختباري إليها:
#   MAILPIT_SMTP_HOST/PORT  (افتراضي localhost:1025)
#   MAILPIT_API_URL         (افتراضي http://localhost:8025)
# التشغيل محلياً: docker run -p 1025:1025 -p 8025:8025 axllent/mailpit
# ثم: python3 scripts/mailpit_smoke.py
# في CI: وظيفة mail-interception تشغّل الحاوية ثم هذا السكربت (حاجبة).
# ============================================================================
import json
import os
import smtplib
import sys
import time
import urllib.request
import uuid
from email.message import EmailMessage

SMTP_HOST = os.environ.get("MAILPIT_SMTP_HOST", "localhost")
SMTP_PORT = int(os.environ.get("MAILPIT_SMTP_PORT", "1025"))
API_URL = os.environ.get("MAILPIT_API_URL", "http://localhost:8025").rstrip("/")

failures = []


def check(name, cond, extra=""):
    if cond:
        print(f"  PASS  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name} {extra}")


def api_get(path):
    with urllib.request.urlopen(f"{API_URL}{path}", timeout=10) as resp:
        return json.loads(resp.read().decode("utf8"))


def main():
    token = uuid.uuid4().hex[:12]
    subject = f"t7-mailpit-probe-{token}"
    sender = "probe@teacher-app.test"
    recipient = "guardian@example.test"

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content("رسالة اعتراض اختبارية — لا إرسال حقيقي خارج Mailpit.")

    print(f"mailpit smoke: smtp {SMTP_HOST}:{SMTP_PORT}, api {API_URL}")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.send_message(msg)
        check("SMTP send accepted by Mailpit", True)
    except Exception as e:  # فشل الاتصال نفسه نتيجة فحص صادقة
        check("SMTP send accepted by Mailpit", False, f"({type(e).__name__}: {e})")
        print(f"\nmailpit smoke: FAILED ({len(failures)} check(s))")
        return 1

    found = None
    deadline = time.time() + 30
    while time.time() < deadline:
        data = api_get("/api/v1/messages?limit=50")
        for item in data.get("messages", []):
            if item.get("Subject") == subject:
                found = item
                break
        if found:
            break
        time.sleep(1)

    check("message visible via Mailpit API", found is not None)
    if found:
        frm = (found.get("From") or {}).get("Address", "")
        to_addrs = [t.get("Address", "") for t in found.get("To", [])]
        check("sender preserved", frm == sender, f"got {frm}")
        check("recipient preserved", recipient in to_addrs, f"got {to_addrs}")
        check("message marked unread in test inbox", found.get("Read") is False)

        detail = api_get(f"/api/v1/message/{found['ID']}")
        text = detail.get("Text", "")
        check("body preserved verbatim", "لا إرسال حقيقي خارج Mailpit" in text)

    if failures:
        print(f"\nmailpit smoke: FAILED ({len(failures)} check(s))")
        return 1
    print("\nmailpit smoke: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
