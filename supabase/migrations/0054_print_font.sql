-- ============================================================================
-- 0054 — خط طباعة المستندات (Phase 2 T12 — 3A-716، بند 4 / ج16-1)
-- ----------------------------------------------------------------------------
-- كل مطبوعات مستر كانت بخط واحد وحيد (IBM Plex Sans Arabic — خط الواجهة
-- نفسه)، ولا خيار للمدرس في شكل مستنداته المطبوعة بهوية سنتره (ورقة
-- الامتحان وتقارير/إيصال PDF). هذه المهاجرة تضيف عموداً اختيارياً واحداً:
--
-- • `teacher_settings.print_font`: مفتاح خط من قائمة مغلقة
--   ('plex' | 'cairo' | 'tajawal' | 'almarai' | 'amiri') أو null =
--   الافتراضي الحالي (plex) — فالغياب لا يغيّر أي سلوك قائم.
-- • القائمة مغلقة بقيد CHECK مطابق لقائمة العميل (src/lib/printFonts.ts)
--   — أي قيمة خارجها تُرفض في الطبقتين، والخطوط نفسها مضمّنة محلياً عبر
--   ‎@fontsource‎ (لا روابط خارجية — قرار الأوفلاين/PWA القائم).
-- • لا جدول جديد ولا سياسات جديدة: العمود على teacher_settings المحكوم
--   أصلاً بسياسات المالك/العضو، ويُقرأ عبر نفس مسارات الإعدادات.
-- • بطاقة الطالب الرقمية مستثناة عمداً من تطبيق الخط (تصميم بطاقة
--   ثابت بتدرّجها — ليست مستنداً): التطبيق على ورقة الامتحان والإيصال.
--
-- ⛔ قاعدة تجميد الفيز (أمر مالك 2026-11-25): هذه المهاجرة تُراجع وتُدمج
-- في الكود فقط — لا تُطبَّق على قاعدة الإنتاج إلا عند تجميد فيز 2 وبعد
-- بوابة QA. حتى تطبيقها تسقط أسطح الطباعة للخط الافتراضي بأمان (قراءة
-- العمود الغائب تُعالج كقيمة null في العميل).
-- ============================================================================

begin;

alter table public.teacher_settings
  add column if not exists print_font text;

alter table public.teacher_settings
  drop constraint if exists teacher_settings_print_font_check;

alter table public.teacher_settings
  add constraint teacher_settings_print_font_check
  check (print_font is null or print_font in ('plex', 'cairo', 'tajawal', 'almarai', 'amiri'));

comment on column public.teacher_settings.print_font is
  'خط طباعة المستندات (مهمة 12 — ج16-1): plex/cairo/tajawal/almarai/amiri أو null = الافتراضي plex';

commit;
