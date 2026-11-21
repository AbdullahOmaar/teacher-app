import { db } from '../../lib/supabase'
import type { PaymentProofRow } from '../../types/database'
import { todayStr } from '../home/api'
import { createPayment, voidPayment, PAYMENT_METHOD_LABELS } from '../invoices/api'
import { logActivity } from '../activity/api'

// ---------------------------------------------------------------------------
// إثباتات الدفع — Phase 2 خطوة 7 (migration ‏0005).
//
// جهة المدرس (جلسة مصادقة): قراءة/مراجعة إثباتات مدرسه فقط — سياسة
// RLS ‏payment_proofs_owner_all (مالية: مالك فقط، بلا مساعد وبلا anon).
// الصورة تُعرض برابط موقّع قصير من bucket خاص، والمسار دائماً
// «<teacher_id>/<proof_id>.<ext>» كما ولّده RPC الإنشاء في البوابة.
//
// الاعتماد يعيد استخدام مسار إنشاء الدفعات القائم نفسه حرفياً:
// createPayment من وحدة الفواتير (نفس جدول payments، نفس ترقيم
// next_receipt_no الذرّي، ونفس إبطالات الكاش في الهوكس)، وبنفس دالة
// التعويض عند الفشل الجزئي: voidPayment (دفعة عكسية) — لا نسخة موازية
// من منطق الدفع هنا إطلاقاً.
//
// حماية من المعالجة المزدوجة: الاعتماد «يحجز» الإثبات أولاً بتحديث
// مشروط (status='pending' وreviewed_at ما زال null) فيضبط reviewed_by/at؛
// أي محاولة ثانية (تبويب آخر/نقر مزدوج) لا تجد صفاً للحجز فتُرفض قبل
// إنشاء أي دفعة. إن فشل إنشاء الدفعة يُحرَّر الحجز ليبقى الإثبات
// قابلاً للمحاولة، وإن فشل الربط النهائي بعد إنشاء الدفعة تُعكَس
// الدفعة بـ voidPayment ويُحرَّر الحجز — فلا دفعة يتيمة ولا إثبات
// معتمد بلا دفعة. الرفض تحديث مشروط واحد ذرّي (لا أثر خارجي له).
// ---------------------------------------------------------------------------

export const PROOF_BUCKET = 'payment-proofs'

const PROOF_COLS =
  'id, teacher_id, guardian_id, student_id, invoice_id, amount, method, storage_path, status, rejection_reason, reviewed_by, reviewed_at, payment_id, uploaded_at, created_at, updated_at'

export interface PendingProofItem extends PaymentProofRow {
  student_name: string
  student_code: string
}

interface ProofJoinRow extends PaymentProofRow {
  students: { name?: string; public_code?: string } | null
}

/**
 * إثباتات معلّقة مكتملة الرفع فقط (uploaded_at موجود): الصفوف اليتيمة
 * من رفع منقطع في البوابة لا تصل للمدرس أبداً. الأقدم أولاً — طابور مراجعة.
 */
export async function fetchPendingProofs(teacherId: string): Promise<PendingProofItem[]> {
  const { data, error } = await db()
    .from('payment_proofs')
    .select(`${PROOF_COLS}, students(name, public_code)`)
    .eq('teacher_id', teacherId)
    .eq('status', 'pending')
    .not('uploaded_at', 'is', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as ProofJoinRow[]).map((r) => ({
    ...r,
    amount: Number(r.amount) || 0,
    student_name: r.students?.name ?? '—',
    student_code: r.students?.public_code ?? '',
  }))
}

/** رابط موقّع قصير لعرض صورة الإثبات بجلسة المدرس (bucket خاص) */
export async function fetchProofImageUrl(storagePath: string): Promise<string> {
  const { data, error } = await db().storage.from(PROOF_BUCKET).createSignedUrl(storagePath, 600)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('ماقدرناش نجهز رابط صورة الإثبات')
  return data.signedUrl
}

const ALREADY_PROCESSED = 'الإثبات ده اتراجع خلاص — حدّث القائمة وحاول تاني لو محتاج'

