import { t } from '../i18n'

/**
 * ترجمة أخطاء قاعدة البيانات الخام إلى رسائل عربية واضحة للمستخدم.
 * أهم حالة هنا: انتهاك قيد مفتاح خارجي (Postgres 23503) عند الحذف النهائي —
 * لا يجب أن يصل للمستخدم كخطأ خام أبداً (خطوة 10 من Phase 2).
 */
export function friendlyDbError(error: unknown, fallback: string): Error {
  const code = (error as { code?: string } | null)?.code
  const message = error instanceof Error ? error.message : ''
  if (code === '23503' || /foreign key|violates foreign key/i.test(message)) {
    return new Error(t('common.deleteBlockedByLinks'))
  }
  if (error instanceof Error) return error
  return new Error(fallback)
}

/** نص خطأ آمن للعرض من أي قيمة مرمية (COD-3: كانت 5 نسخ متطابقة في الشيتات) */
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : t('common.unexpectedError')
}
