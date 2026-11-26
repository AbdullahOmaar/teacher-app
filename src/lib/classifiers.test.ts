import { describe, expect, it } from 'vitest'
import { friendlyDbError } from './supabaseErrors'
import {
  isStaleClientError,
  translateAuthError,
  translateDbError,
} from '../features/auth/api'
import { examErrorInfo, buildExamLink } from '../features/exams/api'
import { portalErrorInfo, buildPortalLink } from '../features/portal/api'
import { studentPortalErrorInfo, buildStudentPortalLink } from '../features/student-portal/api'
import { enrolErrorInfo, buildEnrolLink } from '../features/enrol/api'

/**
 * PAT-4: اختبارات مصنّفات الأخطاء وبنّائي الروابط العامة — دوال نقية
 * تحمل رسائل المستخدم في كل التدفقات العامة، وكانت بلا أي تغطية.
 */

describe('translateAuthError', () => {
  it('يترجم أخطاء الدخول الشائعة', () => {
    expect(translateAuthError('Invalid login credentials')).toContain('غير صحيحة')
    expect(translateAuthError('Email not confirmed')).toContain('مش متأكد')
    expect(translateAuthError('User already registered')).toContain('مسجل بالفعل')
  })
  it('الرسائل غير المعروفة ترجع لرسالة عامة مهذبة — لا نص خام أبداً (قاعدة المالك 2026-11-26 + 3A-903)', () => {
    const out = translateAuthError('some unknown failure')
    expect(out).not.toBe('some unknown failure')
    expect(out).toContain('غير متوقع')
  })
})

describe('translateAuthError — فئة العميل القديم (3A-903)', () => {
  it('رسالة المفتاح التراثي المعطّل تُترجم لرسالة النسخة القديمة المصممة', () => {
    const out = translateAuthError('Legacy API keys are disabled')
    expect(out).toContain('نسختك قديمة')
    expect(out).not.toContain('Legacy')
  })
  it('صيغ رفض مفتاح API الأخرى تأخذ نفس الرسالة المصممة', () => {
    for (const raw of ['Invalid API key', 'No API key found in request', 'API key revoked']) {
      expect(translateAuthError(raw)).toContain('نسختك قديمة')
    }
  })
  it('isStaleClientError لا يبتلع أخطاء مصادقة عادية', () => {
    expect(isStaleClientError('Invalid login credentials')).toBe(false)
    expect(isStaleClientError('Email not confirmed')).toBe(false)
    expect(isStaleClientError('Network request failed')).toBe(false)
    expect(isStaleClientError('Legacy API keys are disabled')).toBe(true)
  })
})

describe('translateDbError', () => {
  it('قيود القاعدة المعروفة', () => {
    expect(translateDbError({ code: '23505' })).toContain('موجود بالفعل')
    expect(translateDbError({ code: '23503' })).toContain('غير موجودة')
    expect(translateDbError({ code: '42501' })).toContain('لا تسمح')
    expect(translateDbError({ message: 'raw msg' })).toContain('غير متوقع')
  })
})

describe('friendlyDbError', () => {
  it('انتهاك مفتاح خارجي يوجه للأرشفة', () => {
    const err = friendlyDbError({ code: '23503', message: 'violates foreign key' }, 'x')
    expect(err.message).toContain('الأرشفة')
  })
  it('أخطاء أخرى تمر كما هي، وغير-الأخطاء ترجع للاحتياطي', () => {
    const original = new Error('boom')
    expect(friendlyDbError(original, 'fallback')).toBe(original)
    expect(friendlyDbError('nope', 'fallback').message).toBe('fallback')
  })
})

describe('friendlyDbError — رسالة 23503 عند الحفظ (3A-377 — PAT-2)', () => {
  it('23503 مع fkMessage مخصصة ترجع الرسالة المخصصة لا رسالة الحذف', () => {
    const err = friendlyDbError(
      { code: '23503', message: 'violates foreign key' },
      'fallback',
      'custom fk',
    )
    expect(err.message).toBe('custom fk')
  })
  it('23503 بلا fkMessage ترجع رسالة الحذف كما قبل', () => {
    const err = friendlyDbError({ code: '23503', message: 'fk fails' }, 'x')
    expect(err.message).toContain('الأرشفة')
  })
  it('23503 من نص رسالة Error بلا كود تحترم fkMessage أيضاً', () => {
    const err = friendlyDbError(
      new Error('insert violates foreign key constraint'),
      'fallback',
      'custom fk',
    )
    expect(err.message).toBe('custom fk')
  })
  it('أخطاء غير 23503 تمرّ كما هي حتى مع fkMessage', () => {
    const original = new Error('boom')
    expect(friendlyDbError(original, 'fallback', 'custom fk')).toBe(original)
    expect(friendlyDbError('nope', 'fallback', 'custom fk').message).toBe('fallback')
  })
})

