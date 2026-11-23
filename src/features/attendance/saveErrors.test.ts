import { describe, expect, it, vi } from 'vitest'
import { t } from '../../i18n'
import { EMPTY_VALUE, saveAttendance, saveAttendanceBatch, type AttendanceValue } from './api'
import { isNetworkFailure } from './offlineQueue'

/**
 * اختبار تركيبي (حاجب-1 في المراجعة اللاحقة للنشر — 3A-377): عقدٌ بين
 * طبقة حفظ الحضور ومصنّف أخطاء الشبكة في قائمة الأوفلاين. عند فشل
 * fetch يرجع supabase-js الخطأ كائناً عادياً لا Error ‏({message:
 * "TypeError: Failed to fetch", code: ""}) — وisNetworkFailure مصممة
 * لهذا الشكل. تحويل الخطأ برسالة friendlyDbError العامة (PAT-2) كان
 * يجرّد الشكل فتُعلَّم عناصر شبكية «فاشلة نهائياً» ولا تُعاد
 * مزامنتها. هذه الاختبارات تثبت أن أخطاء النقل تمرّ كما هي عبر
 * saveAttendance/saveAttendanceBatch، وأن أخطاء القاعدة وحدها
 * تُترجم للرسالة الودّية.
 */

const h = vi.hoisted(() => ({ error: null as unknown }))

vi.mock('../../lib/supabase', () => {
  // سلسلة استعلام وهمية: كل الطرق ترجع السلسلة نفسها، والسلسلة
  // قابلة للانتظار (thenable) فتحلّ بـ { error } المضبوط من الاختبار.
  function makeChain(error: unknown) {
    const result = { error }
    const chain: Record<string, unknown> = {}
    chain.upsert = async () => result
    chain.delete = () => chain
    chain.eq = () => chain
    chain.in = async () => result
    chain.then = (resolve: (v: { error: unknown }) => void) => {
      resolve(result)
    }
    return chain
  }
  return { db: () => ({ from: () => makeChain(h.error) }) }
})

/** شكل خطأ فشل fetch كما يرجعه supabase-js فعلياً: كائن عادي لا Error. */
const FETCH_ERROR = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }

const PRESENT: AttendanceValue = { ...EMPTY_VALUE, status: 'p' }

async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected the promise to reject')
}

describe('عقد حفظ الحضور مع مصنّف أخطاء الشبكة (3A-377)', () => {
  it('saveAttendanceBatch (مسار upsert): خطأ fetch يمرّ كما هو ويبقى شبكياً', async () => {
    h.error = FETCH_ERROR
    const err = await catchErr(
      saveAttendanceBatch('t1', 's1', [{ studentId: 'st1', value: PRESENT }]),
    )
    expect(err).toBe(FETCH_ERROR)
    expect(isNetworkFailure(err)).toBe(true)
  })

  it('saveAttendanceBatch (مسار الحذف الجماعي): خطأ fetch يمرّ كما هو', async () => {
    h.error = FETCH_ERROR
    const err = await catchErr(
      saveAttendanceBatch('t1', 's1', [{ studentId: 'st1', value: EMPTY_VALUE }]),
    )
    expect(err).toBe(FETCH_ERROR)
    expect(isNetworkFailure(err)).toBe(true)
  })

  it('saveAttendance (مسار upsert): خطأ fetch يمرّ كما هو ويبقى شبكياً', async () => {
    h.error = FETCH_ERROR
    const err = await catchErr(saveAttendance('t1', 's1', 'st1', PRESENT))
    expect(err).toBe(FETCH_ERROR)
    expect(isNetworkFailure(err)).toBe(true)
  })

  it('saveAttendance (مسار الحذف): خطأ fetch يمرّ كما هو', async () => {
    h.error = FETCH_ERROR
    const err = await catchErr(saveAttendance('t1', 's1', 'st1', EMPTY_VALUE))
    expect(err).toBe(FETCH_ERROR)
    expect(isNetworkFailure(err)).toBe(true)
  })

  it('خطأ قاعدة (23503) يُترجم للرسالة الودّية ولا يُصنّف شبكياً', async () => {
    h.error = {
      code: '23503',
      message: 'insert or update on table "attendance" violates foreign key constraint',
      details: '',
      hint: '',
    }
    const err = await catchErr(
      saveAttendanceBatch('t1', 's1', [{ studentId: 'st1', value: PRESENT }]),
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(t('common.saveBlockedByMissingLink'))
    expect(isNetworkFailure(err)).toBe(false)
  })
})
