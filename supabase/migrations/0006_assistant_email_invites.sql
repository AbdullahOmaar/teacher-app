-- ============================================================================
-- تطبيق المدرس — 0006_assistant_email_invites.sql
-- Phase 2 / الخطوة 8: دعوة المساعد بالبريد الإلكتروني (invited_email + claim)
--
-- قيد Phase 1 الذي تحلّه هذه الـ migration: جدول teacher_members في 0001
-- بلا عمود بريد، وuser_id إلزامي بمفتاح خارجي إلى auth.users — فكانت
-- الدعوة بالبريد وحده مستحيلة، والمنفّذ عملياً هو «المساعد يشارك معرّف
-- حسابه والمدرس يضيفه فتُنشأ العضوية active مباشرة». هذه الـ migration
-- تضيف مسار الدعوة بالبريد دون كسر ذلك التدفق ولا أي عضوية قائمة:
--
-- 1) عمود invited_email من نوع text مُطبَّع (lower-normalized):
--    اخترنا text + تطبيع بدل citext لأن إضافة citext غير مثبّتة على
--    المشروع، وإضافتها مخاطرة بلا داعٍ — التطبيع مفروض هنا بقيد CHECK
--    (القيمة = lower(btrim(value)) دائماً) وبالتطبيع في العميل ودالة
--    الادعاء معاً، فالمقارنة حسّاسة لحالة الأحرف شكلياً لكن كل القيم
--    المخزنة والمقارَن بها مُخفَّضة أصلاً، والنتيجة العملية مطابقة
--    لـ citext.
-- 2) user_id يصبح قابلاً للقيم الخالية: صف «دعوة معلّقة» = user_id خالٍ
--    + invited_email موجود + status = 'invited' حصراً (قيدا شكل أدناه).
--    القيد الفريد القائم (teacher_id, user_id) لا يتأثر: Postgres يعتبر
--    كل NULL مختلفة عن الأخرى، فالصفوف المعلّقة لا تتصادم عليه أبداً،
--    ويظل يمنع عضويتين مربوطتين لنفس المستخدم عند نفس المدرس.
-- 3) قيد فريد جزئي: دعوة معلّقة واحدة فقط لكل (teacher_id, invited_email)
--    — دعوة مكررة لنفس البريد تُرفض من القاعدة نفسها (23505).
-- 4) دالة claim_teacher_invites() بـ security definer: المستخدم المسجّل
--    يدّعي دعواته المعلّقة بمطابقة بريده من JWT ‏(auth.jwt()->>'email'
--    مُخفَّضاً) — لا تقبل أي بريد كمعامل، فلا أحد يدّعي دعوة غيره.
--    الادعاء يربط user_id ويُفعّل العضوية (status='active')، وهو آمن
--    التكرار (idempotent): دعوة مربوطة أصلاً لا تُلمس، واستدعاء ثانٍ
--    يعيد صفراً. دعوة لمدرس المستخدم عضو فيه أصلاً (أو هو المدرس نفسه)
--    تُحذف كفائض بدل كسر القيد الفريد.
-- 5) RLS: لا سياسات جديدة لازمة — تحقّقنا من القائم في 0001:
--    • members_owner_all ‏(teacher_id = auth.uid()) تغطي إنشاء المدرس
--      لدعواته وعرضها وإلغاءها (حذف الصف) كما هي.
--    • members_self_select تشترط user_id = auth.uid()، فالدعوة المعلّقة
--      (user_id خالٍ) غير مرئية للمدعوّ قبل الادعاء ولا لأي مستخدم آخر.
--    • is_teacher_member / member_has_permission تشترطان
--      user_id = auth.uid() وstatus = 'active' معاً — فالدعوة المعلّقة
--      لا تمنح أي وصول لأي جدول قبل ادعائها، بلا أي تعديل عليهما.
--    • الادعاء نفسه يمر عبر الدالة security definer فقط (تنفيذ
--      لـ authenticated حصراً)، لا عبر سياسة كتابة للمدعوّ.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- العمود الجديد + تخفيف قيد user_id + قيود الشكل والتنسيق
-- ----------------------------------------------------------------------------

alter table public.teacher_members
  add column invited_email text;

