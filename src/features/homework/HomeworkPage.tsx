import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Ban,
  BookOpenCheck,
  CalendarX2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { ListRow } from '../../components/ui/ListRow'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow } from '../../components/ui/form'
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
  useSessionAttendance,
  useSessionById,
  useSessionRoster,
} from '../attendance/hooks'
import { enqueueStored } from '../attendance/offlineQueue'
import { useOfflineSync, useOnlineStatus } from '../attendance/useOfflineSync'
import { SyncStatusBar } from '../attendance/SyncStatusBar'
import { useGroups } from '../groups/hooks'
import { SG } from '../students/hooks'
import { formatDateLabel, generationWindowMonths, monthStartStr, todayStr } from '../schedule/api'
import { SCHED, useGeneration } from '../schedule/hooks'
import { summarizeHomework, type HomeworkSummary } from './api'
import { t } from '../../i18n'
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
 * (ATT)، والكتابة بنفس مسار حفظ الحضور الموحّد (قائمة المزامنة +
 * دفعة الحصة المجمّعة) — upsert على
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
      title={done ? t('homework.toggleTitleDone') : t('homework.toggleTitleNotDone')}
      className={`shrink-0 min-h-[48px] px-3.5 rounded-full border text-[13.5px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        done
          ? 'bg-ok-soft text-ok-text border-ok/40'
          : 'bg-card text-muted border-border hover:bg-soft'
      }`}
    >
      {done ? <Check size={16} /> : <BookOpenCheck size={16} />}
      {done ? t('homework.submitted') : t('homework.notSubmitted')}
    </button>
  )
}

