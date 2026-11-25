import { describe, expect, it } from 'vitest'
import { t } from '../i18n'
import { errText, friendlyDbError } from './supabaseErrors'

// فجوة 44 (المهمة 7): مسار العميل عند فشل قاعدة البيانات — الخطأ الخام
// لا يصل للمستخدم أبداً؛ رسالة عربية صادقة بدل شاشة مكسورة أو ابتلاع صامت.
describe('friendlyDbError — ترجمة أخطاء قاعدة البيانات لرسائل صادقة', () => {
  it('انتهاك مفتاح خارجي (23503) عند الحذف = رسالة الحظر العربية لا الخطأ الخام', () => {
    const raw = new Error('update or delete on table "groups" violates foreign key constraint')
    const out = friendlyDbError(Object.assign(raw, { code: '23503' }), 'احتياطي')
    expect(out).toBeInstanceOf(Error)
    expect(out.message).toBe(t('common.deleteBlockedByLinks'))
    expect(out.message).not.toContain('foreign key')
  })

  it('نفس الانتهاك عند الحفظ يستخدم رسالة fkMessage الممررة', () => {
    const out = friendlyDbError({ code: '23503' }, 'احتياطي', 'السجل المرتبط غير موجود — حدّث الصفحة')
    expect(out.message).toBe('السجل المرتبط غير موجود — حدّث الصفحة')
  })

  it('خطأ Error عادي يمرّ كما هو (لا يُبتلع ولا يُستبدل)', () => {
    const raw = new Error('network unreachable')
    expect(friendlyDbError(raw, 'احتياطي')).toBe(raw)
  })

  it('قيمة غير Error (فشل شبكة خام من العميل) تسقط للاحتياطي الموثق', () => {
    expect(friendlyDbError('socket hangup', 'تعذر الاتصال بقاعدة البيانات').message).toBe(
      'تعذر الاتصال بقاعدة البيانات',
    )
    expect(friendlyDbError(null, 'تعذر الاتصال بقاعدة البيانات').message).toBe(
      'تعذر الاتصال بقاعدة البيانات',
    )
  })
})

describe('errText — نص آمن للعرض من أي قيمة مرمية', () => {
  it('Error يرجع رسالته، وغير ذلك رسالة «غير متوقع» المترجمة', () => {
    expect(errText(new Error('رسالة واضحة'))).toBe('رسالة واضحة')
    expect(errText(42)).toBe(t('common.unexpectedError'))
    expect(errText(undefined)).toBe(t('common.unexpectedError'))
  })
})
