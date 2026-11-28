import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { studentPortalAttMeta } from './api'

// حسم ميتا حضور بوابة الطالب (3A-928): لا قيمة من الخادم — معروفة أو
// غريبة أو فارغة أو غير نصية — تُسقط البوابة بكراش قراءة badge.
const FALLBACK_BADGE = 'bg-soft text-muted border-border'

describe('studentPortalAttMeta (3A-928)', () => {
  it('الحالات الأربع المعروفة ترجع ميتاها', () => {
    expect(studentPortalAttMeta('p').label).toBe(t('studentPortal.apiAttPresent'))
    expect(studentPortalAttMeta('a').label).toBe(t('studentPortal.apiAttAbsent'))
    expect(studentPortalAttMeta('l').label).toBe(t('studentPortal.apiAttLate'))
    expect(studentPortalAttMeta('m').label).toBe(t('studentPortal.apiAttMakeup'))
  })

  it('حالة غير معروفة أو فارغة تتحل لشارة محايدة ولا ترمي', () => {
    expect(studentPortalAttMeta('x')).toEqual({
      label: t('studentPortal.apiAttFallback'),
      badge: FALLBACK_BADGE,
    })
    expect(studentPortalAttMeta('')).toEqual({
      label: t('studentPortal.apiAttFallback'),
      badge: FALLBACK_BADGE,
    })
  })

  it('قيم غير نصية ومفاتيح موروثة لا تتسرب ولا ترمي', () => {
    const asStr = (v: unknown) => v as string
    expect(studentPortalAttMeta(asStr(null)).badge).toBe(FALLBACK_BADGE)
    expect(studentPortalAttMeta(asStr(undefined)).badge).toBe(FALLBACK_BADGE)
    expect(studentPortalAttMeta('toString').badge).toBe(FALLBACK_BADGE)
    expect(studentPortalAttMeta('constructor').badge).toBe(FALLBACK_BADGE)
  })
})