describe('examErrorInfo', () => {
  it('حد المعدل الجديد (SEC-2) له رسالة ودية', () => {
    expect(examErrorInfo(new Error('too many attempts')).title).toContain('محاولات كتير')
  })
  it('كود طالب خاطئ ورابط منتهٍ', () => {
    expect(examErrorInfo(new Error('student code not found')).title).toContain('الكود غير صحيح')
    expect(examErrorInfo(new Error('invalid or expired token')).title).toContain('غير صالح')
  })
  it('خطأ غير معروف يرجع لافتراضي آمن', () => {
    const info = examErrorInfo(new Error('weird'))
    expect(info.title.length).toBeGreaterThan(0)
    expect(info.hint.length).toBeGreaterThan(0)
  })
})

describe('portal/studentPortal/enrol ErrorInfo', () => {
  it('روابط منتهية في البوابات الثلاث', () => {
    expect(portalErrorInfo(new Error('invalid or expired')).title).toContain('منتهي')
    expect(studentPortalErrorInfo(new Error('invalid or expired')).title.length).toBeGreaterThan(0)
    expect(enrolErrorInfo(new Error('invalid or expired')).title.length).toBeGreaterThan(0)
  })
})

describe('link builders', () => {
  it('صيغ الروابط العامة الأربعة ثابتة ومشفرة', () => {
    expect(buildExamLink('https://x.app', 'a b')).toBe('https://x.app/exam?t=a%20b')
    expect(buildPortalLink('https://x.app', 'stu-1', 'tok')).toBe(
      'https://x.app/portal?student=stu-1&t=tok',
    )
    expect(buildStudentPortalLink('https://x.app', 'tok')).toBe(
      'https://x.app/student-portal?t=tok',
    )
    expect(buildEnrolLink('https://x.app', 'tok')).toBe('https://x.app/book?t=tok')
  })
})

// ---------------------------------------------------------------------------
// تعميق PAT-4 (دفعة #10 — 3A-373): كل فرع تصنيف موثّق يُثبَّت بتمييزه عن
// المسار العام/التمريري، لا بلقطة نصية هشّة — الرسائل من القاموس الحي.
// ---------------------------------------------------------------------------

describe('translateAuthError — كل الفروع الموثقة (تعميق)', () => {
  const branches: [string, string][] = [
    ['User already registered', 'already registered'],
    ['Email address already exists', 'already exists'],
    ['Invalid phone number', 'invalid phone'],
    ['Phone number format is invalid', 'phone format'],
    ['The OTP expired or is invalid', 'otp invalid'],
    ['Token has expired', 'token expired'],
    ['Otp expired, request a new one', 'otp expired'],
    ['Error sending SMS to provider', 'sms send'],
    ['Signups not allowed for this instance', 'signups'],
    ['Password should be at least 6 characters', 'short password'],
    ['For security purposes, you can only request this after 60 seconds', 'security wait'],
    ['Weak password: add symbols', 'weak password'],
    ['Password is too weak', 'too weak'],
    ['Invalid email address', 'invalid email'],
    ['Unable to validate email address: invalid format', 'validate email'],
    ['Email rate limit exceeded', 'rate limit'],
    ['Too many requests', 'too many'],
    ['Network request failed', 'network'],
    ['Failed to fetch', 'fetch'],
  ]
  it.each(branches)('«%s» تُترجم ولا تمرّ كما هي (%s)', (raw) => {
    const out = translateAuthError(raw)
    expect(out).not.toBe(raw)
    expect(out.length).toBeGreaterThan(0)
  })
  it('غير حساسة لحالة الأحرف (تُخفَّض قبل المطابقة)', () => {
    expect(translateAuthError('INVALID LOGIN CREDENTIALS')).toContain('غير صحيحة')
    expect(translateAuthError('EMAIL NOT CONFIRMED')).toContain('مش متأكد')
  })
  it('فرع «already exists» و«already registered» رسالة واحدة', () => {
    expect(translateAuthError('already exists')).toBe(translateAuthError('already registered'))
  })
})

describe('translateDbError — فروع إضافية (تعميق)', () => {
  it('RLS من نص الرسالة بلا كود', () => {
    expect(translateDbError({ message: 'new row violates row-level security policy' })).toContain(
      'لا تسمح',
    )
  })
  it('كود غير معروف يرجع للعام المهذب — لا نص خام (قاعدة المالك 2026-11-26 + 3A-903)', () => {
    const out = translateDbError({ code: '22001', message: 'value too long' })
    expect(out).not.toBe('value too long')
    expect(out).toContain('غير متوقع')
  })
  it('خطأ فارغ تماماً يرجع لاحتياطي «غير متوقع» لا لسلسلة فارغة', () => {
    const out = translateDbError({})
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toBe(translateDbError({ code: '23505' }))
  })
})