/** حجز الإثبات للمراجعة (يمنع أي معالجة متوازية) — false إن كان محجوزاً/معالَجاً */
async function claimProof(
  teacherId: string,
  reviewerId: string,
  proofId: string,
): Promise<boolean> {
  const { data, error } = await db()
    .from('payment_proofs')
    .update({ reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('id', proofId)
    .eq('status', 'pending')
    .is('reviewed_at', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

/** تحرير حجز لم تكتمل معالجته — يرجع الإثبات لقائمة الانتظار كما كان */
async function releaseClaim(teacherId: string, reviewerId: string, proofId: string): Promise<void> {
  await db()
    .from('payment_proofs')
    .update({ reviewed_by: null, reviewed_at: null })
    .eq('teacher_id', teacherId)
    .eq('id', proofId)
    .eq('status', 'pending')
    .eq('reviewed_by', reviewerId)
}

export interface ApproveProofInput {
  /** الفاتورة التي ستُسجَّل عليها الدفعة (payments.invoice_id إلزامي في المخطط) */
  invoiceId: string
  /** المبلغ المعتمد نهائياً — يبدأ من المدّعى ويقدر المدرس يعدّله قبل الاعتماد */
  amount: number
}

/**
 * اعتماد إثبات: حجز → دفعة حقيقية عبر createPayment القائمة (بنفس
 * الطريقة المدّعاة وتاريخ اليوم) → ربط payment_id وحالة approved.
 * أي فشل بعد إنشاء الدفعة يُعوَّض بعكسها بـ voidPayment القائمة.
 */
export async function approveProof(
  teacherId: string,
  reviewerId: string,
  proof: PaymentProofRow,
  input: ApproveProofInput,
): Promise<{ paymentId: string; receiptNo: string }> {
  if (!(input.amount > 0)) throw new Error('مبلغ الاعتماد لازم يكون أكبر من صفر')

  const claimed = await claimProof(teacherId, reviewerId, proof.id)
  if (!claimed) throw new Error(ALREADY_PROCESSED)

  let payment: Awaited<ReturnType<typeof createPayment>> | null = null
  try {
    payment = await createPayment(teacherId, input.invoiceId, {
      amount: input.amount,
      method: proof.method,
      paid_on: todayStr(),
    })

    const { data, error } = await db()
      .from('payment_proofs')
      .update({ status: 'approved', payment_id: payment.id })
      .eq('teacher_id', teacherId)
      .eq('id', proof.id)
      .eq('status', 'pending')
      .select('id')
    if (error) throw error
    if ((data ?? []).length === 0) throw new Error(ALREADY_PROCESSED)

    // سجل النشاط: اعتماد الإثبات (الدفعة الناتجة سجّلت حدثها من createPayment)
    void logActivity(teacherId, {
      event_type: 'proof_approved',
      entity_type: 'payment_proof',
      entity_id: proof.id,
      entity_label: (proof as PendingProofItem).student_name ?? null,
      details: {
        amount: input.amount,
        method: proof.method,
        method_label: PAYMENT_METHOD_LABELS[proof.method] ?? proof.method,
        receipt_no: payment.receipt_no,
        payment_id: payment.id,
        invoice_id: input.invoiceId,
      },
    })

    return { paymentId: payment.id, receiptNo: payment.receipt_no }
  } catch (e) {
    // تعويض: دفعة اتعملت ومفيش إثبات معتمد مربوط بيها = تُعكس فوراً
    if (payment) {
      try {
        await voidPayment(teacherId, payment)
      } catch {
        // العكس نفسه فشل: الدفعة باقية في دفتر payments وقابلة للعكس
        // يدوياً من تفاصيل الفاتورة — لا نخفي الخطأ الأصلي
      }
    }
    await releaseClaim(teacherId, reviewerId, proof.id).catch(() => {})
    throw e
  }
}

/** رفض إثبات: تحديث مشروط واحد — سبب الرفض اختياري ويصل لولي الأمر في البوابة */
export async function rejectProof(
  teacherId: string,
  reviewerId: string,
  proofId: string,
  reason: string | null,
): Promise<void> {
  const { data, error } = await db()
    .from('payment_proofs')
    .update({
      status: 'rejected',
      rejection_reason: reason?.trim() ? reason.trim() : null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('teacher_id', teacherId)
    .eq('id', proofId)
    .eq('status', 'pending')
    .is('reviewed_at', null)
    .select('id')
  if (error) throw error
  if ((data ?? []).length === 0) throw new Error(ALREADY_PROCESSED)
  // سجل النشاط: رفض الإثبات بسبب اختياري يظهر في التفاصيل
  void logActivity(teacherId, {
    event_type: 'proof_rejected',
    entity_type: 'payment_proof',
    entity_id: proofId,
    details: reason?.trim() ? { reason: reason.trim() } : {},
  })
}
