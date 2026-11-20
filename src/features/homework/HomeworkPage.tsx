import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  BookOpenCheck,
  CalendarX2,
  Check,
  ClipboardList,
  Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import {
  ErrorState,
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
  Skeleton,
} from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatTime12 } from '../../lib/format'
import {
  EMPTY_VALUE,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  isAttended,
  type AttendanceValue,
} from '../attendance/api'
import {
  ATT,
  useSaveAttendance,
  useSessionAttendance,
  useSessionById,
  useSessionRoster,
} from '../attendance/hooks'
import { useGroups } from '../groups/hooks'
import { formatDateLabel, generationWindowMonths, monthStartStr, todayStr } from '../schedule/api'
import { useGeneration } from '../schedule/hooks'
import { summarizeHomework, type HomeworkSummary } from './api'
import { useGroupSessions, useHomeworkMarks } from './hooks'

/**
 * متابعة الواجبات المنظمة (خطوة 6 — Phase 2، بحث §3 بند 3): مين سلّم ومين
 * لسه لكل مجموعة وحصة، فوق بيانات الواجب الموجودة أصلاً في الحضور.
 *
 * موضع الدخول: شاشة مستقلة /homework (من «المزيد» + زر في تفاصيل المجموعة
 * + رابط من بطاقة الواجب في شاشة الحضور) بلا تبويب سفلي جديد، وروابط
 * عميقة ‎?group=‎ و‎?session=‎ تفتح المتابعة على المجموعة/الحصة المطلوبة.
 *
 * مصدر الحقيقة واحد: الواجب هو attendance.homework_done في نفس صف حضور
 * الطالب للحصة، والقراءة هنا من نفس استعلامات الحضور وبنفس مفاتيح الكاش
 * (ATT)، والكتابة بنفس useSaveAttendance حرفياً — upsert على
 * ‎(session_id, student_id)‎ بقيمة الحضور الكاملة (الحالة والتمييز محفوظان
 * كما هما، يتبدّل homework_done فقط). طالب بلا صف حضور: سلوك شاشة الحضور
 * نفسه — التبديل ينشئ الصف بقيمته الحالية + الواجب (أو يحذفه لو رجعت
 * القيمة فارغة تماماً)، فلا صفوف تُخترع خارج هذا المسار ولا مسار موازٍ.
 *
 * العدّادات للحاضرين أساساً (status في p/l/m): سلّم N + لم يسلّم M = K
 * حاضرين دائماً. الغائب وبلا-حالة في قسم منفصل تحت القائمتين: لا يُحسبون،
 * لكن علامة واجبهم (إن وُجدت) محفوظة وتظهر، وتُحتسب تلقائياً لو اتسجّل
 * حضورهم — بلا قواعد مخترعة فوق سلوك البيانات الحالي.
 */

const PICKER_LIMIT = 12

function HwToggle({
  done,
  disabled,
  onToggle,
}: {
  done: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={done}
      disabled={disabled}
      onClick={onToggle}
      title={done ? 'اضغط لتعليمه «لم يسلّم»' : 'اضغط لتعليمه «سلّم الواجب»'}
      className={`shrink-0 min-h-[48px] px-3.5 rounded-full border text-[13.5px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        done
          ? 'bg-ok-soft text-ok-text border-ok/40'
          : 'bg-card text-muted border-border hover:bg-soft'
      }`}
    >
      {done ? <Check size={16} /> : <BookOpenCheck size={16} />}
      {done ? 'سلّم' : 'لم يسلّم'}
    </button>
  )
}

