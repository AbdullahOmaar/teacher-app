import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ANALYTICS } from '../features/analytics/hooks'
import { ATRISK } from '../features/atrisk/hooks'
import { ATT } from '../features/attendance/hooks'
import { TEAM_KEY } from '../features/auth/hooks'
import { EXAMS } from '../features/exams/hooks'
import { GRADES } from '../features/grades/hooks'
import { HOME } from '../features/home/hooks'
import { INV } from '../features/invoices/hooks'
import { MONEY } from '../features/money/hooks'
import { PP } from '../features/payment-proofs/hooks'
import { PORTAL } from '../features/portal/hooks'
import { SCHED } from '../features/schedule/hooks'
import { SETTINGS } from '../features/settings/hooks'
import { SG } from '../features/students/hooks'
import { STUDENT_PORTAL } from '../features/student-portal/hooks'
import { INVALIDATION_SETS, invalidatePrefixes, useInvalidatePrefixes } from './invalidate'

/**
 * PAT-1 (3A-377): اختبارات الإبطال المركزي — كل بادئة تُبطل مفاتيحها
 * ولا تلمس غيرها، وخريطة الطفرات → البادئات مثبتة بالثوابت الحية
 * (حارس انحراف: أي تغيير في ثوابت البادئات أو في الخريطة يكسر
 * الاختبار بدل أن يمرّ بصمت).
 */

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

