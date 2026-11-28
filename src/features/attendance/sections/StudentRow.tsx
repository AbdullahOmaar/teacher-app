import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Clock,
  LogOut,
  MessageCircle,
  Star,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { formatClock12 } from '../../../lib/format'
import {
  ATTENDANCE_STATUSES,
  STATUS_ACTIVE_CLASS,
  isAttended,
  type AttendanceValue,
  type RosterStudent,
} from '../api'
import type { QueuedAttendanceItem } from '../offlineQueue'
import { t } from '../../../i18n'

/**
 * صف الطالب التوقيعي: أفاتار 40 + اسم 15/600 + مبدّل 4 حالات
 * بأهداف لمس 48px — سطر واحد بارتفاع 64–72px من عرض 480px،
 * والمبدّل ينزل لسطر كامل تحت الاسم في الشاشات الأضيق.
 * الافتراضي بصرياً «حاضر» أولاً، والنقر للاستثناءات فقط،
 * و«الكل حاضر» في الشريط اللاصق يعلّم الجميع دفعة واحدة.
 */
export function StudentRow({
  student: st,
  first,
  value: v,
  queueItem: qItem,
  leftAt,
  flash,
  cancelled,
  online,
  absenceWa: wa,
  markLeftPending,
  clearLeftPending,
  onChangeValue,
  onToggleLeft,
}: {
  student: RosterStudent
  first: boolean
  value: AttendanceValue
  queueItem: QueuedAttendanceItem | undefined
  leftAt: string | undefined
  flash: boolean
  cancelled: boolean
  online: boolean
  absenceWa: string | null
  markLeftPending: boolean
  clearLeftPending: boolean
  onChangeValue: (studentId: string, patch: Partial<AttendanceValue>) => void
  onToggleLeft: (studentId: string) => void
}) {
  // تأكيد بخطوتين قبل مسح الانصراف (3A-911): المسح يمحو سجلاً
  // محفوظاً بضغطة واحدة على زر أيقونة 36px ملاصق للنجمة (خطر لمس
  // خاطئ)، وتنبيه «غادر» لولي الأمر (0012) لا يتراجع بالمسح —
  // وإعادة التسجيل تبعته من جديد. النمط هو نمط التطبيق الخفيف
  // نفسه (AssistantKeyCard): أول ضغطة تُسلّح والثانية تنفّذ.
  // التسليح مربوط بقيمة الانصراف نفسها: أي تغيّر فيها (مسح/تسجيل
  // جديد) يُبطل التسليح اشتقاقاً وقت الرسم — بلا أثر جانبي.
  const [armedLeftAt, setArmedLeftAt] = useState<string | null>(null)
  const confirmClear = leftAt !== undefined && armedLeftAt === leftAt
  return (
    <div
      className={`px-3 py-2 ${first ? '' : 'border-t border-border'} ${
        flash ? 'att-row-flash' : ''
      }`}
    >
      <div className="min-[480px]:flex min-[480px]:items-center min-[480px]:gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 min-[480px]:w-[196px] min-[480px]:shrink-0">
          <Avatar name={st.name} />
          <div className="flex-1 min-w-0">
            <Link
              to={`/students/${st.id}`}
              className="block font-semibold text-[15px] leading-[1.6] text-text no-underline truncate"
            >
              {st.name}
            </Link>
            {/* كود الطالب لا يظهر في صفوف الحضور (و-5 —
                اتساقاً مع قرار الجولة الأولى في قائمة الطلاب؛
                يبقى في ملف الطالب وكارته). سطر الشارات يُركَّب
                فقط عند وجود شارة حتى لا يبقى سطر فارغ.
                (3A-384: شارة الانصراف وتلميح الأوفلاين انضما
                لهذا السطر — الزر نفسه صار أيقونة بجانب النجمة) */}
            {(v.homework_done || qItem || leftAt || (isAttended(v.status) && !online)) && (
            <div className="text-muted text-[13.5px] leading-[1.5] flex items-center gap-1.5 flex-wrap">
              {v.homework_done && (
                <span className="inline-flex items-center gap-1 text-ok-text font-semibold">
                  <Check size={14} />
                  {t('attendance.homeworkDone')}
                </span>
              )}
              {leftAt && (
                <span className="inline-flex items-center gap-1 text-primary font-semibold">
                  <LogOut size={14} />
                  {t('attendance.leftAt', { time: formatClock12(new Date(leftAt)) })}
                </span>
              )}
              {isAttended(v.status) && !leftAt && !online && (
                <span className="text-[12px]">
                  {t('attendance.leftNeedsOnline')}
                </span>
              )}
              {qItem && !qItem.failed && (
                <span className="inline-flex items-center gap-1 text-warn-text font-semibold">
                  <Clock size={14} />
                  {t('attendance.rowPending')}
                </span>
              )}
              {qItem?.failed && (
                <span className="inline-flex items-center gap-1 text-bad-text font-semibold">
                  <TriangleAlert size={14} />
                  {t('attendance.rowFailed')}
                </span>
              )}
            </div>
            )}
          </div>
          {/* (3A-651 — ملاحظة المالك ٩ بنصها: «خلي النجمه هي
              الي علي الشمال ويمكنها زرار تسجيل خروج ومتعملش
              المسافه الكبيرة دي»): عنقود الحافة اليسرى —
              الانصراف أولًا في DOM ثم النجمة، ففي RTL تظهر
              النجمة أقصى اليسار وزر الانصراف ملاصقًا لها
              على يمينها مباشرة، والزرّان صغيران (36px)
              بلا فجوة بينهما بدل صندوقي 48px متباعدين */}
          <div className="flex items-center shrink-0 -ms-1.5">
          {/* تسجيل الانصراف: أيقونة صغيرة بجانب النجمة
              (3A-384 — ملاحظة المالك ٢-ج) بدل زر عريض
              تحت الصف. الضبط يولّد تنبيه «غادر» في بوابة
              ولي الأمر (0012) — أونلاين فقط بوعي، لا يدخل
              قائمة مزامنة الأوفلاين */}
          {isAttended(v.status) &&
            (leftAt ? (
              confirmClear ? (
                <button
                  type="button"
                  disabled={cancelled || clearLeftPending}
                  onClick={() => {
                    setArmedLeftAt(null)
                    onToggleLeft(st.id)
                  }}
                  className="shrink-0 h-9 px-1.5 flex items-center justify-center bg-transparent border-0 cursor-pointer text-bad-text text-[12.5px] font-bold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={t('attendance.undoConfirm')}
                >
                  {t('attendance.undoConfirm')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={cancelled || clearLeftPending}
                  onClick={() => setArmedLeftAt(leftAt)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center bg-transparent border-0 cursor-pointer text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('attendance.undo')}
                  aria-label={t('attendance.undo')}
                >
                  <Undo2 size={20} />
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={cancelled || !online || markLeftPending}
                onClick={() => onToggleLeft(st.id)}
                className="shrink-0 w-9 h-9 flex items-center justify-center bg-transparent border-0 cursor-pointer text-muted disabled:opacity-40 disabled:cursor-not-allowed"
                title={t('attendance.markLeft')}
                aria-label={t('attendance.markLeft')}
              >
                <LogOut size={20} />
              </button>
            ))}
          <button
            type="button"
            disabled={cancelled}
            onClick={() => onChangeValue(st.id, { starred: !v.starred })}
            className="shrink-0 w-9 h-9 flex items-center justify-center bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={v.starred ? t('attendance.starUnmarkTitle') : t('attendance.starMark')}
            aria-label={v.starred ? t('attendance.starUnmarkAria') : t('attendance.starMark')}
          >
            <Star
              size={22}
              className={v.starred ? 'text-accent' : 'text-muted'}
              fill={v.starred ? 'currentColor' : 'none'}
            />
          </button>
          </div>
        </div>
        <div className="flex gap-1 mt-1.5 min-[480px]:mt-0 min-[480px]:flex-1" role="radiogroup" aria-label={t('attendance.statusAria', { name: st.name })}>
          {ATTENDANCE_STATUSES.map(({ code, label }) => {
            const active = v.status === code
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={cancelled}
                onClick={() => onChangeValue(st.id, { status: code })}
                className={`flex-1 min-h-[40px] rounded-[10px] text-[13.5px] font-bold border cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ${
                  active
                    ? STATUS_ACTIVE_CLASS[code]
                    : 'bg-card text-muted border-border hover:bg-soft'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
      {v.status === 'a' &&
        (wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className="no-underline inline-block mt-2">
            <Button variant="soft" className="min-h-[48px] text-[13.5px] px-3">
              <MessageCircle size={20} />
              {t('attendance.notifyAbsence')}
            </Button>
          </a>
        ) : (
          <div className="text-muted text-[13.5px] mt-2">
            {t('attendance.noGuardianPhone')}
          </div>
        ))}
      {/* الانصراف صار أيقونة بجانب النجمة في ترويسة
          الصف (3A-384) وحالته في سطر الشارات — لا كتلة
          أزرار تحت الصف بعد الآن */}
    </div>
  )
}
