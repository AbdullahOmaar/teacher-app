import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
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
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
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

function WaButton({ url, label = 'واتساب' }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="shrink-0 inline-flex items-center justify-center gap-1.5 text-[13.5px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-3 min-h-[48px] no-underline"
    >
      <MessageCircle size={20} />
      {label}
    </a>
  )
}

/**
 * صف تنبيه واحد: النص والوجهة من عقد getAlerts نفسه (§5.7)، والضغط على
 * جسم الصف ينتقل للوجهة («اضغط للانتقال» §3.13). الإجراءات الإضافية:
 * زر واتساب برسالة نوع التنبيه لولي الأمر (حيث ينطبق)، وتفاصيل قابلة
 * للفتح: فواتير الطالب المستحقة (fin) أو الطلاب المنخفضون (grade).
 */
function AlertRow({ alert }: { alert: AppAlert }) {
  const [open, setOpen] = useState(false)
  const hasInvoices = alert.kind === 'fin' && (alert.invoices?.length ?? 0) > 0
  const hasLows = alert.kind === 'grade' && (alert.lowStudents?.length ?? 0) > 0
  const expandable = hasInvoices || hasLows

  return (
    <Card className="mb-2">
      <div className="flex items-start gap-2">
        <Link to={alert.to} className="flex-1 min-w-0 no-underline text-text">
          <div className="font-semibold text-[16px] leading-[1.7]">{alert.text}</div>
          {alert.detail && <div className="text-muted text-[13.5px] mt-0.5">{alert.detail}</div>}
          <div className="text-primary text-[13.5px] font-semibold mt-1">اضغط للانتقال ›</div>
        </Link>
        {alert.waUrl && <WaButton url={alert.waUrl} label="تذكير واتساب" />}
      </div>

      {expandable && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex items-center text-[13.5px] font-bold text-primary bg-soft border border-primary/20 rounded-full px-3 min-h-[48px] cursor-pointer"
          >
            {open
              ? 'إخفاء التفاصيل'
              : hasInvoices
                ? `عرض الفواتير المستحقة (${alert.invoices!.length})`
                : `عرض الطلاب (${alert.lowStudents!.length})`}
          </button>
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
                    باقي {formatMoney(inv.balance)}
                  </span>
                </Link>
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
                      · {s.score} من {s.max_score} ({s.pct}%)
                    </span>
                  </Link>
                  {s.waUrl ? (
                    <WaButton url={s.waUrl} label="إرسال الدرجة" />
                  ) : (
                    <span className="shrink-0 text-muted text-[12px]">لا رقم ولي أمر</span>
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

/**
 * الإشعارات (المواصفات §3.13 + §5.7 وخطة Phase 1 خطوة 8): قوائم مشتقة
 * حقيقية من قاعدة البيانات عبر fetchAlerts — نفس مصدر بطاقة تنبيهات
 * الرئيسية ونفس مفتاح كاشها — مجمّعة في أقسام حسب النوع بعدد كل قسم:
 * حضور اليوم، الغياب المتكرر، الباقات، المتأخرات (للمالك فقط، مع
 * بطاقة إجراءات النسخ في §3.13 وفواتير كل طالب المستحقة)، الدرجات
 * المنخفضة، والنسخ الاحتياطي (للمالك فقط). «لا تنبيهات» حالة نجاح.
 */
export function NotificationsPage() {
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

  const copy = (text: string, okMsg: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast(okMsg))
      .catch(() => toast('النسخ مش متاح في المتصفح ده'))
  }

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  return (
    <div>
      {alertsQ.isPending ? (
        <>
          <Skeleton className="h-[64px] mb-3" />
          <Skeleton className="h-[88px] mb-3" />
          <Skeleton className="h-[88px]" />
        </>
      ) : alertsQ.isError ? (
        <ErrorState
          message={alertsQ.error instanceof Error ? alertsQ.error.message : 'خطأ غير معروف'}
          onRetry={() => void alertsQ.refetch()}
        />
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="مفيش أي تنبيهات حالياً"
            hint="كل حاجة تمام: الحضور متسجل، ومفيش متأخرات ولا باقات بتنفد ولا درجات منخفضة تحتاج متابعة."
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center gap-2">
              <Bell size={24} className="text-primary" />
              <span className="font-bold text-[16px]">عندك {alerts.length} تنبيه</span>
            </div>
            <div className="text-muted text-[13.5px] mt-1">
              {sections
                .map((s) => `${SECTION_META[s.kind].title}: ${s.items.length}`)
                .join(' · ')}
            </div>
            {isAssistant && (
              <div className="text-muted text-[13.5px] mt-1">
                أقسام المتأخرات والنسخ الاحتياطي مالية وتظهر للمالك فقط.
              </div>
            )}
          </Card>

          {/* بطاقة إجراءات سريعة للمتأخرات — للمالك فقط (§3.13) */}
          {isOwner && finCount > 0 && (
            <Card className="border-warn/50 bg-warn/5">
              <div className="font-extrabold text-[16px] mb-1 flex items-center gap-2"><AlertTriangle size={20} className="text-warn-text" /> إجراءات المتأخرات</div>
              <div className="text-muted text-[13.5px] mb-3">
                {finCount} طالب عليهم مستحقات — انسخ القائمة أو التذكير العام وابعته كما يناسبك.
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="soft" onClick={() => copy(overdueText, 'اتنسخت قائمة المتأخرات')}>
                  <Copy size={18} />
                  نسخ قائمة المتأخرات
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => copy(GENERIC_REMINDER_TEXT, 'اتنسخ التذكير العام')}
                >
                  <Copy size={18} />
                  نسخ تذكير عام
                </Button>
              </div>
            </Card>
          )}

          {sections.map((s) => (
            <div key={s.kind} className="mb-4">
              <h2 className="type-section mb-2 mt-1 flex items-center gap-2">
                {(() => {
                  const KindIcon = KIND_ICONS[s.kind]
                  return <KindIcon size={24} className="text-primary" />
                })()}
                {SECTION_META[s.kind].title}
                <span className="text-[12px] font-bold bg-bad text-white rounded-full px-2 py-0.5">
                  {s.items.length}
                </span>
              </h2>
              {s.items.map((a, i) => (
                <AlertRow key={`${a.kind}-${a.to}-${i}`} alert={a} />
              ))}
            </div>
          ))}
        </>
      )}

    </div>
  )
}
