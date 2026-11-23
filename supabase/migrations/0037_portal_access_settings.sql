-- ===========================================================================
-- 0037 — إعدادات وصول البوابات بيد المدرس (3A-385 — قرار مالك 2026-11-22
-- 22:11، ملاحظة ٤): مدة رابط البوابة + صلاحيات عرض أقسام البوابتين.
--
-- • portal_link_ttl_days: مدة صلاحية روابط البوابة (ولي الأمر والطالب
--   معاً) بالأيام — يضبطها المدرس، افتراضيها 30 وهو القرار المعتمد عند
--   الإطلاق فلا يتغير سلوك أي مدرس قائم. التوكنات القائمة لا تُلمس:
--   expires_at المحفوظ عليها يبقى كما هو (توافق خلفي كامل).
-- • أعلام أقسام العرض: كلها default true = السلوك الحالي حرفياً (كل
--   قسم ظاهر اليوم يبقى ظاهراً) — الإخفاء اختيار صريح لاحق من المدرس.
--   الفرض خادمي: دالتا بناء العرض (0038) تُصفّيان الأقسام المخفية فلا
--   تُرسل بياناتها أصلاً، ودوال الإثباتات/التنبيهات/Push (0039) ترفض
--   محاورها المخفية.
-- أعمدة فقط على جدول قائم — لا جداول ولا سياسات جديدة.
-- ===========================================================================

alter table public.teacher_settings
  add column portal_link_ttl_days int not null default 30;

alter table public.teacher_settings
  add constraint teacher_settings_portal_link_ttl_days_range
  check (portal_link_ttl_days between 1 and 365);

-- أقسام بوابة ولي الأمر
alter table public.teacher_settings
  add column portal_guardian_show_attendance boolean not null default true;

alter table public.teacher_settings
  add column portal_guardian_show_scores boolean not null default true;

alter table public.teacher_settings
  add column portal_guardian_show_notes boolean not null default true;

alter table public.teacher_settings
  add column portal_guardian_show_money boolean not null default true;

alter table public.teacher_settings
  add column portal_guardian_show_groups boolean not null default true;

-- أقسام بوابة الطالب
alter table public.teacher_settings
  add column portal_student_show_schedule boolean not null default true;

alter table public.teacher_settings
  add column portal_student_show_homework boolean not null default true;

alter table public.teacher_settings
  add column portal_student_show_grades boolean not null default true;

alter table public.teacher_settings
  add column portal_student_show_money boolean not null default true;
