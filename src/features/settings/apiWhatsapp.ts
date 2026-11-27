import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { checkUsageLimit } from '../platform-admin/usage'
import type {
  TeacherWhatsappConfigRow,
  TeacherWhatsappTemplateRow,
  WhatsappMessageLogRow,
} from '../../types/database'
import type { WhatsappMessageKind, WhatsappTemplateStatus } from './whatsappTemplates'

// ===========================================================================
// إعدادات واتساب الاختيارية لكل سنتر (الدفعة #7 / 3A-360 — COD-2:
// فُصلت من settings/api.ts بنقل حرفي؛ السطح العام يبقى عبر api.ts).
// ===========================================================================

// ---------------------------------------------------------------------------
// إعدادات واتساب الاختيارية لكل سنتر (migration ‏0026 — نموذج 3A-300
// الاختياري per-teacher، التصميم: WHATSAPP-OTP-DESIGN.md §٧/§٨)
// الحقول هنا غير سرية وتُدار بسياسة مالك فقط. التوكن لا يمر بهذا الملف
// إلا كتابةً: setWhatsappToken يرسله لـ RPC ‏set_teacher_whatsapp_token
// التي تخزّنه في Vault — ولا توجد أي دالة قراءة له في العميل إطلاقاً.
// لاحظ أن token_vault_secret_id غير موجود في قائمة الأعمدة أصلاً:
// العميل يعرف «هل حُفظ توكن ومتى» من token_updated_at فقط.
// ---------------------------------------------------------------------------

const WHATSAPP_CONFIG_COLS =
  'teacher_id, enabled, phone_number_id, waba_id, template_name, template_language, token_updated_at, last_test_at, created_at, updated_at, auto_send_enabled, auto_send_daily_quota'

export interface WhatsappConfigInput {
  enabled: boolean
  phone_number_id: string
  waba_id: string
  template_name: string
  template_language: string
  /** استعداد الإرسال الآلي (0073): opt-in السنتر + حصته اليومية */
  auto_send_enabled: boolean
  auto_send_daily_quota: number
}

