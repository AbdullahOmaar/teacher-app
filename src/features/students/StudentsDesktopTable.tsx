import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { t } from '../../i18n'

/**
 * صف جدول الطلاب للديسكتوب (3A-930): بيانات مُعدّة في الصفحة من
 * نفس اشتقاقات قائمة الموبايل حرفياً (الأرصدة/المجموعات/الاختيار)
 * — الجدول سطح عرض ثانٍ لنفس البيانات لا مصدر موازٍ.
 */
export interface StudentTableRow {
  id: string
  name: string
  paused: boolean
  grade: string | null
  groupNames: string[]
  phone: string | null
  selected: boolean
  balanceBadge: ReactNode
}

/**
 * جدول بيانات الطلاب عند ≥1024px (يُخفى تحتها — قائمة البطاقات
 * تبقى سطح الموبايل الوحيد). الضغط على أي صف هو نفس تفعيل صف
 * القائمة: اختيار في اللوحة عند الديسكتوب وتنقّل عادي تحته،
 * بقرار المعالج نفسه في الصفحة (matchMedia) فلا سلوكان متوازيان.
 */
export function StudentsDesktopTable({
  rows,
  showBalance,
  onActivate,
}: {
  rows: StudentTableRow[]
  /** المالية محجوبة عن المساعد — عمود الحالة يُحذف كلياً كما في القائمة */
  showBalance: boolean
  onActivate: (e: MouseEvent, id: string) => void
}) {
  return (
    <table className="w-full border-collapse" data-students-table>
      <thead>
        <tr className="bg-soft/40 type-badge text-muted">
          <th className="text-start font-semibold px-4 py-3">{t('students.tableStudent')}</th>
          <th className="text-start font-semibold px-4 py-3">{t('students.gradeLabel')}</th>
          <th className="text-start font-semibold px-4 py-3">{t('students.tableGroups')}</th>
          <th className="text-start font-semibold px-4 py-3">{t('students.studentPhoneLabel')}</th>
          {showBalance && (
            <th className="text-start font-semibold px-4 py-3">{t('students.tableStatus')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={(e) => onActivate(e, r.id)}
            className={`border-t border-border cursor-pointer hover:bg-soft/50 ${
              r.selected ? 'bg-soft' : ''
            } ${r.paused ? 'opacity-60' : ''}`}
            data-student-row={r.id}
          >
            <td className="px-4 py-2.5">
              <span className="flex items-center gap-2.5 min-w-0">
                <Avatar name={r.name} />
                <Link
                  to={`/students/${r.id}`}
                  onClick={(e) => onActivate(e, r.id)}
                  className="font-semibold text-[15px] text-text no-underline truncate"
                >
                  {r.name}
                </Link>
                {r.paused && (
                  <span className="inline-flex items-center whitespace-nowrap leading-none type-badge bg-warn-soft text-warn-text border border-warn/40 rounded-full px-2 py-1 shrink-0">
                    {t('students.badgePaused')}
                  </span>
                )}
              </span>
            </td>
            <td className="px-4 py-2.5 text-muted type-body">{r.grade ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted type-body">
              {r.groupNames.length ? r.groupNames.join(t('students.nameSeparator')) : '—'}
            </td>
            <td className="px-4 py-2.5 text-muted type-body">
              {r.phone ? (
                <span dir="ltr" className="inline-block">
                  {r.phone}
                </span>
              ) : (
                '—'
              )}
            </td>
            {showBalance && <td className="px-4 py-2.5">{r.balanceBadge}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
