import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import {
  AlertTriangle,
  Ban,
  BookOpenCheck,
  CalendarDays,
  CalendarX2,
  Check,
  CheckCheck,
  MessageCircle,
  ScanQrCode,
  Star,
  Undo2,
  Users,
} from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, Field, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { shortTime } from '../../lib/format'
import type { AttendanceStatus } from '../../types/database'
import { useGroups } from '../groups/hooks'
import { formatDateLabel, generationWindowMonths, monthStartStr, todayStr } from '../schedule/api'
import { useGeneration, useSetSessionStatus } from '../schedule/hooks'
import {
  ATTENDANCE_STATUSES,
  EMPTY_VALUE,
  STATUS_ACTIVE_CLASS,
  STATUS_FILL,
  absenceWaUrl,
  type AttendanceValue,
  type SessionWithGroup,
} from './api'
import {
  ATT,
  useDaySessions,
  useGuardianContacts,
  useMonthHasInvoices,
  useSaveAttendance,
  useSaveManyAttendance,
  useSessionAttendance,
  useSessionById,
  useSessionRoster,
} from './hooks'
import { QrScannerSheet, type ScanOutcome } from './QrScannerSheet'
import { findStudentByCode, normalizeScannedCode } from './qr'

/**
 * الحضور (المواصفات §3.2): تسجيل حضور حصة واحدة من جدول sessions الحقيقي —
 * اختيار حصة (افتراضياً حصة اليوم، أو الحصة الممرّرة برابط ?session=)،
 * قائمة طلاب المجموعة النشطين، الحالات الأربع (p/a/l/m في المخطط) مع
 * الواجب (homework_done) والتمييز (starred) في نفس صف attendance،
 * حفظ فوري بـ upsert على (session_id, student_id)، وإبلاغ غياب واتساب.
 * عدّاد التقدّم (done/total) هو نفس تعريف الرئيسية: طلاب لهم status مسجل.
 */
