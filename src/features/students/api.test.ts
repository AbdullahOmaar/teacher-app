import { describe, expect, it } from 'vitest'
import { validateStudentPhones } from './api'
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
