import { t } from '../i18n'

/**
 * ترجمة أخطاء قاعدة البيانات الخام إلى رسائل عربية واضحة للمستخدم.
 * أهم حالة هنا: انتهاك قيد مفتاح خارجي (Postgres 23503) عند الحذف النهائي —
 * لا يجب أن يصل للمستخدم كخطأ خام أبداً (خطوة 10 من Phase 2).
 *
 * عند الحفظ (إدراج/تحديث) يمرَّر `fkMessage` فيكون هو رسالة 23503 بدل
 * رسالة الحذف: السجل المرتبط المفقود عند الحفظ خطأ مؤقت يُصلحه تحديث
 * الصفحة، لا حظر أرشفة (3A-377 — PAT-2).
 */
export function friendlyDbError(error: unknown, fallback: string, fkMessage?: string): Error {
  const code = (error as { code?: string } | null)?.code
  const message = error instanceof Error ? error.message : ''
  // تريجر حد الطلاب (0062): رفع 'limit_reached:max_students' عند بلوغ
  // الحد الفعّال — يُترجم لرسالة الترقية العربية بدل الخطأ الخام.
  if (/limit_reached:max_students/i.test(message)) {
    return new Error(t('settings.usageLimitStudentsReached'))
  }
  if (code === '23503' || /foreign key|violates foreign key/i.test(message)) {
    return new Error(fkMessage ?? t('common.deleteBlockedByLinks'))
  }
  if (error instanceof Error) return error
  return new Error(fallback)
}

/** نص خطأ آمن للعرض من أي قيمة مرمية (COD-3: كانت 5 نسخ متطابقة في الشيتات) */
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : t('common.unexpectedError')
}
