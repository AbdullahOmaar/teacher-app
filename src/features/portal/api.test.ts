import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import { portalNotifMeta, portalProofStatusMeta, proofErrorMessage } from './api'

// اختبارات وحدة لمساعدات بوابة ولي الأمر النقية (3A-909): حسم ميتا
// التنبيهات/حالات الإثبات بأمان ضد انحراف نسخ العميل/الخادم، وربط
// رسائل خطأ إرسال الإثبات. مسارات الـ RPC تُغطّى باختبارات التفويض الحية.

const FALLBACK_BADGE = 'bg-soft text-muted border-border'

describe('portalNotifMeta (3A-909)', () => {
  it('الأنواع المعروفة ترجع ميتاها', () => {
    expect(portalNotifMeta('arrived').label).toBe(t('portal.apiNotifArrived'))
    expect(portalNotifMeta('left').label).toBe(t('portal.apiNotifLeft'))
    expect(portalNotifMeta('absence').label).toBe(t('portal.apiNotifAbsence'))
    expect(portalNotifMeta('invoice_issued').label).toBe(t('portal.apiNotifInvoice'))
  })

  it('نوع لا يعرفه العميل يتحل لشارة «تنبيه» محايدة ولا يرمي', () => {
    expect(() => portalNotifMeta('some_future_kind')).not.toThrow()
    expect(portalNotifMeta('some_future_kind')).toEqual({
      label: t('portal.apiNotifFallback'),
      badge: FALLBACK_BADGE,
    })
  })

  it('قيمة فارغة تتحل للبديل المحايد ولا ترمي', () => {
    expect(portalNotifMeta('')).toEqual({
      label: t('portal.apiNotifFallback'),
      badge: FALLBACK_BADGE,
    })
  })
})

describe('portalProofStatusMeta (3A-909)', () => {
  it('الحالات المعروفة ترجع ميتاها', () => {
    expect(portalProofStatusMeta('pending').label).toBe(t('portal.apiProofStatusPending'))
    expect(portalProofStatusMeta('approved').label).toBe(t('portal.apiProofStatusApproved'))
    expect(portalProofStatusMeta('rejected').label).toBe(t('portal.apiProofStatusRejected'))
  })

  it('حالة لا يعرفها العميل تتحل لشارة محايدة ولا ترمي', () => {
    expect(() => portalProofStatusMeta('mystery_status')).not.toThrow()
    expect(portalProofStatusMeta('mystery_status')).toEqual({
      label: t('portal.apiProofStatusFallback'),
      badge: FALLBACK_BADGE,
    })
  })
})

describe('proofErrorMessage (3A-909)', () => {
  it('قسم مدفوعات مقفول من المدرس → رسالة محددة مهذبة', () => {
    expect(proofErrorMessage(new Error('section disabled'))).toBe(
      t('portal.apiProofErrorSectionDisabled'),
    )
  })

  it('الربطات القائمة لم تتغير', () => {
    expect(proofErrorMessage(new Error('too many pending proofs'))).toBe(
      t('portal.apiProofErrorTooMany'),
    )
    expect(proofErrorMessage(new Error('invalid amount'))).toBe(
      t('portal.apiProofErrorInvalidAmount'),
    )
    expect(proofErrorMessage(new Error('invalid file type'))).toBe(
      t('portal.apiProofErrorInvalidFileType'),
    )
    expect(proofErrorMessage(new Error('token not valid'))).toBe(
      t('portal.apiProofErrorInvalidLink'),
    )
  })

  it('خطأ غير معروف يقع على الرسالة العامة المهذبة', () => {
    expect(proofErrorMessage(new Error('boom'))).toBe(t('portal.apiProofErrorGeneric'))
  })
})
