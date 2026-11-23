import { invalidatePrefixes } from '../../lib/invalidate'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import { HOME } from '../home/hooks'
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  ChevronDown,
  ChevronUp,
  Copy,
  DatabaseBackup,
  MessageCircle,
  ReceiptText,
  Repeat,
  Ticket,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Mascot } from '../../components/mascot/Mascot'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageToolBar } from '../../components/ui/PageToolBar'
import { Chip } from '../../components/ui/form'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatMoney } from '../../lib/format'
import { periodLabel } from '../invoices/api'
import {
  ALERT_KINDS,
  GENERIC_REMINDER_TEXT,
  SECTION_META,
  overdueListText,
  type AlertKind,
  type AppAlert,
} from './api'
import { useAlerts } from './hooks'

const KIND_ICONS: Record<AlertKind, LucideIcon> = {
  att: CalendarCheck2,
  absence: Repeat,
  prepaid: Ticket,
  fin: Wallet,
  proof: ReceiptText,
  grade: TrendingDown,
  backup: DatabaseBackup,
}

function WaButton({ url, label = t('notifications.page.waDefault') }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 inline-flex items-center justify-center gap-1 text-[12.5px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2.5 min-h-[36px] no-underline"
    >
      <MessageCircle size={16} />
      {label}
    </a>
  )
}

/**
 * صف تنبيه واحد: النص والوجهة من عقد getAlerts نفسه (§5.7)، والضغط على
 * جسم الصف ينتقل للوجهة. الإجراءات الإضافية في عمود الطرف: زر واتساب
 * صغير برسالة نوع التنبيه لولي الأمر (حيث ينطبق)، وتفاصيل قابلة
 * للفتح: فواتير الطالب المستحقة (fin) أو الطلاب المنخفضون (grade).
 */