export function HomeworkPage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const paramGroupId = searchParams.get('group')
  const paramSessionId = searchParams.get('session') ?? searchParams.get('sessionId')
  const today = todayStr()

  const [pickedGroupId, setPickedGroupId] = useState<string | null>(null)
  const [pickedSessionId, setPickedSessionId] = useState<string | null>(null)

  const groupsQ = useGroups(teacherId)
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])
  const groupId =
    (pickedGroupId && groups.some((g) => g.id === pickedGroupId) ? pickedGroupId : null) ??
    (paramGroupId && groups.some((g) => g.id === paramGroupId) ? paramGroupId : null) ??
    groups[0]?.id
  const group = groups.find((g) => g.id === groupId)

  // الحصة الممرّرة برابط عميق قد تكون خارج قائمة أحدث حصص المجموعة
  const paramQ = useSessionById(teacherId, paramSessionId ?? undefined)
  const appliedParam = useRef<string | null>(null)
  useEffect(() => {
    if (paramQ.data && appliedParam.current !== paramQ.data.id) {
      appliedParam.current = paramQ.data.id
      setPickedGroupId(paramQ.data.group_id)
      setPickedSessionId(paramQ.data.id)
    }
  }, [paramQ.data])

  // توليد حصص نافذة العرض (نفس آلية الحضور/الجدول) قبل قراءة حصص المجموعة
  const neededMonths = useMemo(() => {
    const set = new Set<string>(generationWindowMonths(today))
    if (paramQ.data) set.add(monthStartStr(paramQ.data.session_date))
    return [...set].sort()
  }, [today, paramQ.data])
  const genQ = useGeneration(teacherId, groupsQ.data, neededMonths)

  const sessionsQ = useGroupSessions(teacherId, groupId, genQ.isSuccess)
  const sessions = useMemo(() => {
    const list = sessionsQ.data ?? []
    if (
      paramQ.data &&
      paramQ.data.group_id === groupId &&
      !list.some((s) => s.id === paramQ.data!.id)
    ) {
      return [paramQ.data, ...list]
    }
    return list
  }, [sessionsQ.data, paramQ.data, groupId])

  // الافتراضي: آخر حصة فاتت أو النهاردة (أحدث تاريخ ≤ اليوم)، وإلا أقرب قادمة
  const defaultSessionId = useMemo(() => {
    if (sessions.length === 0) return undefined
    return (
      sessions.find((s) => s.session_date <= today)?.id ??
      sessions[sessions.length - 1].id
    )
  }, [sessions, today])
  const selectedId =
    (pickedSessionId && sessions.some((s) => s.id === pickedSessionId)
      ? pickedSessionId
      : null) ?? defaultSessionId
  const selected = sessions.find((s) => s.id === selectedId) ?? null

  const rosterQ = useSessionRoster(teacherId, groupId)
  const roster = useMemo(() => rosterQ.data ?? [], [rosterQ.data])
  const rosterIds = useMemo(() => new Set(roster.map((s) => s.id)), [roster])
  const attQ = useSessionAttendance(teacherId, selectedId)

  // ملخصات المنتقي/النظرة الإجمالية: علامات أحدث الحصص المعروضة + المختارة
  const shownSessions = useMemo(() => sessions.slice(0, PICKER_LIMIT), [sessions])
  const marksSessionIds = useMemo(() => {
    const ids = shownSessions.map((s) => s.id)
    if (selectedId && !ids.includes(selectedId)) ids.push(selectedId)
    return ids
  }, [shownSessions, selectedId])
  const marksQ = useHomeworkMarks(teacherId, marksSessionIds)
  const summaries = useMemo(() => {
    const map = new Map<string, HomeworkSummary>()
    const marks = marksQ.data ?? []
    for (const id of marksSessionIds) {
      map.set(
        id,
        summarizeHomework(marks.filter((m) => m.session_id === id && rosterIds.has(m.student_id))),
      )
    }
    return map
  }, [marksQ.data, marksSessionIds, rosterIds])

  // القيم الفعّالة للحصة المختارة = صفوف القاعدة + تجاوزات متفائلة محلية،
  // بنفس نمط شاشة الحضور: كل تبديل يُحفظ فوراً، وعند الخطأ نرجع للمحفوظ.
  const serverMap = useMemo(() => {
    const m = new Map<string, AttendanceValue>()
    for (const row of attQ.data ?? []) {
      m.set(row.student_id, {
        status: row.status,
        homework_done: row.homework_done,
        starred: row.starred,
      })
    }
    return m
  }, [attQ.data])
  const [overrideState, setOverrideState] = useState<{
    sessionId: string
    values: Map<string, AttendanceValue>
  } | null>(null)
  const saveMut = useSaveAttendance(teacherId ?? '')

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (groupsQ.isPending) return <LoadingState label="بنحمّل المجموعات…" />
  if (groupsQ.error)
    return (
      <ErrorState
        message={groupsQ.error instanceof Error ? groupsQ.error.message : 'خطأ غير معروف'}
        onRetry={() => void groupsQ.refetch()}
      />
    )
  if (groups.length === 0)
    return (
      <EmptyState
        icon={BookOpenCheck}
        title="لا توجد مجموعات بعد — فلا واجبات تُتابَع"
        hint="أنشئ مجموعة وسجّل حضور حصصها، ومتابعة تسليم الواجب هتظهر هنا لكل حصة."
      />
    )

  const cancelled = selected?.status === 'cancelled'
  const rowsReady = Boolean(selected && attQ.data)
  const valueOf = (studentId: string): AttendanceValue =>
    (overrideState && selected && overrideState.sessionId === selected.id
      ? overrideState.values.get(studentId)
      : undefined) ??
    serverMap.get(studentId) ??
    EMPTY_VALUE

  const detailSummary = selected
    ? summarizeHomework(roster.map((s) => valueOf(s.id)))
    : null
  const submittedList = roster.filter((s) => {
    const v = valueOf(s.id)
    return isAttended(v.status) && v.homework_done
  })
  const pendingList = roster.filter((s) => {
    const v = valueOf(s.id)
    return isAttended(v.status) && !v.homework_done
  })
  const othersList = roster.filter((s) => !isAttended(valueOf(s.id).status))

  const changeHomework = (studentId: string, done: boolean) => {
    if (!selected || cancelled) return
    const next = { ...valueOf(studentId), homework_done: done }
    setOverrideState((prev) => {
      const values =
        prev && prev.sessionId === selected.id
          ? new Map(prev.values)
          : new Map<string, AttendanceValue>()
      values.set(studentId, next)
      return { sessionId: selected.id, values }
    })
    saveMut.mutate(
      { sessionId: selected.id, studentId, value: next },
      {
        onError: () => {
          toast('حصلت مشكلة في حفظ الواجب — رجّعنا آخر حالة محفوظة')
          setOverrideState(null)
          void qc.invalidateQueries({ queryKey: [ATT] })
        },
      },
    )
  }

  const pickerPending = genQ.isPending || sessionsQ.isPending
  const pickerError = genQ.error ?? sessionsQ.error

  return (
    <div>
      <Card>
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
            <BookOpenCheck size={24} />
          </span>
          <div className="min-w-0">
            <div className="font-extrabold text-[16px]">متابعة الواجبات</div>
            <p className="text-muted text-[13.5px] mt-0.5 mb-0 leading-[1.7]">
              مين سلّم ومين لسه في كل حصة — نفس علامة الواجب اللي في شاشة الحضور،
              وأي تبديل هنا بيتحفظ فيها وينعكس هناك فوراً.
            </p>
          </div>
        </div>
      </Card>

      {/* اختيار المجموعة */}
      <ChipRow>
        {groups.map((g) => (
          <Chip
            key={g.id}
            active={g.id === groupId}
            onClick={() => {
              setPickedGroupId(g.id)
              setPickedSessionId(null)
            }}
          >
            {g.name}
          </Chip>
        ))}
      </ChipRow>

      {/* اختيار الحصة + النظرة الإجمالية: أحدث الحصص أولاً ونسبة تسليم كل حصة */}
      <h3 className="type-section mt-1 mb-2">حصص {group?.name ?? ''}</h3>
      {pickerPending ? (
        <>
          <Skeleton className="h-[64px] mb-3" />
          <Skeleton className="h-[64px]" />
        </>
      ) : pickerError ? (
        <ErrorState
          message={pickerError instanceof Error ? pickerError.message : 'خطأ غير معروف'}
          onRetry={() => void sessionsQ.refetch()}
        />
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarX2}
            title="لا توجد حصص للمجموعة دي لسه"
            hint="الحصص بتتولّد من أيام جدول المجموعة — راجع الجدول أو افتح شاشة الحضور لتوليد حصص الشهر."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden mb-4">
          {shownSessions.map((s, i) => {
            const active = selected?.id === s.id
            const sum = marksQ.data ? (summaries.get(s.id) ?? null) : null
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setPickedSessionId(s.id)}
                aria-pressed={active}
                className={`w-full text-start px-4 py-3 min-h-[64px] cursor-pointer border-0 ${
                  i > 0 ? 'border-t border-border' : ''
                } ${active ? 'bg-soft' : 'bg-card hover:bg-soft'}`}
              >
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[15px]">
                    {formatDateLabel(s.session_date)}
                  </span>
                  {s.session_date > today && (
                    <span className="text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5">
                      قادمة
                    </span>
                  )}
                  {s.kind === 'extra' && (
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">إضافية</span>
                  )}
                  {s.kind === 'moved' && (
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">منقولة</span>
                  )}
                  {s.status === 'cancelled' && (
                    <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">ملغاة</span>
                  )}
                  {sum && sum.rate != null && (
                    <span
                      className={`ms-auto text-[12px] font-bold rounded-full px-2 py-0.5 border ${
                        sum.rate >= 80
                          ? 'bg-ok-soft text-ok-text border-ok/30'
                          : 'bg-warn-soft text-warn-text border-warn/40'
                      }`}
                    >
                      سلّم {sum.rate}%
                    </span>
                  )}
                </span>
                <span className="block text-muted text-[13.5px] mt-0.5">
                  الساعة {formatTime12(s.start_time)}
                  {sum
                    ? sum.attended > 0
                      ? ` · سلّم ${sum.submitted} من ${sum.attended} حاضرين`
                      : ' · لسه مفيش حاضرين مسجلين'
                    : ''}
                </span>
                {sum && sum.attended > 0 && (
                  <span className="block h-1.5 rounded-full bg-border/60 overflow-hidden mt-2">
                    <span
                      className={`block h-full rounded-full ${sum.rate === 100 ? 'bg-ok' : 'bg-primary'}`}
                      style={{ width: `${sum.rate}%` }}
                    />
                  </span>
                )}
              </button>
            )
          })}
          {sessions.length > PICKER_LIMIT && (
            <p className="text-muted text-[13.5px] px-4 py-2.5 m-0 border-t border-border">
              بنعرض أحدث {PICKER_LIMIT} حصة — حصص أقدم من كده افتحها من شاشة الحضور أو الجدول.
            </p>
          )}
        </Card>
      )}

      {selected && (
        <>
          {/* ملخص الحصة المختارة: العدّادات للحاضرين أساساً وتتحدث فوراً */}
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-extrabold text-[16px]">{group?.name}</div>
                <div className="text-muted text-[13.5px]">
                  {formatDateLabel(selected.session_date)} · الساعة {formatTime12(selected.start_time)} ·{' '}
                  {selected.duration_minutes} دقيقة
                </div>
              </div>
              <span className="shrink-0 type-badge text-muted inline-flex items-center gap-1">
                {saveMut.isPending ? (
                  'بنحفظ…'
                ) : (
                  <>
                    <Check size={14} className="text-ok-text" />
                    الحفظ فوري
                  </>
                )}
              </span>
            </div>
            {detailSummary && (
              <>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-xl bg-ok-soft px-2 py-2.5">
                    <div className="text-[20px] font-extrabold text-ok-text leading-none">
                      {rowsReady ? detailSummary.submitted : '…'}
                    </div>
                    <div className="text-[13.5px] font-semibold text-ok-text mt-1">سلّم</div>
                  </div>
                  <div className="rounded-xl bg-warn-soft px-2 py-2.5">
                    <div className="text-[20px] font-extrabold text-warn-text leading-none">
                      {rowsReady ? detailSummary.pending : '…'}
                    </div>
                    <div className="text-[13.5px] font-semibold text-warn-text mt-1">لم يسلّم</div>
                  </div>
                  <div className="rounded-xl bg-soft px-2 py-2.5">
                    <div className="text-[20px] font-extrabold leading-none">
                      {rowsReady ? detailSummary.attended : '…'}
                    </div>
                    <div className="text-[13.5px] font-semibold text-muted mt-1">حاضرون</div>
                  </div>
                </div>
                {detailSummary.attended > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden">
                      <div
                        className={`h-full rounded-full ${detailSummary.rate === 100 ? 'bg-ok' : 'bg-primary'}`}
                        style={{ width: `${detailSummary.rate ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[13.5px] font-extrabold">
                      نسبة التسليم {detailSummary.rate}%
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Link to={`/attendance?session=${selected.id}`} className="no-underline">
                <Button variant="soft">
                  <ClipboardList size={20} />
                  فتح الحضور
                </Button>
              </Link>
            </div>
          </Card>

          {cancelled && (
            <div className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-start gap-2">
              <Ban size={20} className="shrink-0 mt-0.5" />
              <span>الحصة دي ملغاة — متابعة الواجب مقفولة زي الحضور بالظبط. استرجع الحصة من شاشة الحضور الأول.</span>
            </div>
          )}

          {rosterQ.error || attQ.error ? (
            <ErrorState
              message={
                (rosterQ.error ?? attQ.error) instanceof Error
                  ? ((rosterQ.error ?? attQ.error) as Error).message
                  : 'خطأ غير معروف'
              }
              onRetry={() => {
                void rosterQ.refetch()
                void attQ.refetch()
              }}
            />
          ) : rosterQ.isPending || attQ.isPending || !rowsReady ? (
            <>
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px]" />
            </>
          ) : roster.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="لا يوجد طلاب نشطون مسجلون في المجموعة دي"
                hint="سجّل طلاباً في المجموعة من ملفاتهم أو من صفحة المجموعة، وهيظهروا هنا لمتابعة واجبهم."
              />
            </Card>
          ) : (
            <>
              {detailSummary && detailSummary.attended === 0 && (
                <Card>
                  <EmptyState
                    icon={ClipboardList}
                    title="لسه مفيش حاضرين مسجلين في الحصة دي"
                    hint="متابعة الواجب بتتحسب للحاضرين — سجّل الحضور الأول من شاشة الحضور وهتظهر القائمتين هنا."
                  />
                </Card>
              )}

              {submittedList.length > 0 && (
                <>
                  <h3 className="type-section mt-4 mb-2">
                    سلّم الواجب ({submittedList.length})
                  </h3>
                  <Card className="p-0 overflow-hidden">
                    {submittedList.map((st, i) => {
                      const v = valueOf(st.id)
                      return (
                        <ListRow
                          key={st.id}
                          first={i === 0}
                          leading={<Avatar name={st.name} />}
                          title={
                            <Link to={`/students/${st.id}`} className="text-text no-underline">
                              {st.name}
                            </Link>
                          }
                          secondary={
                            <span className="inline-flex items-center gap-1.5">
                              <span dir="ltr">{st.public_code}</span>
                              {v.status && (
                                <span className={`type-badge rounded-full px-2 py-0.5 ${STATUS_BADGE_CLASS[v.status]}`}>
                                  {STATUS_LABELS[v.status]}
                                </span>
                              )}
                            </span>
                          }
                          trailing={
                            <HwToggle
                              done
                              disabled={cancelled}
                              onToggle={() => changeHomework(st.id, false)}
                            />
                          }
                        />
                      )
                    })}
                  </Card>
                </>
              )}

              {pendingList.length > 0 && (
                <>
                  <h3 className="type-section mt-4 mb-2">
                    لم يسلّم بعد ({pendingList.length})
                  </h3>
                  <Card className="p-0 overflow-hidden">
                    {pendingList.map((st, i) => {
                      const v = valueOf(st.id)
                      return (
                        <ListRow
                          key={st.id}
                          first={i === 0}
                          leading={<Avatar name={st.name} />}
                          title={
                            <Link to={`/students/${st.id}`} className="text-text no-underline">
                              {st.name}
                            </Link>
                          }
                          secondary={
                            <span className="inline-flex items-center gap-1.5">
                              <span dir="ltr">{st.public_code}</span>
                              {v.status && (
                                <span className={`type-badge rounded-full px-2 py-0.5 ${STATUS_BADGE_CLASS[v.status]}`}>
                                  {STATUS_LABELS[v.status]}
                                </span>
                              )}
                            </span>
                          }
                          trailing={
                            <HwToggle
                              done={false}
                              disabled={cancelled}
                              onToggle={() => changeHomework(st.id, true)}
                            />
                          }
                        />
                      )
                    })}
                  </Card>
                </>
              )}

              {othersList.length > 0 && (
                <>
                  <h3 className="type-section mt-4 mb-2">
                    خارج المتابعة ({othersList.length})
                  </h3>
                  <p className="text-muted text-[13.5px] mt-0 mb-2 leading-[1.7]">
                    الواجب بيُتابَع للحاضرين أساساً — دول مش محسوبين في عدّادات الحصة.
                    علامة تسليمهم (لو اتبدّلت) محفوظة في حضورهم، ولو اتسجّل حضورهم
                    هيتحسبوا في القائمتين تلقائياً.
                  </p>
                  <Card className="p-0 overflow-hidden">
                    {othersList.map((st, i) => {
                      const v = valueOf(st.id)
                      return (
                        <ListRow
                          key={st.id}
                          first={i === 0}
                          className="opacity-80"
                          leading={<Avatar name={st.name} />}
                          title={
                            <Link to={`/students/${st.id}`} className="text-text no-underline">
                              {st.name}
                            </Link>
                          }
                          secondary={
                            <span className="inline-flex items-center gap-1.5">
                              <span dir="ltr">{st.public_code}</span>
                              {v.status === 'a' ? (
                                <span className={`type-badge rounded-full px-2 py-0.5 ${STATUS_BADGE_CLASS.a}`}>
                                  غائب
                                </span>
                              ) : (
                                <span className="type-badge bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                                  بلا حالة حضور
                                </span>
                              )}
                            </span>
                          }
                          trailing={
                            <HwToggle
                              done={v.homework_done}
                              disabled={cancelled}
                              onToggle={() => changeHomework(st.id, !v.homework_done)}
                            />
                          }
                        />
                      )
                    })}
                  </Card>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
