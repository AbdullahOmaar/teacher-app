import { describe, expect, it } from 'vitest'
import {
  arrivalMessage,
  arrivalWaUrl,
  departureMessage,
  departureWaUrl,
  resolveGuardian,
  type ArrivalWaContext,
  type RosterStudent,
} from './api'

// اختبارات بنّائي رسائل واتساب للوصول/المغادرة (PAT-4أ): النصوص من
// قاموس attendance حرفياً، والرقم بترتيب resolveGuardian (المرتبط ←
// guardian_phone ← موبايل الطالب)، وnull عند غياب أي رقم صالح.
const student: RosterStudent = {
  id: 's1',
  name: 'أحمد سمير',
  public_code: 'ST-1',
  phone: '01001234567',
  guardian_name: 'محمد سمير',
  guardian_phone: '01112223334',
}

const ctx: ArrivalWaContext = {
  sessionDate: '2026-11-22',
  groupName: 'مجموعة السبت',
  centreName: 'سنتر النور',
}

const textOf = (url: string | null): string =>
  decodeURIComponent((url ?? '').split('?text=')[1] ?? '')

describe('arrivalMessage / departureMessage — نصا الوصول والمغادرة', () => {
  it('الوصول باسم السنتر عند وجوده', () => {
    expect(arrivalMessage(student, undefined, ctx)).toBe(
      'أهلاً محمد سمير، نحيطكم علماً بوصول الطالب أحمد سمير إلى سنتر النور — حصة مجموعة السبت بتاريخ 2026-11-22.',
    )
  })
  it('المغادرة باسم السنتر عند وجوده', () => {
    expect(departureMessage(student, undefined, ctx)).toBe(
      'أهلاً محمد سمير، نحيطكم علماً بمغادرة الطالب أحمد سمير من سنتر النور — حصة مجموعة السبت بتاريخ 2026-11-22.',
    )
  })
  it('بلا اسم سنتر تسقط عبارة المكان كاملة', () => {
    const noCentre = { ...ctx, centreName: null }
    expect(arrivalMessage(student, undefined, noCentre)).toBe(
      'أهلاً محمد سمير، نحيطكم علماً بوصول الطالب أحمد سمير — حصة مجموعة السبت بتاريخ 2026-11-22.',
    )
    expect(departureMessage(student, undefined, noCentre)).toBe(
      'أهلاً محمد سمير، نحيطكم علماً بمغادرة الطالب أحمد سمير — حصة مجموعة السبت بتاريخ 2026-11-22.',
    )
  })
  it('اسم ولي الأمر المرتبط (guardians) يتقدّم على حقول الطالب', () => {
    const contact = { name: 'فاطمة علي', phone: '01099998888' }
    expect(arrivalMessage(student, contact, ctx)).toContain('أهلاً فاطمة علي،')
  })
  it('غياب اسم ولي الأمر: «ولي أمر {الاسم الأول}»', () => {
    const anon: RosterStudent = { ...student, guardian_name: null }
    expect(arrivalMessage(anon, undefined, ctx)).toContain('أهلاً ولي أمر أحمد،')
  })
})

describe('arrivalWaUrl / departureWaUrl — روابط wa.me', () => {
  it('الرقم من guardian_phone ويُحوَّل للصيغة الدولية', () => {
    const url = arrivalWaUrl(student, undefined, ctx)
    expect(url?.startsWith('https://wa.me/201112223334?text=')).toBe(true)
    expect(textOf(url)).toBe(arrivalMessage(student, undefined, ctx))
  })
  it('رقم جهة الاتصال المرتبطة يتقدّم على guardian_phone', () => {
    const url = departureWaUrl(student, { name: null, phone: '01099998888' }, ctx)
    expect(url?.startsWith('https://wa.me/201099998888?text=')).toBe(true)
    expect(textOf(url)).toBe(departureMessage(student, { name: null, phone: '01099998888' }, ctx))
  })
  it('يسقط لموبايل الطالب نفسه عند غياب رقمي ولي الأمر', () => {
    const noGuardian: RosterStudent = { ...student, guardian_phone: null }
    expect(arrivalWaUrl(noGuardian, undefined, ctx)?.startsWith('https://wa.me/201001234567?text=')).toBe(true)
  })
  it('null عند غياب أي رقم صالح', () => {
    const noPhones: RosterStudent = { ...student, guardian_phone: null, phone: null }
    expect(arrivalWaUrl(noPhones, undefined, ctx)).toBeNull()
    expect(departureWaUrl(noPhones, { name: null, phone: null }, ctx)).toBeNull()
    expect(arrivalWaUrl(noPhones, { name: null, phone: '  ' }, ctx)).toBeNull()
  })
})

describe('resolveGuardian — سلسلتا الأسبقية مباشرة (تعميق PAT-4)', () => {
  it('جهة الاتصال المرتبطة تتقدّم في الاسم والرقم معاً', () => {
    expect(resolveGuardian(student, { name: 'فاطمة علي', phone: '01099998888' })).toEqual({
      name: 'فاطمة علي',
      phone: '01099998888',
    })
  })
  it('جهة اتصال بلا اسم ولا رقم ترجع لحقول الطالب', () => {
    expect(resolveGuardian(student, { name: null, phone: null })).toEqual({
      name: 'محمد سمير',
      phone: '01112223334',
    })
  })
  it('اسم ولي أمر من مسافات فقط يُعامل غائباً → صيغة الاسم الأول', () => {
    const blank: RosterStudent = { ...student, guardian_name: '   ' }
    expect(resolveGuardian(blank, undefined).name).toBe('ولي أمر أحمد')
  })
  it('الرقم يسقط لموبايل الطالب عند غياب رقم ولي الأمر', () => {
    const noGuardianPhone: RosterStudent = { ...student, guardian_phone: null }
    expect(resolveGuardian(noGuardianPhone, undefined).phone).toBe('01001234567')
  })
  it('الاسم الأول يُستخرج رغم مسافات زائدة في اسم الطالب', () => {
    const spaced: RosterStudent = { ...student, name: 'أحمد  سمير  حسن', guardian_name: null }
    expect(resolveGuardian(spaced, undefined).name).toBe('ولي أمر أحمد')
  })
})

describe('اسم سنتر فارغ نصياً (تعميق PAT-4)', () => {
  it('centreName = "" يسقط عبارة المكان كالغائب تماماً', () => {
    const emptyCentre = { ...ctx, centreName: '' }
    expect(arrivalMessage(student, undefined, emptyCentre)).toBe(
      arrivalMessage(student, undefined, { ...ctx, centreName: null }),
    )
  })
})
