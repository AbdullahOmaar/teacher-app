import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, CalendarDays, CalendarX2, ChevronDown, Undo2 } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Chip } from '../../../components/ui/form'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Skeleton } from '../../../components/ui/states'
import { formatTime12 } from '../../../lib/format'
import { formatDateLabel } from '../../schedule/api'
import type { SessionWithGroup } from '../api'
import { t } from '../../../i18n'

/**
 * ترويسة مدمجة واحدة: منتقي التاريخ + بيانات الحصة + التقدّم +
 * إدارة الحصة في بطاقة واحدة — كانت ترويستين مكررتين تدفعان
 * قائمة الطلاب تحت أول شاشة. أزرار «مسح QR» و«الكل حاضر» لا
 * توجد هنا: مكانها الوحيد الشريط اللاصق السفلي مع العدّادات.
 */
export function SessionPickerCard({
  date,
  dateInputRef,
  onOpenDatePicker,
  onDateChange,
  paramMissing,
  pending,
  error,
  groupsEmpty,
  daySessions,
  selected,
  onPickSession,
  done,
  total,
  pct,
  rowsReady,
  cancelled,
  onToggleSessionStatus,
  statusPending,
}: {
  date: string
  dateInputRef: RefObject<HTMLInputElement | null>
  onOpenDatePicker: () => void
  onDateChange: (value: string) => void
  paramMissing: boolean
  pending: boolean
  error: Error | null
  groupsEmpty: boolean
  daySessions: SessionWithGroup[]
  selected: SessionWithGroup | null
  onPickSession: (id: string) => void
  done: number
  total: number
  pct: number
  rowsReady: boolean
  cancelled: boolean
  onToggleSessionStatus: () => void
  statusPending: boolean
}) {
  return (
    <Card className="rise-in">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={onOpenDatePicker}
            aria-label={t('attendance.datePickerAria')}
            className="w-full flex items-center gap-2 border border-border rounded-xl px-3 min-h-[48px] bg-card text-text cursor-pointer"
          >
            <CalendarDays size={20} className="text-primary shrink-0" />
            {/* بلا truncate (3A-324): السنة كانت تُبتر بـ «…» لأن
                شارة حالة الحفظ كانت تزاحم الزر في نفس الصف — الشارة
                انتقلت لصفّ التقدّم فصار للتاريخ عرض البطاقة كاملاً */}
            <span className="flex-1 text-start font-semibold text-[15px] whitespace-nowrap">
              {/^\d{4}-\d{2}-\d{2}$/.test(date)
                ? formatDateLabel(date).replace(' ', t('attendance.dateSeparator'))
                : t('attendance.pickSessionDate')}
            </span>
            <ChevronDown size={18} className="text-muted shrink-0" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onDateChange(e.target.value)}
            className="absolute inset-0 w-full opacity-0 pointer-events-none"
          />
        </div>
      </div>
      {paramMissing && (
        <p className="text-warn-text text-[13.5px] mt-2 mb-0">
          {t('attendance.paramSessionMissing')}
        </p>
      )}
      {pending ? (
        <Skeleton className="h-[44px] mt-3" />
      ) : error ? (
        <p className="text-bad-text text-[13.5px] mt-2 mb-0">
          {error instanceof Error ? error.message : t('common.unknownError')}
        </p>
      ) : groupsEmpty ? (
        <div className="mt-2">
          <EmptyState
            mascot
            icon={CalendarDays}
            title={t('attendance.noGroupsTitle')}
            hint={t('attendance.noGroupsHint')}
          />
        </div>
      ) : daySessions.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            mascot
            icon={CalendarX2}
            title={t('attendance.noSessionsTitle')}
            hint={t('attendance.noSessionsHint')}
          />
        </div>
      ) : (
        <>
          {daySessions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar chip-row-fade mt-3 -mx-1 ps-1 pe-10 pb-1">
              {daySessions.map((s) => (
                <Chip
                  key={s.id}
                  active={selected?.id === s.id}
                  onClick={() => onPickSession(s.id)}
                >
                  {s.group_name} · {formatTime12(s.start_time)}
                  {s.status === 'cancelled' ? t('attendance.chipCancelledSuffix') : ''}
                </Chip>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-[16px]">{selected.group_name}</span>
                {selected.kind === 'extra' && (
                  <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">{t('attendance.kindExtra')}</span>
                )}
                {selected.kind === 'moved' && (
                  <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">{t('attendance.kindMoved')}</span>
                )}
                {selected.status === 'cancelled' && (
                  <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">{t('attendance.kindCancelled')}</span>
                )}
              </div>
              <div className="text-muted text-[13.5px] mt-0.5">
                {t('attendance.sessionMeta', {
                  time: formatTime12(selected.start_time),
                  minutes: selected.duration_minutes,
                })}
                {selected.group_room
                  ? t('attendance.sessionMetaRoom', { room: selected.group_room })
                  : ''}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden">
                  <div
                    className={`h-full rounded-full ${done >= total && total > 0 ? 'bg-ok' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[13.5px] font-extrabold">
                  {t('attendance.markedCount', { done: rowsReady ? `${done}/${total}` : '…' })}
                </span>
                {/* شارة حالة الحفظ أُزيلت من هنا (3A-384 — ملاحظة
                    المالك ٢-و: لا كلام تقنياً عن الحفظ/المزامنة أمام
                    المستخدم؛ الحفظ الصامت هو الافتراضي، والفشل وحده
                    يظهر في شريط المزامنة) */}
              </div>
              {/* إلغاء/نقل الحصة: زرّان صغيران جنباً إلى جنب
                  (3A-384 — قاعدة المالك ٦: لا زر وحيداً على سطر
                  كامل، والأزرار الصغيرة متجاورة) */}
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant={cancelled ? 'primary' : 'ghost'}
                  onClick={onToggleSessionStatus}
                  disabled={statusPending}
                >
                  {cancelled ? (<><Undo2 size={16} /> {t('attendance.restoreSession')}</>) : (<><CalendarX2 size={16} /> {t('attendance.cancelSession')}</>)}
                </Button>
                <Link to="/schedule" className="no-underline">
                  <Button size="sm" variant="ghost">
                    <ArrowLeftRight size={16} />
                    {t('attendance.moveSession')}
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