export function HomeworkPage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const paramGroupId = searchParams.get('group')
  const paramSessionId = searchParams.get('session') ?? searchParams.get('sessionId')
  const today = todayStr()

  const [pickedGroupId, setPickedGroupId] = useState<string | null>(null)
  const [pickedSessionId, setPickedSessionId] = useState<string | null>(null)
  // قسم «الحصص القادمة» مطوي افتراضياً (W1-2): يُفتح يدوياً، ويظهر
  // مفتوحاً باشتقاق لو الحصة المختارة نفسها قادمة (انظر futureShown)
  const [futureOpen, setFutureOpen] = useState(false)

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

  // تقسيم الحصص (W1-2): الماضي واليوم أولاً — القائمة القادمة من الـ API
  // تنازلية (الأحدث أولاً) فالماضي فيها جاهز بأحدث حصة فعلية في المقدمة؛
  // والمستقبل يُعكَس ليبدأ بأقرب حصة قادمة، ويُعرض في قسم مطوي منفصل
  // بدل ما يزحم مقدمة المنتقي بحصص «لسه مفيش حاضرين» لأسابيع قدام.
  const pastSessions = useMemo(
    () => sessions.filter((s) => s.session_date <= today),
    [sessions, today],
  )
  const futureSessions = useMemo(
    () => sessions.filter((s) => s.session_date > today).reverse(),
    [sessions, today],
  )

  // الافتراضي: آخر حصة فاتت أو النهاردة (أحدث تاريخ ≤ اليوم)، وإلا أقرب قادمة
  const defaultSessionId = useMemo(() => {
    if (sessions.length === 0) return undefined
    return pastSessions[0]?.id ?? futureSessions[0]?.id
  }, [sessions.length, pastSessions, futureSessions])
  const selectedId =
    (pickedSessionId && sessions.some((s) => s.id === pickedSessionId)
      ? pickedSessionId
      : null) ?? defaultSessionId
  const selected = sessions.find((s) => s.id === selectedId) ?? null

  // حصة مختارة قادمة (رابط عميق/اختيار يدوي) ⇒ قسمها المطوي مفتوح
  // باشتقاق مباشر حتى يراها المدرس مختارة في موضعها (يُطوى باختيار
  // حصة فاتت ثم طيّه يدوياً)
  const futureShown =
    futureOpen || (selected != null && selected.session_date > today)

  const rosterQ = useSessionRoster(teacherId, groupId)
  const roster = useMemo(() => rosterQ.data ?? [], [rosterQ.data])
  const rosterIds = useMemo(() => new Set(roster.map((s) => s.id)), [roster])
  const attQ = useSessionAttendance(teacherId, selectedId)

  // ملخصات المنتقي/النظرة الإجمالية: علامات الحصص المعروضة في القسمين
  // (أحدث حصص الماضي + أقرب الحصص القادمة) + الحصة المختارة دائماً
  const shownPast = useMemo(() => pastSessions.slice(0, PICKER_LIMIT), [pastSessions])
  const shownFuture = useMemo(
    () => futureSessions.slice(0, PICKER_LIMIT),
    [futureSessions],
  )
  const shownSessions = useMemo(
    () => [...shownPast, ...shownFuture],
    [shownPast, shownFuture],
  )
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
  // محرك مزامنة الحضور (يُركَّب هنا أيضاً حتى تُفرَّغ تبديلات الواجب
  // مجمّعة حتى لو لم تُفتح شاشة الحضور — التشغيل الفعلي وحيد عالمياً)
  const sync = useOfflineSync(teacherId)
  const online = useOnlineStatus()

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (groupsQ.isPending) return <LoadingState label={t('homework.loadingGroups')} />
  if (groupsQ.error)
    return (
      <ErrorState
        message={groupsQ.error instanceof Error ? groupsQ.error.message : t('common.unknownError')}
        onRetry={() => void groupsQ.refetch()}
      />
    )
  if (groups.length === 0)
    return (
      <EmptyState
        mascot
        mascotPose="writing"
        icon={BookOpenCheck}
        title={t('homework.noGroupsTitle')}
        hint={t('homework.noGroupsHint')}
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
    if (!selected || cancelled || !teacherId) return
    const next = { ...valueOf(studentId), homework_done: done }
    setOverrideState((prev) => {
      const values =
        prev && prev.sessionId === selected.id
          ? new Map(prev.values)
          : new Map<string, AttendanceValue>()
      values.set(studentId, next)
      return { sessionId: selected.id, values }
    })
    // نفس مسار حفظ الحضور الموحّد (3A-296): القيمة تدخل قائمة المزامنة
    // المحلية وتُفرَّغ مجمّعة مع بقية تغييرات الحصة — لا طلب لكل تبديل
    enqueueStored({ teacherId, sessionId: selected.id, studentId, value: next })
  }

  // صف حصة واحد في المنتقي — نفس الشكل والملخص في قسمي الماضي والقادمة،
  // والتبديل/التسليم من قسم التفاصيل أسفله يعمل لأي حصة مختارة منهما
  const sessionRow = (s: (typeof sessions)[number], i: number) => {
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
              {t('homework.upcomingBadge')}
            </span>
          )}
          {s.kind === 'extra' && (
            <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">{t('homework.kindExtra')}</span>
          )}
          {s.kind === 'moved' && (
            <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">{t('homework.kindMoved')}</span>
          )}
          {s.status === 'cancelled' && (
            <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">{t('homework.kindCancelled')}</span>
          )}
          {sum && sum.rate != null && (
            <span
              className={`ms-auto text-[12px] font-bold rounded-full px-2 py-0.5 border ${
                sum.rate >= 80
                  ? 'bg-ok-soft text-ok-text border-ok/30'
                  : 'bg-warn-soft text-warn-text border-warn/40'
              }`}
            >
              {t('homework.submittedRate', { rate: sum.rate })}
            </span>
          )}
        </span>
        <span className="block text-muted text-[13.5px] mt-0.5">
          {t('homework.sessionTime', { time: formatTime12(s.start_time) })}
          {sum
            ? sum.attended > 0
              ? t('homework.sessionSubmittedSuffix', {
                  submitted: sum.submitted,
                  attended: sum.attended,
                })
              : t('homework.sessionNoAttendeesSuffix')
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
  }

  // (3A-325 — بند ٥): صفوف المنتقي لا تظهر إلا بعد جاهزية الحصص +
  // العلامات + القائمة معاً، لأن ملخص كل صف (شارة النسبة وشريط التقدم
  // ولاحقة «سلّم N من K») يُحسب من العلامات مفلترةً بعضوية القائمة —
  // عرض الصفوف قبل اكتمالها كان يُظهرها عارية ثم تقفز الشارة والشريط
  // داخلها فجأة (قياس حي: صفوف t≈1.9s ثم الشارة t≈2.25s). الشرط مقيد
  // بوجود حصص معروضة فعلاً حتى لا يعلق الفراغ/الخطأ على سكيليتون.
  const pickerPending =
    genQ.isPending ||
    sessionsQ.isPending ||
    (shownSessions.length > 0 && (marksQ.isPending || rosterQ.isPending))
  const pickerError = genQ.error ?? sessionsQ.error

  // سكيليتون المنتقي (3A-325): صفوف بارتفاع الصف الحقيقي (~92px: عنوان
  // + سطر وقت/ملخص + شريط تقدم) داخل كارت واحد لكل قسم ظاهر، وبعدد
  // يقارب المعروض فعلياً متى عُرفت الحصص (وإلا ٣ صفوف افتراضية) —
  // فالمحتوى الكامل يظهر دفعة واحدة بلا قفزات حجم.
  const pickerSkeletonCard = (count: number, key: string) => (
    <Card key={key} className="p-0 overflow-hidden mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-[92px] px-4 py-3 flex flex-col justify-center gap-2 ${
            i > 0 ? 'border-t border-border' : ''
          }`}
        >
          <Skeleton className="h-[18px] w-2/5 rounded-full" />
          <Skeleton className="h-[14px] w-3/5 rounded-full" />
          <Skeleton className="h-[6px] w-full rounded-full" />
        </div>
      ))}
    </Card>
  )

  return (
    <PullToRefresh
      onRefresh={async () => {
        await qc.invalidateQueries({ queryKey: [ATT] })
        await qc.invalidateQueries({ queryKey: [SCHED] })
        await qc.invalidateQueries({ queryKey: [SG] })
      }}
    >
    <div>
      {/* شريط حالة مزامنة الحضور/الواجب — يظهر فقط عند وجود معلّق/فشل */}
      <SyncStatusBar online={online} sync={sync} />
      <Card className="rise-in">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-soft text-primary flex items-center justify-center shrink-0">
            <BookOpenCheck size={24} />
          </span>
          <div className="min-w-0">
            <div className="font-extrabold text-[16px]">{t('homework.pageTitle')}</div>
            <p className="text-muted text-[13.5px] mt-0.5 mb-0 leading-[1.7]">
              {t('homework.pageHint')}
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

      {/* اختيار الحصة + النظرة الإجمالية: حصص الماضي واليوم أولاً (أحدث
          حصة فعلية في المقدمة) ونسبة تسليم كل حصة — والقادمة في قسم
          مطوي منفصل تحتها (W1-2) */}
      <h3 className="type-section mt-1 mb-2">{t('homework.sessionsOf', { name: group?.name ?? '' })}</h3>
      {pickerPending ? (
        <>
          {pickerSkeletonCard(shownPast.length > 0 ? shownPast.length : 3, 'past')}
          {futureSessions.length > 0 &&
            pickerSkeletonCard(shownFuture.length, 'future')}
        </>
      ) : pickerError ? (
        <ErrorState
          message={pickerError instanceof Error ? pickerError.message : t('common.unknownError')}
          onRetry={() => void sessionsQ.refetch()}
        />
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            mascot
            mascotPose="writing"
            icon={CalendarX2}
            title={t('homework.noSessionsTitle')}
            hint={t('homework.noSessionsHint')}
          />
        </Card>
      ) : (
        <>
          {/* الماضي واليوم: أحدث حصة فعلية في المقدمة */}
          {shownPast.length > 0 ? (
            <Card className="rise-in p-0 overflow-hidden mb-4" style={{ animationDelay: '50ms' }}>
              {shownPast.map((s, i) => sessionRow(s, i))}
              {pastSessions.length > PICKER_LIMIT && (
                <p className="text-muted text-[13.5px] px-4 py-2.5 m-0 border-t border-border">
                  {t('homework.pastOverflow', { limit: PICKER_LIMIT })}
                </p>
              )}
            </Card>
          ) : (
            <Card className="mb-4">
              <p className="text-muted text-[13.5px] m-0">
                {t('homework.noPastSessions')}
              </p>
            </Card>
          )}

          {/* القادمة: قسم مطوي منفصل — أقرب حصة أولاً، والاختيار منه
              بيفتح نفس قسم التفاصيل والتسليم تحت زي أي حصة فاتت */}
          {futureSessions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setFutureOpen((v) => !v)}
                aria-expanded={futureShown}
                className="w-full flex items-center gap-2 min-h-[48px] px-1 mb-2 bg-transparent border-0 cursor-pointer text-text"
              >
                <span className="type-section">{t('homework.futureTitle')}</span>
                <span className="text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2 py-0.5">
                  {futureSessions.length}
                </span>
                <span className="ms-auto text-muted inline-flex">
                  {futureShown ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </span>
              </button>
              {futureShown && (
                <Card className="rise-in p-0 overflow-hidden mb-4" style={{ animationDelay: '90ms' }}>
                  {shownFuture.map((s, i) => sessionRow(s, i))}
                  {futureSessions.length > PICKER_LIMIT && (
                    <p className="text-muted text-[13.5px] px-4 py-2.5 m-0 border-t border-border">
                      {t('homework.futureOverflow', { limit: PICKER_LIMIT })}
                    </p>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}

      {selected && (
        <>
          {/* ملخص الحصة المختارة: العدّادات للحاضرين أساساً وتتحدث فوراً */}
          <Card className="rise-in" style={{ animationDelay: '140ms' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-extrabold text-[16px]">{group?.name}</div>
                <div className="text-muted text-[13.5px]">
                  {t('homework.sessionMeta', {
                    date: formatDateLabel(selected.session_date),
                    time: formatTime12(selected.start_time),
                    minutes: selected.duration_minutes,
                  })}
                </div>
              </div>
              <span className="shrink-0 type-badge text-muted inline-flex items-center gap-1">
                {sync.syncing ? (
                  t('homework.saving')
                ) : (
                  <>
                    <Check size={14} className="text-ok-text" />
                    {t('homework.saveInstant')}
                  </>
                )}
              </span>
            </div>
            {detailSummary &&
              (!rowsReady ? (
                <>
                  {/* حجز مساحة العدّادات + شريط النسبة (3A-325 — بند ٥):
                      سكيليتون بنفس أبعاد المحتوى الرقمي (٣ بلاطات ~60px +
                      شريط) بدل «…» ثم قفزة الأرقام — الأرقام تظهر دفعة
                      واحدة عند الجاهزية، وترويسة الكارت فوق ثابتة كما هي */}
                  <div className="grid grid-cols-3 gap-2 mt-3" aria-hidden="true">
                    <Skeleton className="h-[60px]" />
                    <Skeleton className="h-[60px]" />
                    <Skeleton className="h-[60px]" />
                  </div>
                  <div className="flex items-center gap-2 mt-3" aria-hidden="true">
                    <Skeleton className="flex-1 h-2 rounded-full" />
                    <Skeleton className="h-[20px] w-[64px] rounded-full" />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded-xl bg-ok-soft px-2 py-2.5">
                      <div className="text-[20px] font-extrabold text-ok-text leading-none">
                        {detailSummary.submitted}
                      </div>
                      <div className="text-[13.5px] font-semibold text-ok-text mt-1">{t('homework.submitted')}</div>
                    </div>
                    <div className="rounded-xl bg-warn-soft px-2 py-2.5">
                      <div className="text-[20px] font-extrabold text-warn-text leading-none">
                        {detailSummary.pending}
                      </div>
                      <div className="text-[13.5px] font-semibold text-warn-text mt-1">{t('homework.notSubmitted')}</div>
                    </div>
                    <div className="rounded-xl bg-soft px-2 py-2.5">
                      <div className="text-[20px] font-extrabold leading-none">
                        {detailSummary.attended}
                      </div>
                      <div className="text-[13.5px] font-semibold text-muted mt-1">{t('homework.attendedLabel')}</div>
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
                        {t('homework.deliveryRate', { rate: detailSummary.rate ?? '' })}
                      </span>
                    </div>
                  )}
                </>
              ))}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Link to={`/attendance?session=${selected.id}`} className="no-underline">
                <Button variant="soft">
                  <ClipboardList size={20} />
                  {t('homework.openAttendance')}
                </Button>
              </Link>
            </div>
          </Card>

          {cancelled && (
            <div className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-start gap-2">
              <Ban size={20} className="shrink-0 mt-0.5" />
              <span>{t('homework.cancelledBanner')}</span>
            </div>
          )}

          {rosterQ.error || attQ.error ? (
            <ErrorState
              message={
                (rosterQ.error ?? attQ.error) instanceof Error
                  ? ((rosterQ.error ?? attQ.error) as Error).message
                  : t('common.unknownError')
              }
              onRetry={() => {
                void rosterQ.refetch()
                void attQ.refetch()
              }}
            />
          ) : rosterQ.isPending || attQ.isPending || !rowsReady ? (
            <>
              {/* (3A-325 — بند ٥): متى وصلت القائمة وبقي الحضور، عدد
                  السكيليتونات يقارب حجم القائمة فعلياً (بسقف ١٢) بدل ٣
                  ثابتة مهما كان الحجم؛ وإن كان الاستعلامان معاً pending
                  يبقى ٣ — الحجم غير معروف بعد أصلاً */}
              {Array.from({
                length: rosterQ.data
                  ? Math.min(Math.max(roster.length, 1), 12)
                  : 3,
              }).map((_, i, arr) => (
                <Skeleton
                  key={i}
                  className={`h-[72px]${i < arr.length - 1 ? ' mb-3' : ''}`}
                />
              ))}
            </>
          ) : roster.length === 0 ? (
            <Card>
              <EmptyState
                mascot
                mascotPose="writing"
                icon={Users}
                title={t('homework.noStudentsTitle')}
                hint={t('homework.noStudentsHint')}
              />
            </Card>
          ) : (
            <>
              {detailSummary && detailSummary.attended === 0 && (
                <Card>
                  <EmptyState
                    icon={ClipboardList}
                    title={t('homework.noAttendeesTitle')}
                    hint={t('homework.noAttendeesHint')}
                  />
                </Card>
              )}

              {submittedList.length > 0 && (
                <>
                  <h3 className="type-section mt-4 mb-2">
                    {t('homework.submittedSection', { count: submittedList.length })}
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
                    {t('homework.pendingSection', { count: pendingList.length })}
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
                    {t('homework.othersSection', { count: othersList.length })}
                  </h3>
                  <p className="text-muted text-[13.5px] mt-0 mb-2 leading-[1.7]">
                    {t('homework.othersHint')}
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
                                  {t('homework.absentBadge')}
                                </span>
                              ) : (
                                <span className="type-badge bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">
                                  {t('homework.noAttendanceStatus')}
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
    </PullToRefresh>
  )
}