function AlertRow({ alert, index = 0 }: { alert: AppAlert; index?: number }) {
  const [open, setOpen] = useState(false)
  const hasInvoices = alert.kind === 'fin' && (alert.invoices?.length ?? 0) > 0
  const hasLows = alert.kind === 'grade' && (alert.lowStudents?.length ?? 0) > 0
  const hasPrepaid = alert.kind === 'prepaid' && (alert.prepaidMembers?.length ?? 0) > 0
  const expandable = hasInvoices || hasLows || hasPrepaid

  return (
    <Card className="mb-2 rise-in" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      {/* (3A-384 — قاعدة المالك ٦-٧): الأزرار الصغيرة تدخل في سطر
          المحتوى نفسه — زر الواتساب (صغُر جداً) وزر فتح التفاصيل في
          عمود الطرف المقابل للنص، وسطر «اضغط للانتقال» أُزيل (جسم
          البطاقة كله رابط أصلاً) */}
      <div className="flex items-start gap-2">
        <Link to={alert.to} className="flex-1 min-w-0 no-underline text-text">
          <div className="font-semibold text-[16px] leading-[1.7]">{alert.text}</div>
          {alert.detail && <div className="text-muted text-[13.5px] mt-0.5">{alert.detail}</div>}
        </Link>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {alert.waUrl && <WaButton url={alert.waUrl} label={t('notifications.page.waReminder')} />}
          {expandable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary bg-soft border border-primary/20 rounded-full px-2.5 min-h-[36px] cursor-pointer"
            >
              {open
                ? t('notifications.page.hideDetails')
                : hasInvoices
                  ? t('notifications.page.showInvoices', { count: alert.invoices!.length })
                  : hasPrepaid
                    ? t('notifications.page.showStudents', { count: alert.prepaidMembers!.length })
                    : t('notifications.page.showStudents', { count: alert.lowStudents!.length })}
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>
      </div>

      {expandable && (
        <>
          {open && hasInvoices && (
            <div className="mt-2 border-t border-border pt-1">
              {alert.invoices!.map((inv) => (
                <Link
                  key={inv.invoice_id}
                  to={`/invoices/${inv.invoice_id}`}
                  className="flex items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0 no-underline text-text"
                >
                  <span className="text-[13.5px] font-semibold">
                    {inv.group_name} · {periodLabel(inv.period_month)}
                  </span>
                  <span className="text-[13.5px] font-bold bg-warn/15 text-warn-text border border-warn/40 rounded-full px-2 py-0.5 shrink-0">
                    {t('common.remaining', { amount: formatMoney(inv.balance) })}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {open && hasPrepaid && (
            <div className="mt-2 border-t border-border pt-1">
              {alert.prepaidMembers!.map((s) => (
                <div
                  key={s.student_id}
                  className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0"
                >
                  <Link
                    to={`/students/${s.student_id}`}
                    className="flex-1 min-w-0 font-semibold text-[13.5px] text-text no-underline"
                  >
                    {s.student_name}
                    <span className="text-muted font-normal">
                      {' '}
                      · {t('notifications.page.prepaidMemberLeft', { left: s.left, prepaid: s.prepaid })}
                    </span>
                  </Link>
                  {s.waUrl ? (
                    <WaButton url={s.waUrl} label={t('notifications.page.waReminder')} />
                  ) : (
                    <span className="shrink-0 text-muted text-[12px]">{t('notifications.page.noGuardianPhone')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {open && hasLows && (
            <div className="mt-2 border-t border-border pt-1">
              {alert.lowStudents!.map((s) => (
                <div
                  key={s.student_id}
                  className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0"
                >
                  <Link
                    to={`/students/${s.student_id}`}
                    className="flex-1 min-w-0 font-semibold text-[13.5px] text-text no-underline"
                  >
                    {s.student_name}
                    <span className="text-muted font-normal">
                      {' '}
                      · {t('notifications.page.gradeMemberScore', { score: s.score, max: s.max_score, pct: s.pct })}
                    </span>
                  </Link>
                  {s.waUrl ? (
                    <WaButton url={s.waUrl} label={t('notifications.page.sendGrade')} />
                  ) : (
                    <span className="shrink-0 text-muted text-[12px]">{t('notifications.page.noGuardianPhone')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** عدد العناصر الظاهرة ابتداءً داخل كل قسم قبل «عرض الكل» */
const SECTION_PREVIEW = 5

/**
 * قسم تنبيهات قابل للطي (طلب المالك: التنبيهات «كتير وتلخبط»): ترويسة
 * واحدة لكل نوع بعدّاده، مطوية افتراضياً عدا أول قسم، وداخل القسم
 * المفتوح تظهر أول 5 عناصر فقط مع زر «عرض الكل» — فالصفحة تبدأ ملخصاً
 * هادئاً بدل عشرات البطاقات المفتوحة دفعة واحدة.
 */
function SectionBlock({
  kind,
  items,
  open,
  onToggle,
}: {
  kind: AlertKind
  items: AppAlert[]
  /** الحالة مُتحكَّم بها من الصفحة (W3): رقائق الأنكورز تفتح قسمها أيضاً */
  open: boolean
  onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const KindIcon = KIND_ICONS[kind]
  const visible = showAll ? items : items.slice(0, SECTION_PREVIEW)
  return (
    <div className="mb-3 scroll-mt-[118px]" id={`notif-section-${kind}`} data-notif-section={kind}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 bg-card border border-border rounded-2xl px-3 min-h-[52px] cursor-pointer text-text"
      >
        <KindIcon size={22} className="text-primary shrink-0" />
        <span className="font-bold text-[15px] flex-1 text-start">{SECTION_META[kind].title}</span>
        <span className="text-[12px] font-bold bg-bad text-on-status rounded-full px-2 py-0.5">
          {items.length}
        </span>
        {open ? (
          <ChevronUp size={20} className="text-muted shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-muted shrink-0" />
        )}
      </button>
      {open && (
        <div className="mt-2">
          {visible.map((a, i) => (
            <AlertRow key={`${a.kind}-${a.to}-${i}`} alert={a} index={i} />
          ))}
          {items.length > SECTION_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-[13.5px] font-bold text-primary bg-soft border border-primary/20 rounded-full px-3 min-h-[44px] cursor-pointer"
            >
              {showAll ? t('notifications.page.showLess') : t('notifications.page.showAll', { count: items.length })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * الإشعارات (المواصفات §3.13 + §5.7 وخطة Phase 1 خطوة 8): قوائم مشتقة
 * حقيقية من قاعدة البيانات عبر fetchAlerts — نفس مصدر بطاقة تنبيهات
 * الرئيسية ونفس مفتاح كاشها — مجمّعة في أقسام حسب النوع بعدد كل قسم:
 * حضور اليوم، الغياب المتكرر، الباقات، المتأخرات (للمالك فقط، مع
 * بطاقة إجراءات النسخ في §3.13 وفواتير كل طالب المستحقة)، الدرجات
 * المنخفضة، والنسخ الاحتياطي (للمالك فقط). «لا تنبيهات» حالة نجاح.
 */
export function NotificationsPage() {
  const qc = useQueryClient()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const isAssistant = teacher.status === 'ready' && teacher.role === 'assistant'

  const toast = useToast()

  const alertsQ = useAlerts(teacherId, isOwner)
  const alerts = useMemo(() => alertsQ.data ?? [], [alertsQ.data])

  const sections = useMemo(() => {
    const byKind = new Map<AlertKind, AppAlert[]>()
    for (const a of alerts) {
      const list = byKind.get(a.kind) ?? []
      list.push(a)
      byKind.set(a.kind, list)
    }
    return ALERT_KINDS.map((kind) => ({ kind, items: byKind.get(kind) ?? [] })).filter(
      (s) => s.items.length > 0,
    )
  }, [alerts])

  const finCount = useMemo(() => alerts.filter((a) => a.kind === 'fin').length, [alerts])
  const overdueText = useMemo(() => overdueListText(alerts), [alerts])

  // حالة فتح الأقسام (W3 — R-11 أكورديون بقواعد NN/g): فتح متعدد مسموح
  // والحالة محفوظة أثناء الجلسة؛ الافتراضي = أول قسم (الأعلى أولوية) فقط
  const [openKinds, setOpenKinds] = useState<Set<AlertKind> | null>(null)
  const defaultOpen = useMemo(
    () => new Set<AlertKind>(sections.length ? [sections[0].kind] : []),
    [sections],
  )
  const effectiveOpen = openKinds ?? defaultOpen
  const toggleKind = (kind: AlertKind) =>
    setOpenKinds((prev) => {
      const next = new Set(prev ?? defaultOpen)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  // رقاقة الأنكور النشطة تتبع القسم الظاهر أثناء التمرير (scroll-spy — R-11)
  const [activeKind, setActiveKind] = useState<AlertKind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('[data-notif-section]')
    if (!els || els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActiveKind(e.target.getAttribute('data-notif-section') as AlertKind)
          }
        }
      },
      { rootMargin: '-118px 0px -55% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [sections])

  // إبقاء الرقاقة النشطة ظاهرة كاملة داخل صفّها (3A-324 — ملاحظات
  // المالك ٤): الصفّ قابل للتمرير أفقياً، والرقاقة النشطة كانت تبقى
  // خارج الحافة مقصوصة/مختفية عند تفعيلها بالتمرير (scroll-spy) أو
  // بالنقر، لأن لا شيء يمرّر الصفّ إليها. نمرّر الرقاقة نفسها لأقرب
  // موضع ظاهر داخل صفّها — block:nearest فلا تتحرك الصفحة رأسياً
  // (الشريط لاصق والرقاقة داخل الشاشة أصلاً).
  const ensureChipVisible = useCallback(
    (kind: AlertKind) => {
      try {
        const row = rootRef.current?.querySelector('.chip-row-fade')
        const idx = sections.findIndex((s) => s.kind === kind)
        const chip = row && idx >= 0 ? row.querySelectorAll('button')[idx] : null
        chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      } catch {
        // بيئات بلا تمرير برمجي كامل (jsdom في الاختبارات): لا إجراء —
        // التمرير اليدوي للصفّ يظل متاحاً كما كان
      }
    },
    [sections],
  )
  useEffect(() => {
    if (activeKind) ensureChipVisible(activeKind)
  }, [activeKind, ensureChipVisible])

  // ضغط رقاقة أنكور: يفتح قسمها (إن كان مطوياً) ويمرّر إليه
  const jumpToKind = (kind: AlertKind) => {
    setOpenKinds((prev) => {
      const next = new Set(prev ?? defaultOpen)
      next.add(kind)
      return next
    })
    setActiveKind(kind)
    ensureChipVisible(kind)
    requestAnimationFrame(() => {
      document
        .getElementById(`notif-section-${kind}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const copy = (text: string, okMsg: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast(okMsg))
      .catch(() => toast(t('common.copyUnavailable')))
  }

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [HOME])}>
    <div ref={rootRef}>
      {alertsQ.isPending ? (
        <>
          <Skeleton className="h-[64px] mb-3" />
          <Skeleton className="h-[88px] mb-3" />
          <Skeleton className="h-[88px]" />
        </>
      ) : alertsQ.isError ? (
        <ErrorState
          message={alertsQ.error instanceof Error ? alertsQ.error.message : t('common.unknownError')}
          onRetry={() => void invalidatePrefixes(qc, [HOME])}
        />
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            mascot
            icon={Bell}
            title={t('notifications.page.emptyTitle')}
            hint={t('notifications.page.emptyHint')}
          />
        </Card>
      ) : (
        <>
          {/* شريط الأنكورز الموحّد (W3 — R-10/R-11): رقائق تنقّل بين
              الأقسام — الضغط يمرّر للقسم ويفتحه، والنشطة تتبع الظاهر */}
          <PageToolBar
            chips={sections.map((s) => (
              <Chip
                key={s.kind}
                active={activeKind === s.kind}
                onClick={() => jumpToKind(s.kind)}
              >
                {SECTION_META[s.kind].title} ({s.items.length})
              </Chip>
            ))}
          />

          <Card className="rise-in" style={{ animationDelay: '0ms' }}>
            {/* دُفّي القلقان + الجرس في رأس الصفحة (MASCOT-PLAN §٤/§٦):
                داخل صفحة التنبيهات فقط وبجانب ملخصها — لا كروت تنبيهات
                في الرئيسية أبداً (قاعدة المالك الثابتة §٧) */}
            <div className="flex items-center gap-2">
              <Mascot state="alert" size={54} />
              <Bell size={24} className="text-primary" />
              <span className="font-bold text-[16px]">{t('notifications.page.summaryTitle', { count: alerts.length })}</span>
            </div>
            <div className="text-muted text-[13.5px] mt-1">
              {sections
                .map((s) => `${SECTION_META[s.kind].title}: ${s.items.length}`)
                .join(' · ')}
            </div>
            {/* R-15: تعريف كل رقم بجانبه حتى لا تتضارب الأرقام بين الشاشات */}
            <div className="text-muted text-[12.5px] mt-1">
              {t('notifications.page.definitions')}
            </div>
            {isAssistant && (
              <div className="text-muted text-[13.5px] mt-1">
                {t('notifications.page.ownerOnlyNote')}
              </div>
            )}
          </Card>

          {/* بطاقة إجراءات سريعة للمتأخرات — للمالك فقط (§3.13) */}
          {isOwner && finCount > 0 && (
            <Card className="border-warn/50 bg-warn/5 rise-in" style={{ animationDelay: '90ms' }}>
              <div className="font-extrabold text-[16px] mb-1 flex items-center gap-2"><AlertTriangle size={20} className="text-warn-text" /> {t('notifications.page.overdueActionsTitle')}</div>
              <div className="text-muted text-[13.5px] mb-3">
                {t('notifications.page.overdueActionsBody', { count: finCount })}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="soft" onClick={() => copy(overdueText, t('invoices.copiedOverdueList'))}>
                  <Copy size={18} />
                  {t('notifications.page.copyOverdueList')}
                </Button>
                {/* زرا النسخ شقيقان لنفس الفعل: ستايل واحد موحّد
                    (3A-324 — كان الأول soft والثاني ghost فبدوا غير
                    متناسقين في نفس البطاقة) */}
                <Button
                  variant="soft"
                  onClick={() => copy(GENERIC_REMINDER_TEXT, t('notifications.page.copiedGenericReminder'))}
                >
                  <Copy size={18} />
                  {t('notifications.page.copyGenericReminder')}
                </Button>
              </div>
            </Card>
          )}

          {sections.map((s) => (
            <SectionBlock
              key={s.kind}
              kind={s.kind}
              items={s.items}
              open={effectiveOpen.has(s.kind)}
              onToggle={() => toggleKind(s.kind)}
            />
          ))}
        </>
      )}

    </div>
    </PullToRefresh>
  )
}
