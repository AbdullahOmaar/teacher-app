import { describe, expect, it } from 'vitest'
import {
  SIDE_NAV_ALL,
  SIDE_NAV_MAIN,
  SIDE_NAV_SECTIONS,
  SIDE_NAV_SYSTEM,
  sideActiveKey,
} from './navModel'

/**
 * تكافؤ نموذج تنقّل الديسكتوب (3A-930): الشريط الجانبي ليس نموذجاً
 * موازياً — كل وجهة في الشريط السفلي وقائمة «المزيد» لها عنصر فيه
 * بنفس المسار، وكل عنصر فيه وجهته حقيقية من أحد النموذجين.
 * القوائم المرجعية هنا منسوخة من مصدريها (AppShell TABS و
 * MorePage MENU) — إن تغيّر أحدهما يُحدَّث هذا الاختبار معه بوعي.
 */
const BOTTOM_TABS = ['/', '/students', '/invoices', '/more']
const MORE_MENU = [
  '/schedule',
  '/groups',
  '/grades',
  '/homework',
  '/assistant',
  '/money',
  '/analytics',
  '/portal-links',
  '/students?import=1',
  '/activity-log',
  '/feedback',
  '/announcements',
  '/support',
  '/backup',
  '/export',
  '/settings',
]

describe('navModel — تكافؤ الشريط الجانبي مع نموذجَي التنقّل القائمين', () => {
  it('كل تبويب سفلي (عدا «المزيد» ذاتها) له عنصر شريط بنفس المسار', () => {
    const paths = SIDE_NAV_ALL.map((i) => i.path)
    for (const tab of BOTTOM_TABS.filter((p) => p !== '/more')) {
      expect(paths).toContain(tab)
    }
  })

  it('كل قسم في قائمة «المزيد» له عنصر شريط بنفس المسار', () => {
    const paths = SIDE_NAV_ALL.map((i) => i.path)
    for (const path of MORE_MENU) {
      // «استيراد الطلاب» إجراء برابط عميق لا قسم — وجهته /students موجودة
      if (path === '/students?import=1') continue
      expect(paths).toContain(path)
    }
  })

  it('لا عنصر شريط بوجهة مخترعة: كل مساراته من التبويبات أو «المزيد» أو وجهتي الجرس/الحضور', () => {
    const known = new Set([
      ...BOTTOM_TABS,
      ...MORE_MENU.map((p) => p.split('?')[0]),
      '/attendance',
      '/notifications',
    ])
    for (const item of SIDE_NAV_ALL) {
      expect(known.has(item.path)).toBe(true)
    }
  })

  it('المفاتيح فريدة والمسارات فريدة', () => {
    expect(new Set(SIDE_NAV_ALL.map((i) => i.key)).size).toBe(SIDE_NAV_ALL.length)
    expect(new Set(SIDE_NAV_ALL.map((i) => i.path)).size).toBe(SIDE_NAV_ALL.length)
  })

  it('المجموعات الثلاث مرتبة: رئيسي ثم أقسام ثم حساب ونظام', () => {
    expect(SIDE_NAV_MAIN.map((i) => i.key)).toEqual(['home', 'attendance', 'students', 'invoices'])
    expect(SIDE_NAV_SECTIONS[0].key).toBe('schedule')
    expect(SIDE_NAV_SYSTEM[SIDE_NAV_SYSTEM.length - 1].key).toBe('settings')
  })
})

describe('sideActiveKey — نسبة الشاشات الفرعية لأقسامها', () => {
  it('المسارات الجذرية', () => {
    expect(sideActiveKey('/')).toBe('home')
    expect(sideActiveKey('/attendance')).toBe('attendance')
    expect(sideActiveKey('/students')).toBe('students')
    expect(sideActiveKey('/invoices')).toBe('invoices')
    expect(sideActiveKey('/notifications')).toBe('notifications')
  })

  it('التفاصيل تُنسب لقسمها', () => {
    expect(sideActiveKey('/students/abc-123')).toBe('students')
    expect(sideActiveKey('/invoices/abc-123')).toBe('invoices')
    expect(sideActiveKey('/groups/abc-123')).toBe('groups')
    expect(sideActiveKey('/assessments/abc-123')).toBe('grades')
  })

  it('أقسام «المزيد» والإعلانات والدعم لها عناصرها (لا تسقط للرئيسية)', () => {
    expect(sideActiveKey('/schedule')).toBe('schedule')
    expect(sideActiveKey('/announcements')).toBe('announcements')
    expect(sideActiveKey('/support')).toBe('support')
    expect(sideActiveKey('/portal-links')).toBe('portal')
    expect(sideActiveKey('/activity-log')).toBe('activity')
  })

  it('المعرّضون يتبعون الرئيسية كما في نموذج التبويبات، والمجهول للرئيسية', () => {
    expect(sideActiveKey('/at-risk')).toBe('home')
    expect(sideActiveKey('/more')).toBe('more')
    expect(sideActiveKey('/something-unknown')).toBe('home')
  })
})