describe('friendlyDbError — فروع إضافية (تعميق)', () => {
  it('كود 23503 على كائن عادي (ليس Error) يُترجم لرسالة الحظر', () => {
    const err = friendlyDbError({ code: '23503', message: 'fk fails' }, 'x')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('الأرشفة')
  })
  it('نص «foreign key» في رسالة Error بلا كود يكفي للترجمة', () => {
    const err = friendlyDbError(new Error('update violates foreign key constraint'), 'x')
    expect(err.message).toContain('الأرشفة')
  })
  it('أكواد أخرى (23505) تمرّ بالهوية نفسها', () => {
    const original = Object.assign(new Error('dup'), { code: '23505' })
    expect(friendlyDbError(original, 'fallback')).toBe(original)
  })
})

describe('examErrorInfo — كل الفروع (تعميق)', () => {
  const generic = examErrorInfo(new Error('zzz-unknown'))
  const branchMsgs = [
    'exam not published',
    'exam not started yet',
    'exam window closed',
    'student not in exam group',
    'student is paused',
    'attempt limit reached',
    'exam has no gradable questions',
    'time expired',
  ]
  it.each(branchMsgs)('«%s» عنوانه يختلف عن العام', (msg) => {
    expect(examErrorInfo(new Error(msg)).title).not.toBe(generic.title)
  })
  it('مدخل سلسلة خام (ليس Error) يُصنَّف أيضاً', () => {
    expect(examErrorInfo('invalid or expired token').title).toBe(
      examErrorInfo(new Error('invalid or expired token')).title,
    )
  })
  it('null وundefined يرجعان للعام الآمن', () => {
    expect(examErrorInfo(null)).toEqual(generic)
    expect(examErrorInfo(undefined)).toEqual(generic)
  })
})

describe('portalErrorInfo — تمييز التلميحات (تعميق)', () => {
  const generic = portalErrorInfo(new Error('zzz-unknown'))
  it('«not authorized» و«token not valid» مخرج واحد يختلف تلميحه عن العام', () => {
    const a = portalErrorInfo(new Error('not authorized'))
    const b = portalErrorInfo(new Error('token not valid'))
    expect(a).toEqual(b)
    expect(a.title).toBe(generic.title)
    expect(a.hint).not.toBe(generic.hint)
  })
  it('المنتهي يختلف عن العام في العنوان والتلميح معاً', () => {
    const expired = portalErrorInfo(new Error('invalid or expired'))
    expect(expired.title).not.toBe(generic.title)
    expect(expired.hint).not.toBe(generic.hint)
  })
})

describe('studentPortalErrorInfo — الفرعان (تعميق)', () => {
  it('المنتهي يختلف عن العام، والعام ثابت لغيره', () => {
    const generic = studentPortalErrorInfo(new Error('zzz-unknown'))
    const expired = studentPortalErrorInfo(new Error('invalid or expired'))
    expect(expired.title).not.toBe(generic.title)
    expect(expired.hint).not.toBe(generic.hint)
    expect(studentPortalErrorInfo('whatever')).toEqual(generic)
  })
})

describe('enrolErrorInfo — كل الفروع (تعميق)', () => {
  const generic = enrolErrorInfo(new Error('zzz-unknown'))
  const branchMsgs = [
    'invalid or disabled',
    'too many requests',
    'invalid phone',
    'invalid group',
    'invalid name',
    'invalid note',
  ]
  it.each(branchMsgs)('«%s» عنوانه يختلف عن العام', (msg) => {
    expect(enrolErrorInfo(new Error(msg)).title).not.toBe(generic.title)
  })
  it('«invalid name» و«invalid note» فرع واحد بمخرج واحد', () => {
    expect(enrolErrorInfo(new Error('invalid name'))).toEqual(
      enrolErrorInfo(new Error('invalid note')),
    )
  })
})

describe('link builders — تشفير المحارف المحجوزة (تعميق)', () => {
  it('معرّف الطالب والرمز يُشفَّران في رابط البوابة', () => {
    expect(buildPortalLink('https://x.app', 'stu 1&y', 't+k/=')).toBe(
      'https://x.app/portal?student=stu%201%26y&t=t%2Bk%2F%3D',
    )
  })
  it('الرمز يُشفَّر في الروابط الثلاثة الأخرى', () => {
    expect(buildExamLink('https://x.app', 'a+b/c=')).toBe('https://x.app/exam?t=a%2Bb%2Fc%3D')
    expect(buildStudentPortalLink('https://x.app', 'a+b/c=')).toBe(
      'https://x.app/student-portal?t=a%2Bb%2Fc%3D',
    )
    expect(buildEnrolLink('https://x.app', 'a+b/c=')).toBe('https://x.app/book?t=a%2Bb%2Fc%3D')
  })
})
