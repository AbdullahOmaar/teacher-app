import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { SideNav } from './SideNav'
import { t } from '../../i18n'

// عدّاد الملاحظات غير المقروءة مُتحكَّم فيه من الاختبار (نفس نمط
// اختبارات الحالات) — لا شبكة ولا React Query هنا
const flags = vi.hoisted(() => ({ unread: 0 }))
vi.mock('../../features/feedback/hooks', () => ({
  useFeedbackUnreadCount: () => ({ data: flags.unread }),
}))

afterEach(() => {
  cleanup()
  flags.unread = 0
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="probe">{location.pathname}</div>
}

function renderNav(path: string, alertsCount = 0) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SideNav
        teacherId="teacher-1"
        alertsCount={alertsCount}
        displayName="أستاذ تجريبي"
        avatarUrl={null}
        avatarLetter="أ"
      />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('SideNav — شريط الديسكتوب الجانبي (3A-930)', () => {
  it('مخفي تحت نقطة الكسر ولا يظهر إلا عند lg', () => {
    const { container } = renderNav('/')
    const aside = container.querySelector('[data-side-nav]')
    expect(aside).not.toBeNull()
    expect(aside!.className).toContain('hidden')
    expect(aside!.className).toContain('lg:flex')
    // ثابت عند بداية الاتجاه بعرض الشريط المعتمد
    expect(aside!.className).toContain('fixed')
    expect(aside!.className).toContain('start-0')
    expect(aside!.className).toContain('w-[264px]')
  })

  it('يعرض كل الأقسام بتسميات القاموس نفسها (تبويبات + «المزيد»)', () => {
    renderNav('/')
    for (const label of [
      t('shell.nav.home'),
      t('shell.title.att'),
      t('shell.nav.students'),
      t('common.invoices'),
      t('settings.moreSchedule'),
      t('settings.moreGroups'),
      t('settings.moreMoney'),
      t('settings.moreSettings'),
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('العنصر النشط من المسار — والتفاصيل تُنسب لقسمها', () => {
    const { container } = renderNav('/students/abc-123')
    const active = container.querySelector('[aria-current="page"]')
    expect(active).not.toBeNull()
    expect(active!.getAttribute('data-side-nav-item')).toBe('students')
  })

  it('الضغط على عنصر ينقّل لمساره', () => {
    const { container } = renderNav('/')
    const groups = container.querySelector('[data-side-nav-item="groups"]')
    expect(groups).not.toBeNull()
    fireEvent.click(groups!)
    expect(screen.getByTestId('probe')).toHaveTextContent('/groups')
  })

  it('شارتا العدّاد من مصدريهما: التنبيهات من خاصية الجرس والملاحظات من خطافها', () => {
    flags.unread = 2
    const { container } = renderNav('/', 3)
    const notif = container.querySelector('[data-side-nav-item="notifications"]')
    expect(notif).not.toBeNull()
    expect(notif!.textContent).toContain('3')
    const feedback = container.querySelector('[data-side-nav-item="feedback"]')
    expect(feedback).not.toBeNull()
    expect(feedback!.textContent).toContain('2')
  })

  it('بلا عدّادات لا شارات', () => {
    const { container } = renderNav('/')
    const notif = container.querySelector('[data-side-nav-item="notifications"]')
    expect(notif!.querySelector('.bg-bad')).toBeNull()
  })
})
