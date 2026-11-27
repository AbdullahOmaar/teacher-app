import { describe, expect, it } from 'vitest'
import { t } from '../../i18n'
import type { GuardianRow } from '../../types/database'
import {
  isMissingWhatsappOptOutColumn,
  portalMoneyState,
  portalNotifMeta,
  portalProofStatusMeta,
  proofErrorMessage,
  withWhatsappOptOutDefault,
} from './api'

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

describe('isMissingWhatsappOptOutColumn — كشف غياب عمود whatsapp_opt_out (0073)', () => {
  it('PGRST204 = عمود مفقود', () => {
    expect(
      isMissingWhatsappOptOutColumn({
        code: 'PGRST204',
        message: "Could not find the 'whatsapp_opt_out' column of 'guardians' in the schema cache",
      }),
    ).toBe(true)
  })
  it('رسالة تذكر whatsapp_opt_out = عمود مفقود', () => {
    expect(
      isMissingWhatsappOptOutColumn({ code: '42703', message: 'column "whatsapp_opt_out" does not exist' }),
    ).toBe(true)
  })
  it('خطأ آخر = ليس غياب عمود', () => {
    expect(isMissingWhatsappOptOutColumn({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingWhatsappOptOutColumn({ code: 'PGRST204', message: 'some other column' })).toBe(true)
    expect(isMissingWhatsappOptOutColumn(null)).toBe(false)
  })
})

describe('withWhatsappOptOutDefault — إكمال صف قديم بالافتراضي', () => {
  const legacyRow = {
    id: 'g1',
    teacher_id: 't1',
    user_id: null,
    display_name: 'ولي أمر',
    phone: '+201012345678',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  } as Omit<GuardianRow, 'whatsapp_opt_out'>

  it('غياب العمود = لا انسحاب (false) كما في افتراضي المهاجرة', () => {
    expect(withWhatsappOptOutDefault(legacyRow).whatsapp_opt_out).toBe(false)
  })

  it('قيمة موجودة تُحفَظ كما هي', () => {
    expect(withWhatsappOptOutDefault({ ...legacyRow, whatsapp_opt_out: true }).whatsapp_opt_out).toBe(true)
    expect(withWhatsappOptOutDefault({ ...legacyRow, whatsapp_opt_out: false }).whatsapp_opt_out).toBe(false)
  })
})

describe('portalMoneyState — حالة مال البوابة (3A-925 بند ٤)', () => {
  it('رصيد موجب = مستحقّ مهما كانت الفواتير', () => {
    expect(portalMoneyState({ balance: 150, has_invoices: true })).toBe('due')
    expect(portalMoneyState({ balance: 150, has_invoices: false })).toBe('due')
  })
  it('فواتير موجودة ورصيد صفر = مسدد', () => {
    expect(portalMoneyState({ balance: 0, has_invoices: true })).toBe('paid')
  })
  it('لا فواتير أصلاً ورصيد صفر = لا فواتير (لا «مسدد» الخاطئة)', () => {
    expect(portalMoneyState({ balance: 0, has_invoices: false })).toBe('none')
  })
})
