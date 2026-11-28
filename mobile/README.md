# Mister Mobile — تطبيق موبايل مستر (Flutter)

> **المكان:** `teacher-app/mobile/` — مونوريبو لمنتج واحد بقرار مالك
> 2026-11-28 ~05:43 (العقود والمرجع والكود في ريبو واحد). الريبو
> المنفصل القديم mister-mobile يُحذف بعد دمج النقل — لا دفع عليه.
> بوابة فلاتر في CI: `.github/workflows/flutter-check.yml` (تعمل على
> تغيّرات mobile/** فقط)؛ وCI الويب يتجاهل mobile/**، و`.vercelignore`
> يستبعد mobile/ من نشر الويب تمامًا.

> فيز 1 (الأساسيات والقلب) — تبدأ فورًا على مشروع Supabase **الديمو**
> بأمر مالك 2026-11-28 ~03:44. فيز 2 تكمل ورا إطلاق البرودكشن.
> الخطة الكاملة: `~/workspace/goals/teacher-admin-app/files/FLUTTER-APP-PLAN.md`
> (الملحق أ اعتماد + الملحق ب فيزتان/16 مهمة).
> العقود الملزمة: `FLUTTER-CONTRACTS-v1.md` (v1.1 حاليًا) — أي تغيير
> في العقد = نسخة جديدة + تنبيه مباشر لشات الخط ب.

## البنية (الملحق أ A1–A8)

```
lib/
  main.dart                    # دخول + سبلاش (سطر إصدار من بيانات البناء)
  app_build_info.dart          # version + builtAt من --dart-define
  core/
    error/app_error.dart       # AppError + UiState<T> (عقود §5/§6)
    data/services.dart         # SupabaseService / LocalStorage / SecureStorage / Connectivity
    router/app_router.dart     # go_router — جدول مسارات عقود §6
  features/<module>/{data,domain,ui}/
    auth home students groups schedule attendance
  l10n/                        # app_ar.arb (القالب) + app_en.arb — يُولَّد منها AppLocalizations
```

- **خط أ** (هذا الشات): المعمارية/البيانات/الدخول/الأمان/الأوفلاين/FCM + مالك العقود.
- **خط ب** (شات «فلاتر تنفيذ ٢»): القشرة/الثيم/الترجمة/المكونات/هياكل الشاشات.

## التشغيل

```bash
flutter pub get
# الديمو فقط في فيز 1 — القيم من .env (لا تُسلَّم للريبو):
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR-DEMO-PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR-DEMO-PUBLISHABLE-KEY
```

## بوابة الفحص (حمراء = لا دمج)

```bash
./scripts/check.sh   # pub get + gen-l10n + ARB parity + analyze + test
```

## قواعد ثابتة

- لا أسرار في الكود أو التاريخ (المفتاح القابل للنشر فقط، عبر dart-define).
- لا نداء Supabase من View/ViewModel — من الريبو فقط.
- لا رسالة خام من الخادم للواجهة — كل خطأ بمفتاح ARB (عقود §5).
- مالية أونلاين فقط؛ أوفلاين حضور فقط (LWW + upsert + ‏MAX_ATTEMPTS=3).
- سطر الإصدار «الإصدار X — نُشر [date]» من بيانات البناء في السبلاش والإعدادات.
