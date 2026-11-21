import { describe, expect, it } from 'vitest'
import { friendlyDbError } from './supabaseErrors'
import { translateAuthError, translateDbError } from '../features/auth/api'
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
  it('يمرر الرسائل غير المعروفة كما هي', () => {
    expect(translateAuthError('some unknown failure')).toBe('some unknown failure')
  })
})

describe('translateDbError', () => {
  it('قيود القاعدة المعروفة', () => {
    expect(translateDbError({ code: '23505' })).toContain('موجود بالفعل')
    expect(translateDbError({ code: '23503' })).toContain('غير موجودة')
    expect(translateDbError({ code: '42501' })).toContain('لا تسمح')
    expect(translateDbError({ message: 'raw msg' })).toBe('raw msg')
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
