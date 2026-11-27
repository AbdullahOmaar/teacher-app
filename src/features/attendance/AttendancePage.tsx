import { invalidatePrefixes } from '../../lib/invalidate'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { AlertTriangle, Ban, Users, X } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, PageLoadingOverlay, SignInRequired, Skeleton } from '../../components/ui/states'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatTime12, safeExternalUrl } from '../../lib/format'
import type { AttendanceStatus } from '../../types/database'
import { useGroups } from '../groups/hooks'
import { SG } from '../students/hooks'
import { formatDateLabel, generationWindowMonths, monthStartStr, todayStr } from '../schedule/api'
import { SCHED, useGeneration, useSetSessionStatus } from '../schedule/hooks'
import {
  EMPTY_VALUE,
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
  useSessionAttendance,
  useSessionById,
  useSessionRoster,
} from './hooks'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import { t } from '../../i18n'
import { QrScannerSheet, type ScanOutcome } from './QrScannerSheet'
import { findStudentByCode, normalizeScannedCode } from './qr'
import { enqueueStored, itemsForSession } from './offlineQueue'
import { useOfflineSync, useOnlineStatus } from './useOfflineSync'
import { SyncStatusBar } from './SyncStatusBar'
import { AttendanceCelebration } from './AttendanceCelebration'
import { SessionPickerCard } from './sections/SessionPickerCard'
import { RosterCard } from './sections/RosterCard'
import { HomeworkCard } from './sections/HomeworkCard'
import { WaSendCard } from './sections/WaSendCard'
import { SummaryBar } from './sections/SummaryBar'

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
  // ارتفاع الشريط اللاصق السفلي مقاساً فعلياً — يُبنى به فاصل سفلي
  // بنفس الارتفاع حتى يمرّ آخر محتوى بالكامل فوق الشريط (3A-324)
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null)
  const [barH, setBarH] = useState(0)
  useEffect(() => {
    if (!barEl || typeof ResizeObserver === 'undefined') return
    const update = () => setBarH(barEl.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(barEl)
    return () => ro.disconnect()
  }, [barEl])
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
  const handleDateChange = (value: string) => {
    if (!value) return
    setDate(value)
    setPickedId(null)
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
   * ومسح QR عبر handleScan) — بعد تجميع الطلبات (3A-296) صار كل تغيير
   * يمرّ بقائمة المزامنة المحلية دائماً، متصلاً كان أو غير متصل:
   * - القيمة الكاملة تدخل القائمة (تخزين محلي دائم) وتظهر فوراً عبر
   *   طبقة التجاوز + شارة «قيد الانتظار» على الصف.
   * - محرك المزامنة يفرّغ القائمة تلقائياً بعد هدوء قصير، مجمّعاً
   *   عناصر الحصة في دفعة واحدة (upsert جماعي + حذف جماعي) بدل طلب
   *   لكل نقرة كما كان.
   * - فشل دائم (RLS/تحقق): العنصر يُعلَّم «فشل الحفظ» على صفّه وفي
   *   شريط المزامنة مع إعادة محاولة/تجاهل — لا تراجع صامت ولا ضياع.
   * عقد الأوفلاين الأصلي لم يتغير: آخر كتابة تفوز، والمزامنة
   * idempotent، والعناصر الفاشلة لا تعود تلقائياً إلا بزر أو بتعديل.
   */
  const changeValue = (studentId: string, patch: Partial<AttendanceValue>) => {
    if (!selected || cancelled || !teacherId) return
    const next = { ...valueOf(studentId), ...patch }
    applyOverride([{ studentId, value: next }])
    enqueueStored({ teacherId, sessionId: selected.id, studentId, value: next })
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
    // كل طالب عنصر مستقل في قائمة المزامنة (نفس مفتاح الدمج الفردي)،
    // والمحرك يرسلهم دفعة حصة واحدة — متصلاً كان أو غير متصل (3A-296)
    for (const e of entries) {
      enqueueStored({
        teacherId,
        sessionId: selected.id,
        studentId: e.studentId,
        value: e.value,
      })
    }
  }

  const toggleSessionStatus = () => {
    if (!selected) return
    // بلا إبطال يدوي هنا: onSuccess في useSetSessionStatus يبطل مجموعة
    // الجدول الكاملة ([schedule, home, attendance] — INVALIDATION_SETS.schedule)
    statusMut.mutate(
      { sessionId: selected.id, status: cancelled ? 'scheduled' : 'cancelled' },
      {
        onSuccess: () => {
          toast(cancelled ? t('attendance.sessionRestored') : t('attendance.sessionCancelledToast'))
        },
        onError: () => toast(t('attendance.genericErrorToast')),
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
      .then(() => toast(t('attendance.copiedMessages', { count: lines.length })))
      .catch(() => toast(t('attendance.copyFailed')))
  }

  const toggleLeft = (studentId: string) => {
    if (!selected || cancelled || !teacherId) return
    const isLeft = leftMap.has(studentId)
    const mut = isLeft ? clearLeftMut : markLeftMut
    mut.mutate(
      { sessionId: selected.id, studentId },
      {
        onSuccess: () => toast(isLeft ? t('attendance.leftCleared') : t('attendance.leftMarked')),
        onError: () => toast(t('attendance.leftError')),
      },
    )
  }

  const pickerPending = groupsQ.isPending || genQ.isPending || dayQ.isPending
  const pickerError = groupsQ.error ?? genQ.error ?? dayQ.error ?? paramQ.error

  return (
    <PullToRefresh
      onRefresh={async () => {
        await invalidatePrefixes(qc, [ATT, SCHED, SG])
      }}
    >
    <div>
      {/* حالة الأوفلاين/المزامنة (خطوة 11) — تظهر فقط عند الحاجة */}
      <SyncStatusBar online={online} sync={sync} />

      {/* احتفال إكمال الحضور (خطة الهوية P-7): يظهر فقط عند الانتقال
          للاكتمال أثناء العمل على الجلسة، مرة واحدة لكل جلسة */}
      <AttendanceCelebration
        sessionId={selectedId ?? null}
        isComplete={
          // البوابة تتطلب بيانات الحضور والقائمة معاً: القائمتان
          // تُجلبان باستعلامين منفصلين، ووصول الحضور أولاً بقائمة
          // فارغة مؤقتاً كان سيُقرأ «غير مكتمل» ثم «مكتمل» عند وصول
          // القائمة فينطلق احتفال كاذب لجلسة مكتملة أصلاً عند الفتح
          rowsReady && rosterQ.data && selected && !cancelled
            ? total > 0 && done === total
            : null
        }
      />

      <SessionPickerCard
        date={date}
        dateInputRef={dateInputRef}
        onOpenDatePicker={openDatePicker}
        onDateChange={handleDateChange}
        paramMissing={Boolean(paramSessionId && paramQ.isSuccess && !paramQ.data)}
        pending={pickerPending}
        error={pickerError}
        groupsEmpty={groups.length === 0}
        daySessions={daySessions}
        selected={selected}
        onPickSession={setPickedId}
        done={done}
        total={total}
        pct={pct}
        rowsReady={rowsReady}
        cancelled={cancelled}
        onToggleSessionStatus={toggleSessionStatus}
        statusPending={statusMut.isPending}
      />

      {/* تحميل المنتقي: مؤشر دُفّي الموحّد من أول لحظة (3A-384 —
          ملاحظة المالك ١: اللودر كان يظهر متأخراً جداً لأن سلسلة
          مجموعات ← توليد ← حصص اليوم كانت تترك الصفحة بلا أي مؤشر
          حتى تُختار الحصة وتُجلب قائمتها) */}
      {pickerPending && (
        <>
          <PageLoadingOverlay />
          <div className="mt-3">
            <Skeleton className="h-[72px] mb-3" />
            <Skeleton className="h-[72px] mb-3" />
            <Skeleton className="h-[72px]" />
          </div>
        </>
      )}

      {selected && (
        <>
          {cancelled && (
            <div className="border border-border bg-soft rounded-xl px-3 py-2.5 mb-3 text-[13.5px] font-semibold text-muted flex items-start gap-2">
              <Ban size={20} className="shrink-0 mt-0.5" />
              <span>{t('attendance.cancelledBanner')}</span>
            </div>
          )}

          {invoicesQ.data && noticeKey !== dismissedNotice && (
            <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-1.5 mb-3 text-[13.5px] flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-warn-text" />
              <span className="flex-1">
                {t('attendance.invoicesNotice')}
              </span>
              <button
                type="button"
                onClick={dismissNotice}
                aria-label={t('attendance.invoicesNoticeCloseAria')}
                className="shrink-0 w-9 h-9 -my-1 flex items-center justify-center bg-transparent border-0 cursor-pointer text-warn-text"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {group && group.links.some((l) => safeExternalUrl(l) !== null) && (
            <Card className="rise-in" style={{ animationDelay: '50ms' }}>
              <div className="font-bold text-[15px] mb-2">{t('attendance.groupLinksTitle')}</div>
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
              <PageLoadingOverlay />
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px] mb-3" />
              <Skeleton className="h-[72px]" />
            </>
          ) : rosterQ.error || attQ.error ? (
            <ErrorState
              message={
                (rosterQ.error ?? attQ.error) instanceof Error
                  ? ((rosterQ.error ?? attQ.error) as Error).message
                  : t('common.unknownError')
              }
              onRetry={() => {
                // PAT-1 (3A-377): إعادة محاولة موجّهة للاستعلامات الفاشلة نفسها — إبطال 'attendance' كان سيعيد جلب حصص اليوم والجلسة وجهات الاتصال والفواتير الشهرية السليمة أيضاً.
                void rosterQ.refetch()
                void attQ.refetch()
              }}
            />
          ) : roster.length === 0 ? (
            <Card>
              <EmptyState
                mascot
                icon={Users}
                title={t('attendance.noStudentsTitle')}
                hint={t('attendance.noStudentsHint')}
              />
            </Card>
          ) : (
            <>
              <RosterCard
                students={roster}
                valueOf={valueOf}
                queueMap={queueMap}
                leftMap={leftMap}
                contacts={contactsQ.data}
                sessionDate={selected.session_date}
                flashId={flashId}
                cancelled={cancelled}
                online={online}
                markLeftPending={markLeftMut.isPending}
                clearLeftPending={clearLeftMut.isPending}
                onChangeValue={changeValue}
                onToggleLeft={toggleLeft}
              />

              <HomeworkCard
                students={roster}
                groupId={selected.group_id}
                sessionId={selected.id}
                valueOf={valueOf}
                cancelled={cancelled}
                onChangeValue={changeValue}
              />

              {/* قائمة إرسال واتساب وصل/غادر (خطوة 6) */}
              {waRows.length > 0 && (
                <WaSendCard rows={waRows} onCopyAll={copyAllWaMessages} />
              )}

              <SummaryBar
                barRef={setBarEl}
                barH={barH}
                statusCounts={statusCounts}
                cancelled={cancelled}
                anyNotPresent={anyNotPresent}
                syncing={sync.syncing}
                onScanOpen={() => setScanOpen(true)}
                onMarkAllPresent={markAllPresent}
              />
            </>
          )}
        </>
      )}

      {/* ماسح QR (خطوة 4): يُركّب فقط عند الفتح الصريح — الكاميرا تُطلب
          وتُوقف مع تركيبه/فكّه، والتسجيل يمرّ بـ handleScan ← changeValue */}
      {scanOpen && selected && (
        <QrScannerSheet
          sessionLabel={t('attendance.scannerSessionLabel', {
            group: selected.group_name,
            date: formatDateLabel(selected.session_date),
            time: formatTime12(selected.start_time),
          })}
          done={done}
          total={total}
          onScan={handleScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
    </PullToRefresh>
  )
}
