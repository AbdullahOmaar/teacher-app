import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import {
  AlertTriangle,
  Ban,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CalendarX2,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  CloudOff,
  Copy,
  LogIn,
  LogOut,
  MessageCircle,
  ScanQrCode,
  Star,
  TriangleAlert,
  Undo2,
  Users,
  X,
} from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { Avatar } from '../../components/ui/Avatar'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatClock12, formatTime12, safeExternalUrl } from '../../lib/format'
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
  arrivalMessage,
  arrivalWaUrl,
  departureMessage,
  departureWaUrl,
  isAttended,
  resolveGuardian,
  type AttendanceValue,
  type SessionWithGroup,
} from './api'
import {
  ATT,
  useClearStudentLeft,
  useDaySessions,
  useGuardianContacts,
  useMarkStudentLeft,
  useMonthHasInvoices,
  useSaveAttendance,
  useSaveManyAttendance,
  useSessionAttendance,
  useSessionById,
  useSessionRoster,
} from './hooks'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import { QrScannerSheet, type ScanOutcome } from './QrScannerSheet'
import { findStudentByCode, normalizeScannedCode } from './qr'
import {
  enqueueStored,
  isNetworkFailure,
  itemsForSession,
  loadQueue,
  queueKey,
  removeItem,
  saveQueue,
} from './offlineQueue'
import { useOfflineSync, useOnlineStatus } from './useOfflineSync'
import { SyncStatusBar } from './SyncStatusBar'

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
  // منتقي التاريخ: الزر يعرض التاريخ بصيغة عربية مقروءة ويفتح منتقي
  // الإدخال الأصلي (input[type=date] مخفي بصرياً) عبر showPicker
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const openDatePicker = () => {
    const el = dateInputRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        /* تابع للبديل */
      }
    }
    el.focus()
    el.click()
  }
  // تنبيه «تم إصدار فواتير هذا الشهر»: شريط نحيف قابل للإغلاق، وإغلاقه
  // يُحفظ لجلسة المتصفح (sessionStorage) بمفتاح المجموعة+الشهر فلا
  // يزعج بقية الشهر، ويعود تلقائياً مع شهر/مجموعة أخرى
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem('att-invoices-dismissed')
    } catch {
      return null
    }
  })

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
  // أوقات الانصراف المسجلة (left_at) — طبقة مستقلة عن قيم الحالات لأنها
  // لا تمرّ بـ changeValue/قائمة الأوفلاين (تسجيل الانصراف أونلاين فقط)
  const leftMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of attQ.data ?? []) {
      if (row.left_at) m.set(row.student_id, row.left_at)
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
  // الانصراف الصريح (0012): left_at يعيش على صف الحضور نفسه منفصلاً عن
  // قيم الحالات، وتنبيه «غادر» يتولد في القاعدة عند ضبطه أول مرة.
  const markLeftMut = useMarkStudentLeft(teacherId ?? '')
  const clearLeftMut = useClearStudentLeft(teacherId ?? '')
  // اسم السنتر من الهوية البيضاء — يدخل نصوص واتساب الوصول/المغادرة
  const { brand } = useBrandIdentity(teacherId)

  // أوفلاين (خطوة 11): حالة الاتصال + قائمة المزامنة + محركها. الحفظ
  // الأونلاين يبقى كما هو حرفياً؛ عند غياب الاتصال أو فشل شبكي يمرّ
  // التغيير لنفس القيمة الكاملة إلى القائمة بدل ضياعه (انظر changeValue).
  const online = useOnlineStatus()
  const sync = useOfflineSync(teacherId)

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const cancelled = selected?.status === 'cancelled'
  const noticeKey = selected
    ? `${selected.group_id}:${selected.session_date.slice(0, 7)}`
    : null
  const dismissNotice = () => {
    if (!noticeKey) return
    try {
      window.sessionStorage.setItem('att-invoices-dismissed', noticeKey)
    } catch {
      /* جلسة بلا تخزين: الإغلاق يبقى داخل الجلسة الحالية فقط */
    }
    setDismissedNotice(noticeKey)
  }
  const group = selected ? groupById.get(selected.group_id) : undefined
  const rowsReady = Boolean(selected && attQ.data)
  // قيم القائمة المعلّقة للحصة المختارة — طبقة بين التجاوز المحلي
  // وبيانات الخادم: التغيير المعلّق يظهر كما كتبه المستخدم حتى يُزامَن،
  // وصفّ صاحبه يُعلَّم «قيد الانتظار» (أو «فشل الحفظ» إن استنفد محاولاته)
  const queueMap = new Map(
    (selectedId && teacherId ? itemsForSession(sync.items, teacherId, selectedId) : []).map(
      (i) => [i.studentId, i] as const,
    ),
  )
  const valueOf = (studentId: string): AttendanceValue =>
    (overrideState && selected && overrideState.sessionId === selected.id
      ? overrideState.values.get(studentId)
      : undefined) ??
    queueMap.get(studentId)?.value ??
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

  /**
   * نقطة الحفظ الوحيدة لكل تغيير حضور (أزرار الحالات/الواجب/التمييز
   * ومسح QR عبر handleScan) — خطوة 11 أضافت فرع الأوفلاين داخلها فقط:
   * - متصل: نفس الحفظ الفوري المتفائل والإبطال كما كان تماماً، ونجاحه
   *   يلغي أي عنصر معلّق أقدم لنفس الطالب (القيمة الأحدث وصلت خلاص).
   * - غير متصل (أو فشل الحفظ لسبب شبكي تحديداً): القيمة الكاملة تدخل
   *   قائمة المزامنة المحلية وتبقى ظاهرة «قيد الانتظار» بدل التراجع
   *   أو الضياع، وتُزامَن تلقائياً عند عودة الاتصال بنفس upsert.
   * - خطأ غير شبكي (RLS/تحقق): السلوك القديم نفسه — تراجع + توست،
   *   ولا يدخل القائمة كأنه انقطاع اتصال.
   */
  const changeValue = (studentId: string, patch: Partial<AttendanceValue>) => {
    if (!selected || cancelled || !teacherId) return
    const next = { ...valueOf(studentId), ...patch }
    applyOverride([{ studentId, value: next }])
    if (!online) {
      enqueueStored({ teacherId, sessionId: selected.id, studentId, value: next })
      return
    }
    saveMut.mutate(
      { sessionId: selected.id, studentId, value: next },
      {
        onSuccess: () => {
          saveQueue(removeItem(loadQueue(), queueKey(teacherId, selected.id, studentId)))
        },
        onError: (err) => {
          if (isNetworkFailure(err)) {
            enqueueStored({ teacherId, sessionId: selected.id, studentId, value: next })
            toast('انقطع الاتصال — التغيير اتحفظ على الجهاز وهيتزامن تلقائياً')
            return
          }
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
    if (!selected || cancelled || !teacherId) return
    const entries = roster.map((s) => ({
      studentId: s.id,
      value: { ...valueOf(s.id), status: 'p' as AttendanceStatus },
    }))
    applyOverride(entries)
    // أوفلاين: كل طالب عنصر مستقل في القائمة (نفس مفتاح upsert الفردي)
    // فيُزامَن لاحقاً بنفس saveAttendance واحداً واحداً — نتيجة مطابقة
    const enqueueAll = () => {
      for (const e of entries) {
        enqueueStored({
          teacherId,
          sessionId: selected.id,
          studentId: e.studentId,
          value: e.value,
        })
      }
    }
    if (!online) {
      enqueueAll()
      return
    }
    saveManyMut.mutate(
      { sessionId: selected.id, entries },
      {
        onSuccess: () => {
          let items = loadQueue()
          for (const e of entries) {
            items = removeItem(items, queueKey(teacherId, selected.id, e.studentId))
          }
          saveQueue(items)
        },
        onError: (err) => {
          if (isNetworkFailure(err)) {
            enqueueAll()
            toast('انقطع الاتصال — التغييرات اتحفظت على الجهاز وهتتزامن تلقائياً')
            return
          }
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

  // سياق رسائل وصل/غادر الموحّدة: الحصة المختارة + اسم السنتر (الهوية
  // البيضاء) — نفس النصوص تُستخدم في روابط wa.me وفي «نسخ الكل».
  const waCtx = selected
    ? {
        sessionDate: selected.session_date,
        groupName: selected.group_name,
        centreName: brand.name,
      }
    : null
  // قائمة إرسال الواتساب: الحاضرون فعلاً (p/l/m) لرسالة الوصول، ومن
  // سُجّل انصرافهم لرسالة المغادرة — إرسال يدوي فردي، بلا أي تلقائية.
  const waRows = roster
    .map((st) => {
      const v = valueOf(st.id)
      const contact = contactsQ.data?.get(st.id)
      const attended = isAttended(v.status)
      const leftAt = leftMap.get(st.id) ?? null
      if (!attended && !leftAt) return null
      return {
        student: st,
        guardianName: resolveGuardian(st, contact).name,
        arrivalUrl: attended && waCtx ? arrivalWaUrl(st, contact, waCtx) : null,
        departureUrl: leftAt && waCtx ? departureWaUrl(st, contact, waCtx) : null,
        arrivalText: attended && waCtx ? arrivalMessage(st, contact, waCtx) : null,
        departureText: leftAt && waCtx ? departureMessage(st, contact, waCtx) : null,
      }
    })
    .filter((r) => r !== null)

  const copyAllWaMessages = () => {
    const lines: string[] = []
    for (const r of waRows) {
      if (r.arrivalText) lines.push(`${r.guardianName} (${r.student.name}): ${r.arrivalText}`)
      if (r.departureText) lines.push(`${r.guardianName} (${r.student.name}): ${r.departureText}`)
    }
    if (lines.length === 0) return
    void navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => toast(`اتنسخ ${lines.length} رسالة — الصقها في واتساب زي ما تحب`))
      .catch(() => toast('ماقدرناش ننسخ — جرّب تاني'))
  }

  const toggleLeft = (studentId: string) => {
    if (!selected || cancelled || !teacherId) return
    const isLeft = leftMap.has(studentId)
    const mut = isLeft ? clearLeftMut : markLeftMut
    mut.mutate(
      { sessionId: selected.id, studentId },
      {
        onSuccess: () => toast(isLeft ? 'اتلغى تسجيل الانصراف' : 'اتسجّل الانصراف — ولي الأمر هيشوف تنبيه «غادر» في بوابته'),
        onError: () => toast('حصلت مشكلة في تسجيل الانصراف — حاول تاني'),
      },
    )
  }

  const pickerPending = groupsQ.isPending || genQ.isPending || dayQ.isPending
  const pickerError = groupsQ.error ?? genQ.error ?? dayQ.error ?? paramQ.error

  return (
    <div>
      {/* حالة الأوفلاين/المزامنة (خطوة 11) — تظهر فقط عند الحاجة */}
      <SyncStatusBar online={online} sync={sync} />

      {/* ترويسة مدمجة واحدة: منتقي التاريخ + بيانات الحصة + التقدّم +
          إدارة الحصة في بطاقة واحدة — كانت ترويستين مكررتين تدفعان
          قائمة الطلاب تحت أول شاشة. أزرار «مسح QR» و«الكل حاضر» لا
          توجد هنا: مكانها الوحيد الشريط اللاصق السفلي مع العدّادات. */}
      <Card>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={openDatePicker}
              aria-label="تاريخ الحصة — اضغط لتغيير التاريخ"
              className="w-full flex items-center gap-2 border border-border rounded-xl px-3 min-h-[48px] bg-card text-text cursor-pointer"
            >
              <CalendarDays size={20} className="text-primary shrink-0" />
              <span className="flex-1 text-start font-semibold text-[15px] truncate">
                {/^\d{4}-\d{2}-\d{2}$/.test(date)
                  ? formatDateLabel(date).replace(' ', '، ')
                  : 'اختر تاريخ الحصة'}
              </span>
              <ChevronDown size={18} className="text-muted shrink-0" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                if (!e.target.value) return
                setDate(e.target.value)
                setPickedId(null)
              }}
              className="absolute inset-0 w-full opacity-0 pointer-events-none"
            />
          </div>
          {selected && (
            <span className="shrink-0 type-badge text-muted inline-flex items-center gap-1">
              {saving ? (
                'بنحفظ…'
              ) : !online ? (
                <>
                  <CloudOff size={14} className="text-warn-text" />
                  غير متصل — الحفظ على الجهاز
                </>
              ) : sync.pendingCount > 0 ? (
                <>
                  <Clock size={14} className="text-warn-text" />
                  {sync.pendingCount} قيد الانتظار
                </>
              ) : (
                <>
                  <Check size={14} className="text-ok-text" />
                  الحفظ فوري
                </>
              )}
            </span>
          )}
        </div>
        {paramSessionId && paramQ.isSuccess && !paramQ.data && (
          <p className="text-warn-text text-[13.5px] mt-2 mb-0">
            الحصة المطلوبة من الرابط غير موجودة — اختر حصة من حصص اليوم المختار.
          </p>
        )}
        {pickerPending ? (
          <Skeleton className="h-[44px] mt-3" />
        ) : pickerError ? (
          <p className="text-bad-text text-[13.5px] mt-2 mb-0">
            {pickerError instanceof Error ? pickerError.message : 'خطأ غير معروف'}
          </p>
        ) : groups.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={CalendarDays}
              title="لا توجد مجموعات بعد — فلا حصص تُولّد"
              hint="أنشئ مجموعة وحدد أيامها وميعادها، وحصصها هتتولّد تلقائياً وتظهر هنا للتحضير."
            />
          </div>
        ) : daySessions.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={CalendarX2}
              title="لا توجد حصص في اليوم ده"
              hint="جرّب تاريخاً تاني، أو راجع جدول المجموعات من شاشة الجدول."
            />
          </div>
        ) : (
          <>
            {daySessions.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar chip-row-fade mt-3 -mx-1 px-1 pb-1">
                {daySessions.map((s) => (
                  <Chip
                    key={s.id}
                    active={selected?.id === s.id}
                    onClick={() => setPickedId(s.id)}
                  >
                    {s.group_name} · {formatTime12(s.start_time)}
                    {s.status === 'cancelled' ? ' (ملغاة)' : ''}
                  </Chip>
                ))}
              </div>
            )}
            {selected && (
              <div className="mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-[16px]">{selected.group_name}</span>
                  {selected.kind === 'extra' && (
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">إضافية</span>
                  )}
                  {selected.kind === 'moved' && (
                    <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">منقولة</span>
                  )}
                  {selected.status === 'cancelled' && (
                    <span className="text-[12px] font-bold bg-muted/15 text-muted border border-border rounded-full px-2 py-0.5">ملغاة</span>
                  )}
                </div>
                <div className="text-muted text-[13.5px] mt-0.5">
                  الساعة {formatTime12(selected.start_time)} · {selected.duration_minutes} دقيقة
                  {selected.group_room ? ` · ${selected.group_room}` : ''}
                </div>
                <div className="flex items-center gap-2 mt-2.5">
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
                  <Button
                    variant={cancelled ? 'primary' : 'ghost'}
                    onClick={toggleSessionStatus}
                    disabled={statusMut.isPending}
                    className="min-h-[48px] text-[13.5px] px-3"
                  >
                    {cancelled ? (<><Undo2 size={18} /> استرجاع الحصة</>) : 'إلغاء الحصة'}
                  </Button>
                  <Link to="/schedule" className="no-underline">
                    <Button variant="ghost" className="min-h-[48px] text-[13.5px] px-3">
                      نقل الحصة من الجدول
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {selected && (
        <>
          {cancelled && (
            <div className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-start gap-2">
              <Ban size={20} className="shrink-0 mt-0.5" />
              <span>الحصة دي ملغاة — الحضور مقفول ومش هيتسجل لها أي حالة. استرجع الحصة الأول لو عايز تحضّرها.</span>
            </div>
          )}

          {invoicesQ.data && noticeKey !== dismissedNotice && (
            <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-1.5 mb-3 text-[13.5px] flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-warn-text" />
              <span className="flex-1">
                تم إصدار فواتير هذا الشهر — أي تعديل في الحضور سيسجل كتسوية مالية.
              </span>
              <button
                type="button"
                onClick={dismissNotice}
                aria-label="إغلاق تنبيه الفواتير"
                className="shrink-0 w-9 h-9 -my-1 flex items-center justify-center bg-transparent border-0 cursor-pointer text-warn-text"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {group && group.links.some((l) => safeExternalUrl(l) !== null) && (
            <Card>
              <div className="font-bold text-[15px] mb-2">روابط الملازم والواجبات</div>
              <div className="flex flex-col gap-1.5">
                {group.links.map((l) => {
                  const href = safeExternalUrl(l)
                  if (href === null) return null
                  return (
                    <a
                      key={l}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-[13.5px] break-all"
                      dir="ltr"
                    >
                      {l}
                    </a>
                  )
                })}
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
                  const qItem = queueMap.get(st.id)
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
                              className="block font-semibold text-[15px] leading-[1.6] text-text no-underline line-clamp-2"
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
                              {qItem && !qItem.failed && (
                                <span className="inline-flex items-center gap-1 text-warn-text font-semibold">
                                  <Clock size={14} />
                                  قيد الانتظار
                                </span>
                              )}
                              {qItem?.failed && (
                                <span className="inline-flex items-center gap-1 text-bad-text font-semibold">
                                  <TriangleAlert size={14} />
                                  فشل الحفظ
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
                      {/* الانصراف الصريح (0012): ضبط left_at يولّد تنبيه
                          «غادر» في بوابة ولي الأمر. أونلاين فقط بوعي —
                          لا يدخل قائمة مزامنة الأوفلاين. */}
                      {isAttended(v.status) &&
                        (() => {
                          const leftAt = leftMap.get(st.id)
                          return (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {leftAt ? (
                                <>
                                  <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-primary">
                                    <LogOut size={16} />
                                    انصرف {formatClock12(new Date(leftAt))}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    className="min-h-[48px] text-[13.5px] px-3"
                                    disabled={cancelled || clearLeftMut.isPending}
                                    onClick={() => toggleLeft(st.id)}
                                  >
                                    <Undo2 size={16} />
                                    تراجع
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="soft"
                                    className="min-h-[48px] text-[13.5px] px-3"
                                    disabled={cancelled || !online || markLeftMut.isPending}
                                    onClick={() => toggleLeft(st.id)}
                                  >
                                    <LogOut size={18} />
                                    تسجيل انصراف
                                  </Button>
                                  {!online && (
                                    <span className="text-muted text-[12px]">
                                      تسجيل الانصراف بيحتاج اتصال بالنت
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )
                        })()}
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

              {/* قائمة إرسال واتساب وصل/غادر (خطوة 6): روابط wa.me فردية
                  بنص موحّد للحاضرين والمنصرفين — إرسال يدوي بالكامل:
                  لا إرسال تلقائي ولا Push خارجي في هذه المرحلة، والتنبيه
                  داخل بوابة ولي الأمر يتولد تلقائياً في القاعدة أصلاً. */}
              {waRows.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-bold text-[15px] flex items-center gap-2">
                      <BellRing size={20} className="text-primary" />
                      تنبيهات ولي الأمر — واتساب
                    </div>
                    <Button
                      variant="ghost"
                      className="min-h-[48px] text-[13.5px] px-3"
                      onClick={copyAllWaMessages}
                    >
                      <Copy size={16} />
                      نسخ كل الرسائل
                    </Button>
                  </div>
                  <p className="text-muted text-[13.5px] mt-0">
                    اضغط «إرسال» لكل ولي أمر على حدة — مفيش إرسال تلقائي. تنبيه البوابة
                    (وصل/غادر) اتسجّل تلقائياً لكل طالب مع تحضيره وانصرافه وهيظهر لولي
                    أمره في بوابته.
                  </p>
                  <div className="flex flex-col">
                    {waRows.map((r, i) => (
                      <div
                        key={r.student.id}
                        className={`py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[15px]">{r.student.name}</span>
                          <span className="text-muted text-[13.5px]">
                            ولي الأمر: {r.guardianName}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {r.arrivalUrl ? (
                            <a href={r.arrivalUrl} target="_blank" rel="noreferrer" className="no-underline">
                              <Button variant="soft" className="min-h-[48px] text-[13.5px] px-3">
                                <LogIn size={18} />
                                إرسال «وصل»
                              </Button>
                            </a>
                          ) : (
                            r.arrivalText && (
                              <span className="text-muted text-[12px] self-center">
                                لا يوجد رقم ولي أمر لإرسال «وصل»
                              </span>
                            )
                          )}
                          {r.departureUrl ? (
                            <a href={r.departureUrl} target="_blank" rel="noreferrer" className="no-underline">
                              <Button variant="soft" className="min-h-[48px] text-[13.5px] px-3">
                                <LogOut size={18} />
                                إرسال «غادر»
                              </Button>
                            </a>
                          ) : (
                            r.departureText && (
                              <span className="text-muted text-[12px] self-center">
                                لا يوجد رقم ولي أمر لإرسال «غادر»
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

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
          sessionLabel={`${selected.group_name} · ${formatDateLabel(selected.session_date)} · الساعة ${formatTime12(selected.start_time)}`}
          done={done}
          total={total}
          onScan={handleScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  )
}