/** قراءة إعداد واتساب السنتر (null = لم يُنشأ صف بعد — الميزة غير مهيأة) */
export async function fetchWhatsappConfig(
  teacherId: string,
): Promise<TeacherWhatsappConfigRow | null> {
  const { data, error } = await db()
    .from('teacher_whatsapp_config')
    .select(WHATSAPP_CONFIG_COLS)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/** حفظ الحقول غير السرية (upsert بسياسة المالك) */
export async function upsertWhatsappConfig(
  teacherId: string,
  input: WhatsappConfigInput,
): Promise<TeacherWhatsappConfigRow> {
  const templateName = input.template_name.trim()
  if (!templateName) throw new Error(t('settings.waTemplateNameEmpty'))
  const templateLang = input.template_language.trim()
  if (!templateLang) throw new Error(t('settings.waTemplateLangEmpty'))
  if (input.enabled) {
    // بوابة opt-in صريحة (قرار المالك 2026-11-23): التفعيل لا يُحفَظ
    // صامتاً بلا تهيئة مكتملة — معرّف الرقم + توكن محفوظ شرط، وإلا
    // رفض واضح هنا أيضاً (دفاع في العمق فوق فحص البطاقة التفصيلي).
    if (!input.phone_number_id.trim()) throw new Error(t('settings.waEnableBlocked'))
    const { data: existing } = await db()
      .from('teacher_whatsapp_config')
      .select('token_updated_at')
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (!existing?.token_updated_at) throw new Error(t('settings.waEnableBlocked'))
  }
  const { data, error } = await db()
    .from('teacher_whatsapp_config')
    .upsert(
      {
        teacher_id: teacherId,
        enabled: input.enabled,
        phone_number_id: input.phone_number_id.trim(),
        waba_id: input.waba_id.trim(),
        template_name: templateName,
        template_language: templateLang,
        auto_send_enabled: input.auto_send_enabled,
        // الحصة عدد صحيح موجب دائماً (قيد القاعدة > 0 أيضاً)
        auto_send_daily_quota: Math.max(1, Math.floor(input.auto_send_daily_quota) || 100),
      },
      { onConflict: 'teacher_id' },
    )
    .select(WHATSAPP_CONFIG_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  return data
}

/**
 * كتابة توكن Meta (أو حذفه بقيمة فارغة) — يذهب لـ Vault عبر RPC آمنة
 * بحارس ملكية، ولا يعود منه أي جزء. القيمة تُقصّ هنا ولا تُسجَّل.
 */
export async function setWhatsappToken(teacherId: string, tokenValue: string): Promise<void> {
  const { error } = await db().rpc('set_teacher_whatsapp_token', {
    p_teacher_id: teacherId,
    p_token: tokenValue.trim(),
  })
  if (error) throw error
}

/** شكل خطأ دالة Edge كما يصل من functions.invoke (context = الرد الخام) */
interface FunctionInvokeError {
  message?: string
  context?: Response
}

/**
 * طلب «إرسال كود تجريبي» من دالة send-whatsapp-test: ترسل قالب
 * Authentication لرقم ملف المدرس بأصوله هو. الأخطاء تصل برموز HTTP
 * مميزة من الدالة (503 منصة/422 إعداد/429 معدل/502 ‏Graph) فنترجمها
 * هنا لرسائل واجهة دقيقة بدل رسالة invoke العامة.
 */
export async function sendWhatsappTest(teacherId: string): Promise<void> {
  const { error } = await db().functions.invoke('send-whatsapp-test', {
    body: { teacher_id: teacherId },
  })
  if (!error) return
  const invokeErr = error as FunctionInvokeError
  let status = 0
  if (invokeErr.context) {
    status = invokeErr.context.status
    // استهلاك جسم الرد يمنع تسريب اتصال معلّق في بعض المتصفحات
    await invokeErr.context.text().catch(() => '')
  }
  if (status === 503) throw new Error(t('settings.waTestPlatformDisabled'))
  if (status === 422) throw new Error(t('settings.waTestIncomplete'))
  if (status === 429) throw new Error(t('settings.waTestRateLimited'))
  if (status === 403) throw new Error(t('settings.waTestNotOwner'))
  throw new Error(t('settings.waTestFailed'))
}

// ---------------------------------------------------------------------------
// قوالب رسائل أولياء الأمور وسجل الإرسال (migration ‏0045 — مسار
// الإرسال الكامل في الكود). القوالب تُنشأ عند Meta؛ هنا سجل أسمائها
// وحالاتها عند المدرس فقط. سجل الرسائل قراءة فقط من العميل — كتابته
// لدالتي Edge بالـ service role حصراً (إرسال + Webhook التسليم).
// ---------------------------------------------------------------------------

const WHATSAPP_TEMPLATES_COLS =
  'teacher_id, kind, template_name, language, status, created_at, updated_at'

const WHATSAPP_LOG_COLS =
  'id, teacher_id, kind, template_name, recipient_phone, status, meta_message_id, error_code, error_message, created_at, updated_at, source'

/** سجل قوالب السنتر (صف لكل نوع أُدخل — الغائب يعني «غير محدّد») */
export async function fetchWhatsappTemplates(
  teacherId: string,
): Promise<TeacherWhatsappTemplateRow[]> {
  const { data, error } = await db()
    .from('teacher_whatsapp_templates')
    .select(WHATSAPP_TEMPLATES_COLS)
    .eq('teacher_id', teacherId)
  if (error) throw error
  return data ?? []
}

export interface WhatsappTemplateInput {
  template_name: string
  language: string
  status: WhatsappTemplateStatus
}

/** حفظ اسم/لغة/حالة قالب نوع واحد (upsert بسياسة المالك) */
export async function upsertWhatsappTemplate(
  teacherId: string,
  kind: WhatsappMessageKind,
  input: WhatsappTemplateInput,
): Promise<TeacherWhatsappTemplateRow> {
  const { data, error } = await db()
    .from('teacher_whatsapp_templates')
    .upsert(
      {
        teacher_id: teacherId,
        kind,
        template_name: input.template_name.trim(),
        language: input.language.trim() || 'ar',
        status: input.status,
      },
      { onConflict: 'teacher_id,kind' },
    )
    .select(WHATSAPP_TEMPLATES_COLS)
    .single()
  if (error) throw friendlyDbError(error, t('common.saveError'), t('common.saveBlockedByMissingLink'))
  return data
}

/** أحدث رسائل واتساب للسنتر (الأحدث أولاً) */
export async function fetchWhatsappMessageLog(
  teacherId: string,
  limit = 10,
): Promise<WhatsappMessageLogRow[]> {
  const { data, error } = await db()
    .from('whatsapp_message_log')
    .select(WHATSAPP_LOG_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

/**
 * إرسال رسالة قالب Utility عبر دالة send-whatsapp-message (نفس نمط
 * ترجمة أخطاء sendWhatsappTest: 503 منصة/422 إعداد أو قالب/403 ملكية/
 * 502 ‏Graph). جسم خطأ الدالة يُقرأ لتمييز «القالب غير جاهز» برمزه.
 */
export async function sendWhatsappMessage(
  teacherId: string,
  kind: WhatsappMessageKind,
  toPhone: string,
  params: string[],
): Promise<void> {
  // فحص مسبق ودود لحد رسائل الشهر (0062 — الخطوة 5): عند بلوغ الحد
  // يُرفض برسالة ترقية عربية قبل أي نداء. الدالة غائبة قبل تطبيق
  // 0062 فيُتخطى الفحص (null) — ودالة Edge تحرس خادمياً بعد التطبيق.
  const check = await checkUsageLimit(teacherId, 'max_messages_month')
  if (check && !check.allowed) {
    throw new Error(t('settings.usageLimitMessagesReached'))
  }
  const { error } = await db().functions.invoke('send-whatsapp-message', {
    body: { teacher_id: teacherId, kind, to: toPhone, params },
  })
  if (!error) return
  const invokeErr = error as FunctionInvokeError
  let status = 0
  let responseBody = ''
  if (invokeErr.context) {
    status = invokeErr.context.status
    // استهلاك جسم الرد يمنع تسريب اتصال معلّق في بعض المتصفحات
    responseBody = await invokeErr.context.text().catch(() => '')
  }
  // حد رسائل الشهر من دالة Edge (429 + limit_reached) — نفس رسالة
  // الترقية العربية بدل خطأ الإرسال العام.
  if (status === 429 && responseBody.includes('limit_reached')) {
    throw new Error(t('settings.usageLimitMessagesReached'))
  }
  if (status === 503) throw new Error(t('settings.waMsgTestPlatformDisabled'))
  if (status === 422 && responseBody.includes('template_not_ready')) {
    throw new Error(t('settings.waMsgTestTemplateNotReady'))
  }
  if (status === 422) throw new Error(t('settings.waMsgTestIncomplete'))
  if (status === 403) throw new Error(t('settings.waTestNotOwner'))
  throw new Error(t('settings.waMsgTestFailed'))
}