export function AttendancePage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const paramSessionId = searchParams.get('session') ?? searchParams.get('sessionId')

  const today = todayStr()
  const [date, setDate] = useState(today)
  const [pickedId, setPickedId] = useState<string | null>(null)
  // وضع مسح QR (خطوة 4): الكاميرا لا تُفتح إلا بضغط الزر صراحةً، وصفّ آخر
  // طالب سُجّل بالمسح يومض في القائمة بعد إغلاق الماسح (flashId)
  const [scanOpen, setScanOpen] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toast = useToast()

  // الحصة الممرّرة من رابط (الرئيسية/الجدول): تُختار تلقائياً ويُضبط تاريخها
  const paramQ = useSessionById(teacherId, paramSessionId ?? undefined)
  const appliedParam = useRef<string | null>(null)
  useEffect(() => {
    if (paramQ.data && appliedParam.current !== paramQ.data.id) {
      appliedParam.current = paramQ.data.id
      setDate(paramQ.data.session_date)
      setPickedId(paramQ.data.id)
    }
  }, [paramQ.data])

  const groupsQ = useGroups(teacherId)
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  // توليد حصص شهور العرض (نفس آلية الجدول) قبل قراءة حصص اليوم المختار
  const neededMonths = useMemo(() => {
    const set = new Set<string>([...generationWindowMonths(today), monthStartStr(date)])
    return [...set].sort()
  }, [today, date])
  const genQ = useGeneration(teacherId, groupsQ.data, neededMonths)
  const dayQ = useDaySessions(teacherId, date, genQ.isSuccess)
  const daySessions = useMemo(() => dayQ.data ?? [], [dayQ.data])

  const selected: SessionWithGroup | null = useMemo(() => {
    if (daySessions.length === 0) {
      return paramQ.data && paramQ.data.session_date === date ? paramQ.data : null
    }
    return (
      daySessions.find((s) => s.id === pickedId) ??
      daySessions.find((s) => s.status === 'scheduled') ??
      daySessions[0]
    )
  }, [daySessions, pickedId, paramQ.data, date])
  const selectedId = selected?.id

  const rosterQ = useSessionRoster(teacherId, selected?.group_id)
  const roster = useMemo(() => rosterQ.data ?? [], [rosterQ.data])
  const studentIds = useMemo(() => roster.map((s) => s.id), [roster])
  const contactsQ = useGuardianContacts(teacherId, studentIds)
  const attQ = useSessionAttendance(teacherId, selectedId)
  const invoicesQ = useMonthHasInvoices(teacherId, selected?.group_id, selected?.session_date)

  // القيم الفعّالة = صفوف القاعدة + تجاوزات محلية متفائلة للحصة المختارة فقط،
  // وكل تعديل يُحفظ فوراً (upsert)؛ عند خطأ الحفظ تسقط التجاوزات ونعود لقاعدة البيانات.
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
  const saveManyMut = useSaveManyAttendance(teacherId ?? '')
  const statusMut = useSetSessionStatus(teacherId ?? '')

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const cancelled = selected?.status === 'cancelled'
  const group = selected ? groupById.get(selected.group_id) : undefined
  const rowsReady = Boolean(selected && attQ.data)
  const valueOf = (studentId: string): AttendanceValue =>
    (overrideState && selected && overrideState.sessionId === selected.id
      ? overrideState.values.get(studentId)
      : undefined) ??
    serverMap.get(studentId) ??
    EMPTY_VALUE
  const done = roster.filter((s) => valueOf(s.id).status != null).length
  const total = roster.length
  // عدّادات حية لكل حالة — تتحدث مع كل تعديل (شريط الملخص اللاصق)
  const statusCounts: Record<'p' | 'a' | 'l' | 'm' | 'none', number> = { p: 0, a: 0, l: 0, m: 0, none: 0 }
  for (const s of roster) {
    const st = valueOf(s.id).status
    if (st) statusCounts[st] += 1
    else statusCounts.none += 1
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const anyNotPresent = roster.some((s) => valueOf(s.id).status !== 'p')
  const saving = saveMut.isPending || saveManyMut.isPending

  const resyncAfterError = () => {
    setOverrideState(null)
    void qc.invalidateQueries({ queryKey: [ATT] })
  }

  const applyOverride = (entries: { studentId: string; value: AttendanceValue }[]) => {
    if (!selected) return
    setOverrideState((prev) => {
      const values =
        prev && prev.sessionId === selected.id ? new Map(prev.values) : new Map<string, AttendanceValue>()
      for (const e of entries) values.set(e.studentId, e.value)
      return { sessionId: selected.id, values }
    })
  }

  const changeValue = (studentId: string, patch: Partial<AttendanceValue>) => {
    if (!selected || cancelled) return
    const next = { ...valueOf(studentId), ...patch }
    applyOverride([{ studentId, value: next }])
    saveMut.mutate(
      { sessionId: selected.id, studentId, value: next },
      {
        onError: () => {
          toast('حصلت مشكلة في حفظ الحضور — رجّعنا آخر حالة محفوظة')
          resyncAfterError()
        },
      },
    )
  }

  /**
   * معالجة كود ممسوح/مكتوب من الماسح (خطوة 4): المطابقة ضد قائمة الحصة
   * المختارة حالياً فقط، والتسجيل بنفس changeValue الحالية حرفياً
   * (upsert متفائل على (session_id, student_id) + نفس الإبطال) فتنعكس
   * العدّادات وشريط الملخص فوراً. كود غير معروف/طالب خارج الحصة: لا تسجيل.
   */
  const handleScan = (raw: string): ScanOutcome => {
    const student = findStudentByCode(roster, raw)
    if (!student) return { kind: 'unknown', code: normalizeScannedCode(raw) ?? raw.trim() }
    if (cancelled) return { kind: 'cancelled' }
    if (valueOf(student.id).status === 'p') return { kind: 'already', studentName: student.name }
    changeValue(student.id, { status: 'p' })
    setFlashId(student.id)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), 2400)
    return { kind: 'marked', studentName: student.name }
  }

  const markAllPresent = () => {
    if (!selected || cancelled) return
    const entries = roster.map((s) => ({
      studentId: s.id,
      value: { ...valueOf(s.id), status: 'p' as AttendanceStatus },
    }))
    applyOverride(entries)
    saveManyMut.mutate(
      { sessionId: selected.id, entries },
      {
        onError: () => {
          toast('حصلت مشكلة في حفظ الحضور — رجّعنا آخر حالة محفوظة')
          resyncAfterError()
        },
      },
    )
  }

  const toggleSessionStatus = () => {
    if (!selected) return
    statusMut.mutate(
      { sessionId: selected.id, status: cancelled ? 'scheduled' : 'cancelled' },
      {
        onSuccess: () => {
          toast(cancelled ? 'تم استرجاع الحصة' : 'تم إلغاء الحصة')
          void qc.invalidateQueries({ queryKey: [ATT] })
        },
        onError: () => toast('حصلت مشكلة — حاول تاني'),
      },
    )
  }

  const pickerPending = groupsQ.isPending || genQ.isPending || dayQ.isPending
  const pickerError = groupsQ.error ?? genQ.error ?? dayQ.error ?? paramQ.error

  return (
    <div>
      {/* اختيار الحصة: التاريخ + حصص اليوم */}
      <Card>
        <Field label="تاريخ الحصة">
          <TextInput
            type="date"
            dir="ltr"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setPickedId(null)
            }}
          />
        </Field>
        {paramSessionId && paramQ.isSuccess && !paramQ.data && (
          <p className="text-warn-text text-[13.5px] mb-2">
            الحصة المطلوبة من الرابط غير موجودة — اختر حصة من حصص اليوم المختار.
          </p>
        )}
        {pickerPending ? (
          <Skeleton className="h-[44px]" />
        ) : pickerError ? (
          <p className="text-bad-text text-[13.5px] mb-0">
            {pickerError instanceof Error ? pickerError.message : 'خطأ غير معروف'}
          </p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="لا توجد مجموعات بعد — فلا حصص تُولّد"
            hint="أنشئ مجموعة وحدد أيامها وميعادها، وحصصها هتتولّد تلقائياً وتظهر هنا للتحضير."
          />
        ) : daySessions.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="لا توجد حصص في اليوم ده"
            hint="جرّب تاريخاً تاني، أو راجع جدول المجموعات من شاشة الجدول."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {daySessions.map((s) => {
              const active = selected?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPickedId(s.id)}
                  className={`text-start border rounded-xl px-3 py-2.5 min-h-[48px] cursor-pointer ${
                    active
                      ? 'border-primary bg-soft'
                      : 'border-border bg-card hover:bg-soft'
                  } ${s.status === 'cancelled' ? 'opacity-70' : ''}`}
                >
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[16px]">{s.group_name}</span>
                    {s.kind === 'extra' && (
                      <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">إضافية</span>
                    )}
                    {s.kind === 'moved' && (
                      <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">منقولة</span>
                    )}
                    {s.status === 'cancelled' && (
                      <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">ملغاة</span>
                    )}
                  </span>
                  <span className="block text-muted text-[13.5px] mt-0.5">
                    الساعة {shortTime(s.start_time)} · {s.duration_minutes} دقيقة
                    {s.group_room ? ` · ${s.group_room}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {selected && (
        <>
          {/* شريط الملخص: الحصة والتقدّم والحفظ */}
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-extrabold text-[16px]">{selected.group_name}</div>
                <div className="text-muted text-[13.5px]">
                  {formatDateLabel(selected.session_date)} · الساعة {shortTime(selected.start_time)} ·{' '}
                  {selected.duration_minutes} دقيقة
                  {selected.group_room ? ` · ${selected.group_room}` : ''}
                </div>
              </div>
              <span className="shrink-0 type-badge text-muted inline-flex items-center gap-1">
                {saving ? (
                  'بنحفظ…'
                ) : (
                  <>
                    <Check size={14} className="text-ok-text" />
                    الحفظ فوري
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden">
                <div
                  className={`h-full rounded-full ${done >= total && total > 0 ? 'bg-ok' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[13.5px] font-extrabold">
                {rowsReady ? `${done}/${total}` : '…'} محضّر
              </span>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {!cancelled && rowsReady && (
                <Button onClick={() => setScanOpen(true)}>
                  <ScanQrCode size={20} />
                  مسح QR
                </Button>
              )}
              {!cancelled && anyNotPresent && rowsReady && (
                <Button variant="soft" onClick={markAllPresent} disabled={saveManyMut.isPending}>
                  <CheckCheck size={20} />
                  حاضر للكل
                </Button>
              )}
              <Button
                variant={cancelled ? 'primary' : 'ghost'}
                onClick={toggleSessionStatus}
                disabled={statusMut.isPending}
              >
                {cancelled ? (<><Undo2 size={20} /> استرجاع الحصة</>) : 'إلغاء الحصة'}
              </Button>
              <Link to="/schedule" className="no-underline">
                <Button variant="ghost">نقل الحصة من الجدول</Button>
              </Link>
            </div>
          </Card>

          {cancelled && (
            <div className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-start gap-2">
              <Ban size={20} className="shrink-0 mt-0.5" />
              <span>الحصة دي ملغاة — الحضور مقفول ومش هيتسجل لها أي حالة. استرجع الحصة الأول لو عايز تحضّرها.</span>
            </div>
          )}

          {invoicesQ.data && (
            <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2 mb-3 text-[13.5px] flex items-start gap-2">
              <AlertTriangle size={20} className="shrink-0 mt-0.5 text-warn-text" />
              <span>تم إصدار فواتير هذا الشهر؛ أي تعديل في الحضور سيسجل كتسوية مالية.</span>
            </div>
          )}

          {group && group.links.length > 0 && (
            <Card>
              <div className="font-bold text-[15px] mb-2">روابط الملازم والواجبات</div>
              <div className="flex flex-col gap-1.5">
                {group.links.map((l) => (
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-[13.5px] break-all"
                    dir="ltr"
                  >
                    {l}
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* قائمة الطلاب والحالات */}
          {rosterQ.isPending || attQ.isPending || !rowsReady ? (
            <>
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px]" />
            </>
          ) : rosterQ.error || attQ.error ? (
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
          ) : roster.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="لا يوجد طلاب نشطون مسجلون في المجموعة دي"
                hint="سجّل طلاباً في المجموعة من ملفاتهم أو من صفحة المجموعة، وهيظهروا هنا للتحضير."
              />
            </Card>
          ) : (
            <>
              {/* صف الطالب التوقيعي: أفاتار 40 + اسم 15/600 + مبدّل 4 حالات
                  بأهداف لمس 48px — سطر واحد بارتفاع 64–72px من عرض 480px،
                  والمبدّل ينزل لسطر كامل تحت الاسم في الشاشات الأضيق.
                  الافتراضي بصرياً «حاضر» أولاً، والنقر للاستثناءات فقط،
                  و«الكل حاضر» في الشريط اللاصق يعلّم الجميع دفعة واحدة. */}
              <Card className="p-0 overflow-hidden">
                {roster.map((st, i) => {
                  const v = valueOf(st.id)
                  const wa = v.status === 'a'
                    ? absenceWaUrl(st, contactsQ.data?.get(st.id), selected.session_date)
                    : null
                  return (
                    <div
                      key={st.id}
                      className={`px-3 py-2 ${i > 0 ? 'border-t border-border' : ''} ${
                        flashId === st.id ? 'att-row-flash' : ''
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
                            <div className="text-muted text-[13.5px] leading-[1.5] flex items-center gap-1.5">
                              <span dir="ltr">{st.public_code}</span>
                              {v.homework_done && (
                                <span className="inline-flex items-center gap-1 text-ok-text font-semibold">
                                  <Check size={14} />
                                  سلّم الواجب
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={cancelled}
                            onClick={() => changeValue(st.id, { starred: !v.starred })}
                            className="shrink-0 w-12 h-12 flex items-center justify-center bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title={v.starred ? 'متميز — اضغط لإلغاء التمييز' : 'تمييز الطالب'}
                            aria-label={v.starred ? 'إلغاء تمييز الطالب' : 'تمييز الطالب'}
                          >
                            <Star
                              size={24}
                              className={v.starred ? 'text-accent' : 'text-muted'}
                              fill={v.starred ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                        <div className="flex gap-1 mt-1.5 min-[480px]:mt-0 min-[480px]:flex-1" role="radiogroup" aria-label={`حالة ${st.name}`}>
                          {ATTENDANCE_STATUSES.map(({ code, label }) => {
                            const active = v.status === code
                            return (
                              <button
                                key={code}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={cancelled}
                                onClick={() => changeValue(st.id, { status: code })}
                                className={`flex-1 min-h-[48px] rounded-xl text-[13.5px] font-bold border cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ${
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
                              إبلاغ ولي الأمر بالغياب
                            </Button>
                          </a>
                        ) : (
                          <div className="text-muted text-[13.5px] mt-2">
                            لا يوجد رقم ولي أمر أو موبايل طالب مسجل لإبلاغ الغياب.
                          </div>
                        ))}
                    </div>
                  )
                })}
              </Card>

              {/* تسليم الواجب — رقائق بأسماء الطلاب (المرجع §3.2) */}
              <Card>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-bold text-[15px]">تسليم الواجب</div>
                  <Link
                    to={`/homework?group=${selected.group_id}&session=${selected.id}`}
                    className="inline-flex items-center gap-1.5 text-primary text-[13.5px] font-bold no-underline min-h-[48px]"
                  >
                    <BookOpenCheck size={18} />
                    متابعة منظمة
                  </Link>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {roster.map((st) => {
                    const v = valueOf(st.id)
                    return (
                      <Chip
                        key={st.id}
                        active={v.homework_done}
                        onClick={() => {
                          if (!cancelled) changeValue(st.id, { homework_done: !v.homework_done })
                        }}
                      >
                        {v.homework_done && <Check size={16} />}{st.name}
                      </Chip>
                    )
                  })}
                </div>
                <p className="text-muted text-[13.5px] mt-2 mb-0">
                  اضغط اسم الطالب لتبديل تسليم الواجب — بيتحفظ فوراً مع باقي بيانات حضوره.
                </p>
              </Card>

              {/* شريط ملخص لاصق: عدّادات حية لكل حالة + «الكل حاضر» —
                  يطفو فوق الشريط السفلي أثناء تمرير القائمة ويتحدث مع كل تعديل */}
              <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-10 mt-1">
                <div className="bg-card border border-border shadow-raised rounded-2xl px-3 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  {ATTENDANCE_STATUSES.map(({ code, label }) => (
                    <span key={code} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_FILL[code] }}
                        aria-hidden="true"
                      />
                      {label} {statusCounts[code]}
                    </span>
                  ))}
                  <span className="text-[13.5px] font-semibold text-muted">
                    {statusCounts.none > 0 ? `باقي ${statusCounts.none} بلا حالة` : 'الكل اتحضّر'}
                  </span>
                  {!cancelled && (
                    <Button
                      variant="soft"
                      className="ms-auto min-h-[48px] text-[13.5px] px-3"
                      onClick={() => setScanOpen(true)}
                    >
                      <ScanQrCode size={18} />
                      مسح QR
                    </Button>
                  )}
                  {!cancelled && anyNotPresent && (
                    <Button
                      variant="soft"
                      className="min-h-[48px] text-[13.5px] px-3"
                      onClick={markAllPresent}
                      disabled={saveManyMut.isPending}
                    >
                      <CheckCheck size={18} />
                      الكل حاضر
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ماسح QR (خطوة 4): يُركّب فقط عند الفتح الصريح — الكاميرا تُطلب
          وتُوقف مع تركيبه/فكّه، والتسجيل يمرّ بـ handleScan ← changeValue */}
      {scanOpen && selected && (
        <QrScannerSheet
          sessionLabel={`${selected.group_name} · ${formatDateLabel(selected.session_date)} · الساعة ${shortTime(selected.start_time)}`}
          done={done}
          total={total}
          onScan={handleScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  )
}
