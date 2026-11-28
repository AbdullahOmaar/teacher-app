import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import type { AttendanceValue, RosterStudent } from '../api'
import { StudentRow } from './StudentRow'

/**
 * تأكيد خطوتين قبل مسح تسجيل الانصراف (3A-911): المسح كان يمحو
 * سجلاً محفوظاً بضغطة واحدة على أيقونة 36px ملاصقة للنجمة، وتنبيه
 * «غادر» لولي الأمر لا يتراجع بالمسح. الضغطة الأولى تُسلّح فقط
 * والثانية على زر التأكيد النصي تنفّذ — وتسجيل الانصراف نفسه يبقى
 * بضغطة واحدة كما هو.
 */

const student: RosterStudent = {
  id: 'student-1',
  name: 'طالب تجريبي',
  public_code: 'ST-0001',
  phone: null,
  guardian_name: null,
  guardian_phone: null,
}

const presentValue: AttendanceValue = { status: 'p', homework_done: false, starred: false }

function renderRow(leftAt: string | undefined, onToggleLeft: (studentId: string) => void) {
  return render(
    <MemoryRouter>
      <StudentRow
        student={student}
        first
        value={presentValue}
        queueItem={undefined}
        leftAt={leftAt}
        flash={false}
        cancelled={false}
        online
        absenceWa={null}
        markLeftPending={false}
        clearLeftPending={false}
        onChangeValue={() => undefined}
        onToggleLeft={onToggleLeft}
      />
    </MemoryRouter>,
  )
}

describe('StudentRow — تأكيد مسح الانصراف بخطوتين (3A-911)', () => {
  afterEach(() => {
    cleanup()
  })

  it('الضغطة الأولى على زر التراجع تُسلّح فقط ولا تمسح', () => {
    const onToggleLeft = vi.fn()
    renderRow('2026-11-27T08:30:00.000Z', onToggleLeft)

    fireEvent.click(screen.getByRole('button', { name: t('attendance.undo') }))

    expect(onToggleLeft.mock.calls.length).toBe(0)
    expect(screen.getByRole('button', { name: t('attendance.undoConfirm') })).toBeTruthy()
  })

  it('الضغطة الثانية على زر التأكيد تمسح الانصراف مرة واحدة', () => {
    const onToggleLeft = vi.fn()
    renderRow('2026-11-27T08:30:00.000Z', onToggleLeft)

    fireEvent.click(screen.getByRole('button', { name: t('attendance.undo') }))
    fireEvent.click(screen.getByRole('button', { name: t('attendance.undoConfirm') }))

    expect(onToggleLeft.mock.calls.length).toBe(1)
    expect(onToggleLeft.mock.calls[0]?.[0]).toBe('student-1')
  })

  it('تسجيل الانصراف (بلا leftAt) يبقى بضغطة واحدة بلا تأكيد', () => {
    const onToggleLeft = vi.fn()
    renderRow(undefined, onToggleLeft)

    fireEvent.click(screen.getByRole('button', { name: t('attendance.markLeft') }))

    expect(onToggleLeft.mock.calls.length).toBe(1)
    expect(screen.queryByRole('button', { name: t('attendance.undoConfirm') })).toBeNull()
  })
})
