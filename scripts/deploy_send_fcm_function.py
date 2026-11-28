#!/usr/bin/env python3
"""
نشر دالة send-fcm وإدارة أسرارها عبر Supabase Management API
(فيز 1 فلاتر F1-T8 — لا Supabase CLI في هذه البيئة).
verify_jwt معطّل عمداً: المستدعون داخليون والبوابة هي السرّ المشترك
x-push-secret داخل الدالة نفسها (نمط send-push).

النشر عبر نقطة النهاية multipart ‏(POST /v1/projects/{ref}/functions/deploy)
التي تستخدمها لوحة Supabase نفسها: metadata ‏JSON + ملفات المصدر.
الأسرار تُدار عبر /v1/projects/{ref}/secrets وقيمها تُقرأ من stdin
فقط — لا تُطبع ولا تُمرَّر في سطر الأوامر.

الاستخدام:
  python3 scripts/deploy_send_fcm_function.py deploy
  python3 scripts/deploy_send_fcm_function.py status
  python3 scripts/deploy_send_fcm_function.py list-secrets
  printf %s "$VALUE" | python3 scripts/deploy_send_fcm_function.py set-secret NAME
  python3 scripts/deploy_send_fcm_function.py delete-secret NAME

بيانات الاعتماد عبر موصّل custom.supabase المسجل (بديل آمن — القيمة
الحقيقية لا تظهر هنا أبداً، نفس نمط supabase_api.py).
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://api.supabase.com"
HOSTS = ["api.supabase.com"]
REF = "qkwdyqocazwhojpyifbv"
SLUG = "send-fcm"
FUNC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "supabase", "functions", SLUG,
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")


def open_req(req, timeout=120):
    add_surrogate_to_request(req, "custom.supabase", allowed_hosts=HOSTS)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return resp.status, {}
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, {"raw": raw[:500]}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body[:1500]}") from None


def call_json(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    return open_req(req)


def deploy():
    files = ["index.ts"]
    boundary = "----muse-deploy-" + uuid.uuid4().hex
    parts = []

    def field(name, value, filename=None, content_type="text/plain"):
        head = f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\""
        if filename:
            head += f"; filename=\"{filename}\""
        head += f"\r\nContent-Type: {content_type}\r\n\r\n"
        parts.append(head.encode())
        parts.append(value if isinstance(value, bytes) else value.encode())
        parts.append(b"\r\n")

    metadata = {
        "name": SLUG,
        "verify_jwt": False,
        "entrypoint_path": "index.ts",
        "import_map_path": None,
    }
    field("metadata", json.dumps(metadata), content_type="application/json")
    # أجزاء الملفات: اسم الحقل «file» مكرراً واسم الملف هو المسار النسبي
    # (الصيغة التي قبلها الخادم فعلياً — تسمية الحقل باسم الملف تُرفض
    # بـ «Entrypoint path does not exist»)
    for name in files:
        with open(os.path.join(FUNC_DIR, name), "rb") as fh:
            field("file", fh.read(), filename=name,
                  content_type="application/octet-stream")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        BASE + f"/v1/projects/{REF}/functions/deploy?slug={SLUG}",
        data=body, method="POST",
    )
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    status, result = open_req(req, timeout=300)
    print(f"deploy HTTP {status}: slug={result.get('slug')} "
          f"version={result.get('version')} status={result.get('status')} "
          f"verify_jwt={result.get('verify_jwt')}")


def status():
    _, result = call_json("GET", f"/v1/projects/{REF}/functions/{SLUG}")
    print(f"slug={result.get('slug')} version={result.get('version')} "
          f"status={result.get('status')} verify_jwt={result.get('verify_jwt')}")


def list_secrets():
    _, result = call_json("GET", f"/v1/projects/{REF}/secrets")
    names = sorted(s.get("name", "") for s in result)
    print("secrets:", ", ".join(names) if names else "(none)")


def set_secret(name):
    value = sys.stdin.read()
    if not value:
        raise SystemExit("secret value must arrive on stdin")
    _, _ = call_json("POST", f"/v1/projects/{REF}/secrets",
                     [{"name": name, "value": value}])
    print(f"secret set: {name} (value never printed)")


def delete_secret(name):
    # نقطة نهاية الحذف تتوقع مصفوفة أسماء في الجسم — صيغة query ‏(?name=)
    # تُرفض بـ 400 ‏«expected array» (اكتُشف حياً في جولة الإكمال).
    _, _ = call_json("DELETE", f"/v1/projects/{REF}/secrets", [name])
    print(f"secret deleted: {name}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "deploy":
        deploy()
    elif cmd == "status":
        status()
    elif cmd == "list-secrets":
        list_secrets()
    elif cmd == "set-secret":
        set_secret(sys.argv[2])
    elif cmd == "delete-secret":
        delete_secret(sys.argv[2])
    else:
        raise SystemExit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
