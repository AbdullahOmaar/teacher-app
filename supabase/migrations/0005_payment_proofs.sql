-- ============================================================================
-- تطبيق المدرس — 0005_payment_proofs.sql
-- Phase 2 / الخطوة 7: إثبات الدفع (Payment Proofs)
--
-- ولي الأمر يرفع لقطة تحويل (فودافون كاش/إنستاباي/تحويل بنكي) من بوابة
-- ولي الأمر، والمدرس يراجعها: اعتمادها يحوّلها لدفعة حقيقية عبر مسار
-- إنشاء الدفعات القائم نفسه (جدول payments + دالة next_receipt_no)،
-- ورفضها يُحفظ بسببه. هذه الـ migration امتداد فقط: لا تغيير في منطق
-- الفواتير/الدفعات ولا في آلية توكن البوابة القائمة (0001–0003).
--
-- نموذج الأمان:
-- • جدول payment_proofs: RLS بسياسة مالك فقط (teacher_id = auth.uid())
--   مطابقةً لنمط الجداول المالية في 0001 (payments/invoices). لا سياسة
--   للمساعد (مالية)، ولا أي سياسة لـ anon إطلاقاً — ولي الأمر لا يلمس
--   الجدول مباشرة أبداً، وكل وصوله عبر دوال RPC بـ security definer
--   تتحقق من توكن البوابة بنفس آلية 0002/0003 حرفياً (هاش SHA-256،
--   عدم الإلغاء، عدم الانتهاء، ربط الطالب بوليّ صاحب التوكن).
-- • الصور في bucket خاص (private) باسم payment-proofs: حد 5MB وأنواع
--   صور فقط (jpeg/png/webp) يفرضها الـ bucket نفسه على الخادم.
-- • مسار الملف دائماً «<teacher_id>/<proof_id>.<ext>» ويولّده الخادم
--   داخل RPC الإنشاء — العميل لا يختار المسار أبداً.
-- • سياسات storage.objects: ‏anon وauthenticated «إدراج فقط» ومقيّد
--   بدالة payment_proof_upload_allowed التي لا تقبل إلا مسار إثبات
--   pending قائم فعلاً — فلا رفع بلا صف مُنشأ بتوكن صالح أولاً، ولا
--   قراءة/سرد/حذف لـ anon إطلاقاً (لا سياسات لها أصلاً). المالك
--   authenticated يقرأ ويحذف ملفات مجلده فقط (المسار يبدأ بمعرّفه).
-- • حدود معروفة وموثّقة: مسار الإثبات UUID غير قابل للتخمين عملياً،
--   لكن من يملك التوكن الصالح يقدر يرفع فوق مسار إثباته الـ pending
--   مرة أخرى قبل التأكيد (الرفع بـ upsert=false في العميل يمنع ذلك
--   فعلياً لأن الملف موجود). الدالة المساعدة boolean: تكشف فقط «هل
--   يوجد إثبات pending بهذا المسار» لمسارات عشوائية — بلا أي بيانات.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- نوع حالة الإثبات
-- ----------------------------------------------------------------------------
create type payment_proof_status as enum ('pending', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- جدول إثباتات الدفع — ادعاء ولي الأمر ومراجعة المدرس
-- ----------------------------------------------------------------------------
create table public.payment_proofs (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers (id) on delete cascade,
  guardian_id      uuid not null references public.guardians (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  -- الفاتورة اختياري وقت الرفع (البوابة لا تعرض الفواتير)؛ المدرس يربط
  -- الدفعة بفاتورة عند الاعتماد إن لم تُحدَّد هنا
  invoice_id       uuid references public.invoices (id) on delete set null,
  -- المبلغ كما ادّعاه ولي الأمر — الدفعة الفعلية تُنشأ بقرار المدرس
  amount           numeric(12,2) not null check (amount > 0),
  -- إثبات لقطة تحويل: «كاش» بلا معنى هنا ويُرفض من الـ RPC أيضاً
  method           payment_method not null check (method <> 'cash'),
  -- مسار الصورة داخل bucket ‏payment-proofs — يولّده الخادم، فريد دائماً
  storage_path     text not null unique,
  status           payment_proof_status not null default 'pending',
  -- مراجعة المدرس
  rejection_reason text,
  reviewed_by      uuid references auth.users (id),
  reviewed_at      timestamptz,
  -- الدفعة الحقيقية التي أنشأها الاعتماد (نفس جدول payments القائم)
  payment_id       uuid references public.payments (id) on delete set null,
  -- يضبطه RPC التأكيد بعد نجاح رفع الصورة فعلياً؛ الإثباتات بلا
  -- uploaded_at صفوف يتيمة من رفع فاشل ولا تظهر للمدرس أبداً
  uploaded_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index payment_proofs_teacher_status_idx
  on public.payment_proofs (teacher_id, status, created_at);
create index payment_proofs_student_idx
  on public.payment_proofs (student_id, created_at desc);

create trigger payment_proofs_updated_trg before update on public.payment_proofs
  for each row execute function public.set_updated_at();

alter table public.payment_proofs enable row level security;

-- المالك فقط — بلا أي سياسة للمساعد (مالية، كنمط 0001) وبلا anon إطلاقاً
create policy payment_proofs_owner_all on public.payment_proofs
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

commit;

begin;

-- ============================================================================
-- تحقق توكن البوابة — نفس آلية portal_overview_by_token (0002) حرفياً،
-- مُستخرجة في دالة داخلية واحدة حتى لا تتكرر في دوال الإثباتات الأربع.
-- داخلية فقط: تُسحب من الجميع، ولا تُستدعى إلا من دوال security definer
-- أخرى تعمل بصلاحيات مالكها (postgres) فلا تتأثر بالسحب.
-- ============================================================================
create or replace function public.portal_validate_token(p_token text, p_student_id uuid)
returns public.guardian_access_tokens
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
begin
  select * into tok
  from public.guardian_access_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired token';
  end if;

  if tok.student_id is not null and tok.student_id <> p_student_id then
    raise exception 'token not valid for this student';
  end if;

  if not exists (
    select 1 from public.guardian_students gs
    where gs.guardian_id = tok.guardian_id
      and gs.student_id = p_student_id
  ) then
    raise exception 'not authorized';
  end if;

  update public.guardian_access_tokens
  set last_used_at = now()
  where id = tok.id;

  return tok;
end $$;

revoke execute on function public.portal_validate_token(text, uuid) from public, anon, authenticated;

-- ============================================================================
-- بوابة ولي الأمر — دوال إثبات الدفع (security definer، بالتوكن فقط)
-- ============================================================================

-- إنشاء إثبات pending: يتحقق من التوكن والطالب والمبلغ والطريقة وامتداد
-- الصورة، ويولّد المسار المتوقع للرفع. لا يكتب أي ملف — الرفع نفسه
-- خطوة العميل التالية إلى Storage، مقيّدة بسياسة الإدراج أدناه.
create or replace function public.portal_create_payment_proof(
  p_token text,
  p_student_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_file_ext text,
  p_invoice_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
  v_teacher_id uuid;
  v_ext text;
  v_proof_id uuid := gen_random_uuid();
  v_path text;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid amount';
  end if;

  if p_method = 'cash' then
    raise exception 'invalid method for proof';
  end if;

  v_ext := lower(trim(coalesce(p_file_ext, '')));
  if v_ext = 'jpeg' then
    v_ext := 'jpg';
  end if;
  if v_ext not in ('jpg', 'png', 'webp') then
    raise exception 'invalid file type';
  end if;

  select teacher_id into v_teacher_id
  from public.students
  where id = p_student_id;

  if v_teacher_id is null or v_teacher_id <> tok.teacher_id then
    raise exception 'not authorized';
  end if;

  if p_invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = p_invoice_id
      and i.teacher_id = tok.teacher_id
      and i.student_id = p_student_id
  ) then
    raise exception 'invoice not valid for this student';
  end if;

  -- حد مضاد للإغراق: إثباتات معلّقة كثيرة لنفس الطالب بلا فائدة مشروعة
  if (select count(*) from public.payment_proofs
      where student_id = p_student_id and status = 'pending') >= 10 then
    raise exception 'too many pending proofs';
  end if;

  v_path := tok.teacher_id::text || '/' || v_proof_id::text || '.' || v_ext;

  insert into public.payment_proofs (
    id, teacher_id, guardian_id, student_id, invoice_id,
    amount, method, storage_path
  ) values (
    v_proof_id, tok.teacher_id, tok.guardian_id, p_student_id, p_invoice_id,
    p_amount, p_method, v_path
  );

  return jsonb_build_object(
    'proof_id', v_proof_id,
    'storage_path', v_path,
    'bucket', 'payment-proofs'
  );
end $$;

-- تأكيد اكتمال الرفع: بعد أن يرفع العميل الصورة بنجاح إلى Storage.
-- بدونه يبقى الإثبات غير مرئي للمدرس (صف يتيم من رفع فاشل/منقطع).
create or replace function public.portal_confirm_payment_proof(
  p_token text,
  p_proof_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  proof public.payment_proofs;
  tok public.guardian_access_tokens;
begin
  select * into proof from public.payment_proofs where id = p_proof_id;
  if not found then
    raise exception 'proof not found';
  end if;

  tok := public.portal_validate_token(p_token, proof.student_id);

  if proof.guardian_id <> tok.guardian_id then
    raise exception 'not authorized';
  end if;

  if proof.status <> 'pending' then
    raise exception 'proof already reviewed';
  end if;

  update public.payment_proofs
  set uploaded_at = coalesce(uploaded_at, now())
  where id = p_proof_id;

  return jsonb_build_object('proof_id', p_proof_id, 'confirmed', true);
end $$;

-- حذف إثبات pending لم يكتمل رفعه — يستدعيه العميل عند فشل خطوة الرفع
-- حتى لا تتراكم صفوف يتيمة. حذف الصف لا يحذف ملفاً قد يكون رُفع فعلاً
-- (لا حذف لـ anon في Storage)؛ أي ملف يتيم يبقى داخل مجلد المدرس نفسه
-- بلا أي وصول خارجي، والمدرس يقدر يحذفه بسياسة المالك.
create or replace function public.portal_delete_payment_proof(
  p_token text,
  p_proof_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  proof public.payment_proofs;
  tok public.guardian_access_tokens;
begin
  select * into proof from public.payment_proofs where id = p_proof_id;
  if not found then
    raise exception 'proof not found';
  end if;

  tok := public.portal_validate_token(p_token, proof.student_id);

  if proof.guardian_id <> tok.guardian_id then
    raise exception 'not authorized';
  end if;

  if proof.status <> 'pending' then
    raise exception 'proof already reviewed';
  end if;

  delete from public.payment_proofs where id = p_proof_id;

  return jsonb_build_object('proof_id', p_proof_id, 'deleted', true);
end $$;

-- إثباتات ولي الأمر نفسه لطالب واحد — المرفوعة فعلياً فقط (uploaded_at)،
-- بحقول العرض المحدودة: لا مسارات ملفات ولا معرّفات داخلية غير لازمة.
create or replace function public.portal_list_payment_proofs(
  p_token text,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.guardian_access_tokens;
begin
  tok := public.portal_validate_token(p_token, p_student_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pp.id,
      'amount', pp.amount,
      'method', pp.method,
      'status', pp.status,
      'rejection_reason', pp.rejection_reason,
      'created_at', pp.created_at,
      'reviewed_at', pp.reviewed_at
    ) order by pp.created_at desc)
    from public.payment_proofs pp
    where pp.student_id = p_student_id
      and pp.guardian_id = tok.guardian_id
      and pp.uploaded_at is not null
  ), '[]'::jsonb);
end $$;

-- دوال البوابة العامة: تنفيذ لـ anon (بالأنون key + التوكن داخل الدالة)
-- ولـ authenticated احتياطاً (ولي أمر يفتح الرابط وهو مسجل دخول كمدرس
-- في نفس المتصفح يجب أن يعمل بنفس الطريق).
grant execute on function public.portal_create_payment_proof(text, uuid, numeric, payment_method, text, uuid) to anon, authenticated;
grant execute on function public.portal_confirm_payment_proof(text, uuid) to anon, authenticated;
grant execute on function public.portal_delete_payment_proof(text, uuid) to anon, authenticated;
grant execute on function public.portal_list_payment_proofs(text, uuid) to anon, authenticated;

commit;

begin;

-- ============================================================================
-- Storage — bucket خاص لإثباتات الدفع + سياسات storage.objects
-- ============================================================================

-- هل المسار مسار إثبات pending قائم؟ بوابة سياسة إدراج Storage الوحيدة.
-- security definer لأن anon لا يملك أي وصول لجدول payment_proofs نفسه.
create or replace function public.payment_proof_upload_allowed(p_path text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payment_proofs
    where storage_path = p_path and status = 'pending'
  );
$$;

revoke execute on function public.payment_proof_upload_allowed(text) from public;
grant execute on function public.payment_proof_upload_allowed(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- إدراج فقط، لمسارات إثباتات pending قائمة حصراً — لا قراءة ولا سرد
-- ولا تحديث ولا حذف لـ anon/authenticated من هنا إطلاقاً
create policy payment_proofs_upload_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.payment_proof_upload_allowed(name)
  );

-- المالك يقرأ ملفات إثباتاته (المسار يبدأ بمعرّفه) — للعرض برابط موقّع
create policy payment_proofs_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- المالك يحذف ملفات إثباتاته (تنظيف/خصوصية) — لا تحديث ولا إدراج له
create policy payment_proofs_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and split_part(name, '/', 1) = auth.uid()::text
  );

commit;

-- ============================================================================
-- نهاية 0005 — جدول جديد: payment_proofs | bucket: payment-proofs (private)
-- دوال: portal_validate_token (داخلية) + 4 دوال بوابة + payment_proof_upload_allowed
-- سياسات: payment_proofs مالك فقط (1) + storage.objects ‏(3)
-- ============================================================================
