import { describe, expect, it } from 'vitest'
import type { TeacherWhatsappConfigRow, WhatsappMessageLogRow } from '../../types/database'
import {
  isMissingAutoSendColumns,
  isMissingLogSourceColumn,
  withAutoSendDefaults,
  withLogSourceDefault,
} from './apiWhatsapp'

// اختبارات وحدة للقراءة/الكتابة المتسامحة قبل تطبيق 0073 (QA #65 —
// نمط #27/#64): كواشف غياب الأعمدة + إكمال الصفوف القديمة بالافتراضيات.
// مسارات قاعدة البيانات نفسها تُغطّى باختبارات التفويض الحية.

describe('isMissingAutoSendColumns — كشف غياب عمودي الإرسال الآلي (0073)', () => {
  it('PGRST204 = عمود مفقود', () => {
    expect(
      isMissingAutoSendColumns({
        code: 'PGRST204',
        message: "Could not find the 'auto_send_enabled' column of 'teacher_whatsapp_config' in the schema cache",
      }),
    ).toBe(true)
  })
  it('رسالة تذكر أيّاً من العمودين = عمود مفقود', () => {
    expect(isMissingAutoSendColumns({ code: '42703', message: 'column "auto_send_enabled" does not exist' })).toBe(true)
    expect(isMissingAutoSendColumns({ code: '42703', message: 'column "auto_send_daily_quota" does not exist' })).toBe(true)
  })
  it('خطأ آخر = ليس غياب عمود', () => {
    expect(isMissingAutoSendColumns({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingAutoSendColumns(null)).toBe(false)
  })
})

describe('withAutoSendDefaults — إكمال صف إعداد قديم بافتراضيي المهاجرة', () => {
  const legacyRow = {
    teacher_id: 't1',
    enabled: true,
    phone_number_id: '123',
    waba_id: '456',
    template_name: 'absence_notice',
    template_language: 'ar',
    token_updated_at: '2026-11-01T00:00:00.000Z',
    last_test_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  } as Omit<TeacherWhatsappConfigRow, 'auto_send_enabled' | 'auto_send_daily_quota'>

  it('غياب العمودين = مطفأ + حصة 100 كما في افتراضي المهاجرة', () => {
    const out = withAutoSendDefaults(legacyRow)
    expect(out.auto_send_enabled).toBe(false)
    expect(out.auto_send_daily_quota).toBe(100)
  })

  it('قيم موجودة تُحفَظ كما هي', () => {
    const out = withAutoSendDefaults({ ...legacyRow, auto_send_enabled: true, auto_send_daily_quota: 250 })
    expect(out.auto_send_enabled).toBe(true)
    expect(out.auto_send_daily_quota).toBe(250)
  })
})

describe('isMissingLogSourceColumn — كشف غياب عمود source (0073)', () => {
  it('PGRST204 = عمود مفقود', () => {
    expect(
      isMissingLogSourceColumn({
        code: 'PGRST204',
        message: "Could not find the 'source' column of 'whatsapp_message_log' in the schema cache",
      }),
    ).toBe(true)
  })
  it('رسالة تذكر source = عمود مفقود', () => {
    expect(isMissingLogSourceColumn({ code: '42703', message: 'column "source" does not exist' })).toBe(true)
  })
  it('خطأ آخر = ليس غياب عمود', () => {
    expect(isMissingLogSourceColumn({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingLogSourceColumn(null)).toBe(false)
  })
})

describe('withLogSourceDefault — إكمال صف سجل قديم بالافتراضي', () => {
  const legacyRow = {
    id: 'log1',
    teacher_id: 't1',
    kind: 'absence',
    template_name: 'absence_notice',
    recipient_phone: '+201012345678',
    status: 'sent',
    meta_message_id: 'wamid.1',
    error_code: null,
    error_message: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  } as unknown as Omit<WhatsappMessageLogRow, 'source'>

  it("غياب العمود = 'manual' كما في افتراضي المهاجرة", () => {
    expect(withLogSourceDefault(legacyRow).source).toBe('manual')
  })

  it('قيمة موجودة تُحفَظ كما هي', () => {
    expect(withLogSourceDefault({ ...legacyRow, source: 'auto' }).source).toBe('auto')
    expect(withLogSourceDefault({ ...legacyRow, source: 'manual' }).source).toBe('manual')
  })
})
