#!/usr/bin/env python3
"""
فحص Supabase Advisors (أمان + أداء) على المشروع الحي — بوابة مراجعة محلية
(3A-314 — تبنّي أدوات المراجعة الأوبن سورس؛ الـ lints نفسها من مشروع
Splinter الأوبن سورس وتُقرأ عبر Management API بنفس موصّل custom.supabase).

لماذا محلي لا CI؟ نداء الـ Advisors يحتاج توكن Management API، وسياسة هذا
الريبـو الموثقة أن الـ workflows بلا أسرار إطلاقاً — فنمط authz_tests.py
نفسه: بوابة محلية صارمة، وتخطٍّ رشيق معلَن حيث لا موصّل (CI).

الحكم: أي lint بمستوى ERROR = فشل (exit 1). ما عداه يُطبع عددياً مصنفاً —
أغلبه عندنا مقصود بتصميمه وموثق في COMPREHENSIVE-REVIEW-2026-11.md
(أسطح توكنات SECURITY DEFINER محروسة بالهاش داخلياً + دوال مساعدة RLS)،
وقيمة الفحص رحلة-سلكية: أي دالة/جدول جديد يظهر هنا يُدقَّق فوراً.

التشغيل: python3 scripts/supabase_advisors.py [project_ref]
"""
import importlib.util
import os
import sys
from collections import Counter

HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.supabase/bin/supabase_api.py"
)
REF = sys.argv[1] if len(sys.argv) > 1 else "qkwdyqocazwhojpyifbv"


def main() -> int:
    if not os.path.exists(HELPER):
        print("SKIP: موصّل custom.supabase غير متاح في هذه البيئة — لا فحص.")
        return 0
    spec = importlib.util.spec_from_file_location("supabase_api", HELPER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    errors = 0
    for kind in ("security", "performance"):
        res = mod.call("GET", f"/v1/projects/{REF}/advisors/{kind}")
        lints = res.get("lints", [])
        by_name = Counter(lint["name"] for lint in lints)
        by_level = Counter(lint["level"] for lint in lints)
        errors += by_level.get("ERROR", 0)
        print(f"{kind}: {len(lints)} lint(s) — levels {dict(by_level)}")
        for name, count in sorted(by_name.items()):
            print(f"  {name}: {count}")
    if errors:
        print(f"FAIL: {errors} ERROR-level lint(s) — تُراجع فوراً.")
        return 1
    print("OK: لا ERROR — الباقي مصنف وموثق في تقرير المراجعة.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