alter table public.teacher_members
  alter column user_id drop not null;

-- البريد المخزن مُطبَّع دائماً (أحرف صغيرة بلا مسافات طرفية) وبصيغة بريد
alter table public.teacher_members
  add constraint teacher_members_invited_email_format check (
    invited_email is null
    or (
      invited_email = lower(btrim(invited_email))
      and invited_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )
  );

-- كل صف له هوية: إما مستخدم مربوط، أو بريد مدعوّ — لا صفوف مجهولة
alter table public.teacher_members
  add constraint teacher_members_identity_present check (
    user_id is not null or invited_email is not null
  );

-- الصف بلا مستخدم هو دعوة معلّقة حصراً — لا عضوية «فعّالة» بلا صاحب
alter table public.teacher_members
  add constraint teacher_members_pending_shape check (
    user_id is not null or status = 'invited'
  );

-- دعوة معلّقة واحدة لكل (مدرس، بريد) — يمنع الدعوات المكررة قاعدياً
create unique index teacher_members_pending_invite_unique
  on public.teacher_members (teacher_id, invited_email)
  where user_id is null and status = 'invited' and invited_email is not null;

-- فهرس بحث الادعاء: الدعوات المعلّقة ببريد معيّن
create index teacher_members_invited_email_idx
  on public.teacher_members (invited_email)
  where user_id is null and status = 'invited';

commit;

begin;

-- ----------------------------------------------------------------------------
-- ادعاء الدعوات المعلّقة — للمستخدم المسجّل الحالي وببريده هو فقط
-- ----------------------------------------------------------------------------

create or replace function public.claim_teacher_invites()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_claimed int := 0;
  v_skipped int := 0;
  v_teacher_ids uuid[] := '{}';
  r record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- بلا بريد في الجلسة لا شيء يُدّعى (لا نثق بأي معامل خارجي أصلاً)
  if v_email = '' then
    return jsonb_build_object(
      'claimed', 0,
      'skipped_duplicates', 0,
      'teacher_ids', '[]'::jsonb
    );
  end if;

  for r in
    select id, teacher_id
    from public.teacher_members
    where invited_email = v_email
      and user_id is null
      and status = 'invited'
    order by created_at
    for update
  loop
    -- المدرس نفسه أو عضو قائم عند هذا المدرس: الدعوة فائضة، تُحذف
    -- بدل محاولة ربط تكسر القيد الفريد (teacher_id, user_id)
    if r.teacher_id = v_uid
       or exists (
         select 1 from public.teacher_members
         where teacher_id = r.teacher_id and user_id = v_uid
       ) then
      delete from public.teacher_members where id = r.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      update public.teacher_members
      set user_id = v_uid,
          status = 'active',
          updated_at = now()
      where id = r.id
        and user_id is null
        and status = 'invited';
      if found then
        v_claimed := v_claimed + 1;
        v_teacher_ids := array_append(v_teacher_ids, r.teacher_id);
      end if;
    exception
      when unique_violation then
        -- سباق نادر: جلسة أخرى لنفس المستخدم ربطت عضوية عند هذا
        -- المدرس أثناء الادعاء — الدعوة فائضة وتُحذف
        delete from public.teacher_members where id = r.id;
        v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'claimed', v_claimed,
    'skipped_duplicates', v_skipped,
    'teacher_ids', to_jsonb(v_teacher_ids)
  );
end $$;

-- تنفيذ للمستخدمين المسجّلين فقط — anon لا يدّعي شيئاً أبداً
revoke execute on function public.claim_teacher_invites() from public, anon;
grant execute on function public.claim_teacher_invites() to authenticated;

commit;

-- ============================================================================
-- نهاية 0006 — teacher_members: ‏+invited_email (text مُطبَّع)، user_id خالٍ
-- مسموح لصفوف الدعوات، 3 قيود CHECK، قيد فريد جزئي + فهرس بحث، ودالة
-- claim_teacher_invites (security definer، authenticated فقط).
-- لا تغيير في أي سياسة RLS ولا في الدوال المساعدة — القائم في 0001 آمن
-- كما هو تجاه الصفوف المعلّقة (انظر التمهيد).
-- ============================================================================
