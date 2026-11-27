import { describe, expect, it } from 'vitest'
import { isGroupFull, validateStudentPhones } from './api'
import { t } from '../../i18n'

describe('validateStudentPhones — موبايل مصري إلزامي الصيغة (3A-913)', () => {
  it('فارغ/غائب يمر (الحقلان اختياريان)', () => {
    expect(validateStudentPhones({ phone: null, guardian_phone: null })).toBeNull()
    expect(validateStudentPhones({ phone: '', guardian_phone: '   ' })).toBeNull()
  })
  it('أرقام مصرية بكل الصيغ تمر', () => {
    expect(
      validateStudentPhones({ phone: '01001234567', guardian_phone: '01112223334' }),
    ).toBeNull()
    expect(
      validateStudentPhones({ phone: '+201001234567', guardian_phone: '01512345678' }),
    ).toBeNull()
    expect(validateStudentPhones({ phone: '012 1234 5678', guardian_phone: null })).toBeNull()
  })
  it('«123» مرفوض — الحالة المرصودة', () => {
    expect(validateStudentPhones({ phone: '123', guardian_phone: null })).toBe(
      t('students.formPhoneError'),
    )
  })
  it('موبايل ولي الأمر غير الصالح مرفوض برسالة ولي الأمر', () => {
    expect(validateStudentPhones({ phone: '01001234567', guardian_phone: '123' })).toBe(
      t('students.formGuardianPhoneError'),
    )
  })
  it('بادئة أرضية/أجنبية مرفوضة', () => {
    expect(validateStudentPhones({ phone: '0223456789', guardian_phone: null })).toBe(
      t('students.formPhoneError'),
    )
    expect(validateStudentPhones({ phone: '+447911123456', guardian_phone: null })).toBe(
      t('students.formPhoneError'),
    )
  })
})

describe('isGroupFull — حارس سعة المجموعة (3A-925 بند ١)', () => {
  it('بلا سعة (null) لا تمتلئ أبداً مهما كبر العدد', () => {
    expect(isGroupFull(null, 0)).toBe(false)
    expect(isGroupFull(null, 500)).toBe(false)
  })
  it('أقل من السعة = مكان متاح', () => {
    expect(isGroupFull(10, 0)).toBe(false)
    expect(isGroupFull(10, 9)).toBe(false)
  })
  it('عند السعة أو فوقها = ممتلئة (حالة المالك: سعة 1 وطالب ثانٍ)', () => {
    expect(isGroupFull(1, 1)).toBe(true)
    expect(isGroupFull(10, 10)).toBe(true)
    expect(isGroupFull(10, 11)).toBe(true)
  })
})
