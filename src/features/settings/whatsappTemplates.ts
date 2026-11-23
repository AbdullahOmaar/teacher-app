import type { I18nKey } from '../../i18n/dict'

// ===========================================================================
// كتالوج قوالب رسائل واتساب (3A-300 — مسار الإرسال الكامل في الكود،
// migration ‏0045): أنواع إشعارات أولياء الأمور الأربعة وقوالب
// Utility بتاعتها. القوالب نفسها تُنشأ وتُعتمد في حساب Meta بتاع
// المدرس؛ الكتالوج هنا هو تعريف التطبيق: الاسم المقترح، نص الجسم
// المقترح (في القاموس)، ومعاملاته بالترتيب — حتى يعرف المدرس ما
// يبنيه، وتعرف دالة الإرسال ما ترسله. مرآة خادمية لعدد المعاملات
// في supabase/functions/send-whatsapp-message/core.ts (كل دالة Edge
// حزمة مستقلة عند النشر فالتكرار مقصود وموثّق هناك أيضاً).
// ===========================================================================

export type WhatsappMessageKind =
  | 'arrival_notice'
  | 'departure_notice'
  | 'absence_notice'
  | 'invoice_issued'

export type WhatsappTemplateStatus = 'unknown' | 'ready' | 'missing'

export type WhatsappMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export interface WhatsappTemplateDef {
  kind: WhatsappMessageKind
  /** الاسم المقترح للقالب في Meta (بيانات لاتينية — لا نص عرض) */
  defaultName: string
  paramCount: number
  labelKey: I18nKey
  bodyKey: I18nKey
  /** مفاتيح أسماء المعاملات بنفس ترتيب مواضعها في نص الجسم */
  paramLabelKeys: readonly I18nKey[]
  /** مفاتيح قيم تجريبية للإرسال التجريبي — بنفس ترتيب المعاملات */
  paramSampleKeys: readonly I18nKey[]
}

export const WHATSAPP_TEMPLATE_CATALOG: readonly WhatsappTemplateDef[] = [
  {
    kind: 'arrival_notice',
    defaultName: 'arrival_notice',
    paramCount: 2,
    labelKey: 'settings.waMsgKindArrival',
    bodyKey: 'settings.waMsgBodyArrival',
    paramLabelKeys: ['settings.waMsgParamStudent', 'settings.waMsgParamTime'],
    paramSampleKeys: ['settings.waMsgSampleStudent', 'settings.waMsgSampleTime'],
  },
  {
    kind: 'departure_notice',
    defaultName: 'departure_notice',
    paramCount: 2,
    labelKey: 'settings.waMsgKindDeparture',
    bodyKey: 'settings.waMsgBodyDeparture',
    paramLabelKeys: ['settings.waMsgParamStudent', 'settings.waMsgParamTime'],
    paramSampleKeys: ['settings.waMsgSampleStudent', 'settings.waMsgSampleTime'],
  },
  {
    kind: 'absence_notice',
    defaultName: 'absence_notice',
    paramCount: 2,
    labelKey: 'settings.waMsgKindAbsence',
    bodyKey: 'settings.waMsgBodyAbsence',
    paramLabelKeys: ['settings.waMsgParamStudent', 'settings.waMsgParamDate'],
    paramSampleKeys: ['settings.waMsgSampleStudent', 'settings.waMsgSampleDate'],
  },
  {
    kind: 'invoice_issued',
    defaultName: 'invoice_issued',
    paramCount: 2,
    labelKey: 'settings.waMsgKindInvoice',
    bodyKey: 'settings.waMsgBodyInvoice',
    paramLabelKeys: ['settings.waMsgParamAmount', 'settings.waMsgParamStudent'],
    paramSampleKeys: ['settings.waMsgSampleAmount', 'settings.waMsgSampleStudent'],
  },
]

export function templateDef(kind: WhatsappMessageKind): WhatsappTemplateDef {
  const def = WHATSAPP_TEMPLATE_CATALOG.find((d) => d.kind === kind)
  if (!def) throw new Error(`unknown whatsapp kind: ${kind}`)
  return def
}

export function isWhatsappMessageKind(value: string): value is WhatsappMessageKind {
  return WHATSAPP_TEMPLATE_CATALOG.some((d) => d.kind === value)
}

export function isWhatsappTemplateStatus(value: string): value is WhatsappTemplateStatus {
  return value === 'unknown' || value === 'ready' || value === 'missing'
}

export function isWhatsappMessageStatus(value: string): value is WhatsappMessageStatus {
  return (
    value === 'queued' ||
    value === 'sent' ||
    value === 'delivered' ||
    value === 'read' ||
    value === 'failed'
  )
}

/** مفاتيح عرض حالة القالب (سجل المدرس) */
export const TEMPLATE_STATUS_KEYS: Record<WhatsappTemplateStatus, I18nKey> = {
  unknown: 'settings.waMsgStatusUnknown',
  ready: 'settings.waMsgStatusReady',
  missing: 'settings.waMsgStatusMissing',
}

/** مفاتيح عرض حالة الرسالة (سجل الإرسال) */
export const MESSAGE_STATUS_KEYS: Record<WhatsappMessageStatus, I18nKey> = {
  queued: 'settings.waLogStatusQueued',
  sent: 'settings.waLogStatusSent',
  delivered: 'settings.waLogStatusDelivered',
  read: 'settings.waLogStatusRead',
  failed: 'settings.waLogStatusFailed',
}

/** قطع التهيئة التي يطلبها تفعيل القناة (بوابة opt-in الصريحة) */
export type OptInMissingPiece = 'phoneNumberId' | 'token'

export const OPT_IN_PIECE_KEYS: Record<OptInMissingPiece, I18nKey> = {
  phoneNumberId: 'settings.waEnableMissingPhone',
  token: 'settings.waEnableMissingToken',
}

/**
 * ما ينقص لتفعيل القناة فعلاً: معرّف رقم الهاتف + توكن محفوظ.
 * (WABA ID محفوظ للتوثيق ولا تشترطه بوابة الإرسال — نفس شرط مُحلِّل
 * القناة الخادمي في 0026.) قائمة فارغة = التفعيل جاهز للحفظ.
 */
export function missingOptInPieces(input: {
  phoneNumberId: string
  tokenSaved: boolean
}): OptInMissingPiece[] {
  const missing: OptInMissingPiece[] = []
  if (!input.phoneNumberId.trim()) missing.push('phoneNumberId')
  if (!input.tokenSaved) missing.push('token')
  return missing
}