describe('invalidatePrefixes — الدلالات', () => {
  it('يُبطل مفاتيح البادئات المعطاة ويترك غيرها سليماً', async () => {
    const qc = freshClient()
    qc.setQueryData([ATT, 'day', '2026-11-22'], { ok: true })
    qc.setQueryData([SG, 'list'], [{ id: 's1' }])
    qc.setQueryData([ANALYTICS, 'month'], { total: 1 })
    await invalidatePrefixes(qc, [ATT])
    expect(qc.getQueryState([ATT, 'day', '2026-11-22'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState([SG, 'list'])?.isInvalidated).toBe(false)
    expect(qc.getQueryState([ANALYTICS, 'month'])?.isInvalidated).toBe(false)
  })

  it('قائمة فارغة لا تفعل شيئاً وتُرجع وعداً منتهياً', async () => {
    const qc = freshClient()
    qc.setQueryData([ATT, 'day'], { ok: true })
    await expect(invalidatePrefixes(qc, [])).resolves.toBeUndefined()
    expect(qc.getQueryState([ATT, 'day'])?.isInvalidated).toBe(false)
  })

  it('بادئات متعددة تُبطل كل مفاتيحها دفعة واحدة', async () => {
    const qc = freshClient()
    qc.setQueryData([HOME, 'alerts'], [])
    qc.setQueryData([ATRISK, 'list'], [])
    qc.setQueryData([INV, 'list'], [])
    await invalidatePrefixes(qc, [HOME, ATRISK])
    expect(qc.getQueryState([HOME, 'alerts'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState([ATRISK, 'list'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState([INV, 'list'])?.isInvalidated).toBe(false)
  })
})

describe('useInvalidatePrefixes — الخطاف', () => {
  it('الدالة المرجعة تُبطل بادئات المجموعة فقط', () => {
    const qc = freshClient()
    qc.setQueryData([GRADES, 'list'], [])
    qc.setQueryData([SG, 'list'], [])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useInvalidatePrefixes([GRADES]), { wrapper })
    act(() => {
      result.current()
    })
    expect(qc.getQueryState([GRADES, 'list'])?.isInvalidated).toBe(true)
    expect(qc.getQueryState([SG, 'list'])?.isInvalidated).toBe(false)
  })
})

describe('INVALIDATION_SETS — خريطة الطفرات → البادئات', () => {
  it('كل مجموعة تحتوي بادئة وحدتها نفسها', () => {
    expect(INVALIDATION_SETS.atrisk).toContain(ATRISK)
    expect(INVALIDATION_SETS.attendance).toContain(ATT)
    expect(INVALIDATION_SETS.authTeam).toContain(TEAM_KEY)
    expect(INVALIDATION_SETS.currentTeacher).toContain('current-teacher')
    expect(INVALIDATION_SETS.enrol).toContain('enrol')
    expect(INVALIDATION_SETS.exams).toContain(EXAMS)
    expect(INVALIDATION_SETS.grades).toContain(GRADES)
    expect(INVALIDATION_SETS.groups).toContain(SG)
    expect(INVALIDATION_SETS.invoices).toContain(INV)
    expect(INVALIDATION_SETS.money).toContain(MONEY)
    expect(INVALIDATION_SETS.paymentProofs).toContain(PP)
    expect(INVALIDATION_SETS.portal).toContain(PORTAL)
    expect(INVALIDATION_SETS.schedule).toContain(SCHED)
    expect(INVALIDATION_SETS.settings).toContain(SETTINGS)
    expect(INVALIDATION_SETS.settingsBrand).toContain(SETTINGS)
    expect(INVALIDATION_SETS.studentPortal).toContain(STUDENT_PORTAL)
    expect(INVALIDATION_SETS.students).toContain(SG)
    expect(INVALIDATION_SETS.studentsDelete).toContain(SG)
  })

  it('التغطية المشتقة المثبتة بالقراءة (لا بالتخمين)', () => {
    // الطلاب/التسجيلات تغذي التحليلات والمرعّضين
    expect(INVALIDATION_SETS.students).toEqual(
      expect.arrayContaining([ANALYTICS, ATRISK, ATT]),
    )
    expect(INVALIDATION_SETS.groups).toEqual(
      expect.arrayContaining([ANALYTICS, ATT, ATRISK]),
    ) // المجموعات تغذي عرض المعرّضين (id, name) — بلا 'atrisk' يبقى الاسم القديم
    // الفلوس تغذي التحليلات والمعرّضين (المتأخرات)
    expect(INVALIDATION_SETS.invoices).toEqual(expect.arrayContaining([ANALYTICS, ATRISK]))
    expect(INVALIDATION_SETS.paymentProofs).toEqual(
      expect.arrayContaining([ANALYTICS, ATRISK, INV, MONEY]),
    )
    // الدرجات/الامتحانات تكتب scores فتغذي تنبيهات الرئيسية
    expect(INVALIDATION_SETS.exams).toEqual(expect.arrayContaining([GRADES, HOME]))
    expect(INVALIDATION_SETS.grades).toEqual(expect.arrayContaining([HOME, ANALYTICS]))
    // الجدول يغذي الحضور (الحصص مصدر قوائم الحضور)
    expect(INVALIDATION_SETS.schedule).toEqual(expect.arrayContaining([HOME, ATT]))
    // الحضور يغذي الجدول والتحليلات والمعرّضين والفواتير
    expect(INVALIDATION_SETS.attendance).toEqual(
      expect.arrayContaining([HOME, SCHED, ATRISK, ANALYTICS, INV]),
    )
    // حذف طالب: أوسع مجموعة — cascade على الحضور والدرجات
    expect(INVALIDATION_SETS.studentsDelete).toEqual(
      expect.arrayContaining([ATT, GRADES, ATRISK, ANALYTICS]),
    )
    // رابط الحجز: الاستعلام الوحيد تحت 'enrol' — المجموعة مساوية مثبتة
    expect(INVALIDATION_SETS.enrol).toEqual(['enrol'])
  })

  it('كل مجموعة غير فارغة وبلا تكرار داخلها', () => {
    for (const [name, set] of Object.entries(INVALIDATION_SETS)) {
      expect(set.length, name).toBeGreaterThan(0)
      expect(new Set(set).size, name).toBe(set.length)
      for (const prefix of set) expect(typeof prefix, name).toBe('string')
    }
  })
})
