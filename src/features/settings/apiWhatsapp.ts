import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { friendlyDbError } from '../../lib/supabaseErrors'
import type { TeacherWhatsappConfigRow } from '../../types/database'

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
  'teacher_id, enabled, phone_number_id, waba_id, template_name, template_language, token_updated_at, last_test_at, created_at, updated_at'

export interface WhatsappConfigInput {
  enabled: boolean
  phone_number_id: string
  waba_id: string
  template_name: string
  template_language: string
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
