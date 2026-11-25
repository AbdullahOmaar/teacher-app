import { db } from '../../lib/supabase'
import type { PaymentMethod } from '../../types/database'

// ---------------------------------------------------------------------------
// Extract-1 — جهة العميل (Phase 2 T10، بند ج13-1).
//
// يستدعي دالة receipt-extract بهوية المدرّس (invoke يحمل JWT المستدعي)
// ويترجم نتيجتها لحالات صادقة تعرضها شاشة المراجعة:
//
// • ok          — الاستخراج رجع: قيم مقروءة + مقارنتها بالمدّعى. القيم
//                 تُعبّأ في حقول الاعتماد ويبقى القرار للمدرّس وحده.
// • unavailable — الدالة غير منشورة على المنصة بعد (404 بلا مظروفنا) أو
//                 مفتاح إيقاف المنصة مقفول (503): القراءة التلقائية غير
//                 مفعّلة حالياً — وهذا هو الوضع الحقيقي وقت كتابة الكود:
//                 الدالة مبنية ومُحاكاة محلياً لكنها **غير منشورة**،
//                 ونشرها عند بوابة تجميد فيز 2 (قاعدة فصل الإنتاج).
// • no_key      — لا مفتاح BYOK مضبوطاً للمدرّس (422 من الدالة): القراءة
//                 تشتغل بمفتاح المدرّس نفسه فقط، بلا مفاتيح مركزية.
// • failed      — أي فشل آخر (مزود/شبكة/إثبات اتراجع): المراجعة اليدوية
//                 تكمل عادي — الاستخراج مساعدة لا بوابة.
//
// لا ادعاء OCR هنا: العميل لا يقرأ الصورة بنفسه إطلاقاً؛ يعرض ما رجعته
// الدالة كما هو، وأي قيمة غير صالحة الشكل تُصفّى إلى null (لا تخمين).
// ---------------------------------------------------------------------------

export interface ReceiptExtraction {
  amount: number | null
  paid_on: string | null
  method: PaymentMethod | null
  confidence: 'high' | 'medium' | 'low'
}

export interface ExtractComparison {
  amount_match: boolean | null
  method_match: boolean | null
}

export type ExtractRequestResult =
  | { kind: 'ok'; extraction: ReceiptExtraction; comparison: ExtractComparison }
  | { kind: 'unavailable' }
  | { kind: 'no_key' }
  | { kind: 'failed' }

const METHOD_IDS: readonly PaymentMethod[] = ['cash', 'vodafone_cash', 'instapay', 'bank_transfer']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** تصفية دفاعية لرد الدالة: أي حقل شكله غلط يرجع null بدل ما يمر للمدرس كحقيقة */
function sanitizeExtraction(raw: unknown): ReceiptExtraction {
  const out: ReceiptExtraction = { amount: null, paid_on: null, method: null, confidence: 'low' }
  if (!isRecord(raw)) return out
  if (typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0) {
    out.amount = Math.round(raw.amount * 100) / 100
  }
  if (typeof raw.paid_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.paid_on)) {
    out.paid_on = raw.paid_on
  }
  if (typeof raw.method === 'string' && (METHOD_IDS as readonly string[]).includes(raw.method)) {
    out.method = raw.method as PaymentMethod
  }
  if (raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low') {
    out.confidence = raw.confidence
  }
  return out
}

function sanitizeComparison(raw: unknown): ExtractComparison {
  if (!isRecord(raw)) return { amount_match: null, method_match: null }
  return {
    amount_match: typeof raw.amount_match === 'boolean' ? raw.amount_match : null,
    method_match: typeof raw.method_match === 'boolean' ? raw.method_match : null,
  }
}

interface FunctionInvokeError {
  message?: string
  context?: Response
}

/**
 * طلب استخراج واحد لإثبات معلّق. لا يرمي أبداً: كل المصائر حالات معلنة
 * فوق، لأن فشل المساعدة لا يجب أن يكسر شاشة المراجعة المالية.
 */
export async function requestReceiptExtraction(proofId: string): Promise<ExtractRequestResult> {
  const { data, error } = await db().functions.invoke('receipt-extract', {
    body: { proof_id: proofId },
  })
  if (!error) {
    if (!isRecord(data)) return { kind: 'failed' }
    return {
      kind: 'ok',
      extraction: sanitizeExtraction(data.extracted),
      comparison: sanitizeComparison(data.matches_declared),
    }
  }

  const invokeErr = error as FunctionInvokeError
  let status = 0
  let ours = false
  if (invokeErr.context) {
    status = invokeErr.context.status
    try {
      const payload: unknown = await invokeErr.context.clone().json()
      // مظروف أخطائنا الموحد {error:{http_code,message}} يميّز رد دالتنا
      // من رد المنصة نفسها (دالة غير موجودة = 404 بلا مظروفنا)
      ours = isRecord(payload) && isRecord(payload.error) && typeof payload.error.http_code === 'number'
    } catch {
      await invokeErr.context.text().catch(() => '')
    }
  }
  if (status === 503) return { kind: 'unavailable' }
  if (status === 404 && !ours) return { kind: 'unavailable' }
  if (status === 0) return { kind: 'unavailable' }
  if (status === 422) return { kind: 'no_key' }
  return { kind: 'failed' }
}
