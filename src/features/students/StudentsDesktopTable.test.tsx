import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { StudentsDesktopTable, type StudentTableRow } from './StudentsDesktopTable'
import { t } from '../../i18n'

afterEach(() => cleanup())

const ROWS: StudentTableRow[] = [
  {
    id: 's1',
    name: 'طالب أول',
    paused: false,
    grade: 'الصف الثالث',
    groupNames: ['مجموعة السبت'],
    phone: '01001234567',
    selected: true,
    balanceBadge: <span>شارة حالة</span>,
  },
  {
    id: 's2',
    name: 'طالب ثانٍ',
    paused: true,
    grade: null,
    groupNames: [],
    phone: null,
    selected: false,
    balanceBadge: null,
  },
]

function renderTable(showBalance = true, onActivate = vi.fn()) {
  return {
    onActivate,
    ...render(
      <MemoryRouter>
        <StudentsDesktopTable rows={ROWS} showBalance={showBalance} onActivate={onActivate} />
      </MemoryRouter>,
    ),
  }
}

describe('StudentsDesktopTable — جدول الطلاب للديسكتوب (3A-930)', () => {
  it('ترويسات الأعمدة من القاموس', () => {
    renderTable()
    for (const label of [
      t('students.tableStudent'),
      t('students.gradeLabel'),
      t('students.tableGroups'),
      t('students.studentPhoneLabel'),
      t('students.tableStatus'),
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('يعرض بيانات الصفوف: الاسم والمجموعة والموبايل وشارة الحالة', () => {
    renderTable()
    expect(screen.getByText('طالب أول')).toBeInTheDocument()
    expect(screen.getByText('مجموعة السبت')).toBeInTheDocument()
    expect(screen.getByText('01001234567')).toBeInTheDocument()
    expect(screen.getByText('شارة حالة')).toBeInTheDocument()
  })

  it('القيم الغائبة تُعرض بشرطة لا فراغاً، والموقوف بشارته', () => {
    const { container } = renderTable()
    const row2 = container.querySelector('[data-student-row="s2"]')
    expect(row2).not.toBeNull()
    expect(row2!.textContent).toContain('—')
    expect(row2!.textContent).toContain(t('students.badgePaused'))
  })

  it('الصف المختار مُعلَّم بصرياً', () => {
    const { container } = renderTable()
    const row1 = container.querySelector('[data-student-row="s1"]')
    expect(row1!.className).toContain('bg-soft')
  })

  it('الضغط على صف يستدعي التفعيل بهوية الطالب (نفس معالج القائمة)', () => {
    const { container, onActivate } = renderTable()
    fireEvent.click(container.querySelector('[data-student-row="s2"]')!)
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate.mock.calls[0][1]).toBe('s2')
  })

  it('للمساعد يُحذف عمود الحالة كلياً (المالية محجوبة)', () => {
    renderTable(false)
    expect(screen.queryByText(t('students.tableStatus'))).toBeNull()
    expect(screen.queryByText('شارة حالة')).toBeNull()
  })
})
