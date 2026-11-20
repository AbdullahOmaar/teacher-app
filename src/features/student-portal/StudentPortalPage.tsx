import { useSearchParams } from 'react-router-dom'
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock,
  GraduationCap,
  Link2,
  Link2Off,
  NotebookPen,
  ReceiptText,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatMoney, formatTime12 } from '../../lib/format'
import { darken } from '../../lib/brand'
import { fmtScore, pctOf, ASSESSMENT_TYPE_LABELS } from '../grades/api'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import { formatDateLabel, formatDayMonth } from '../schedule/api'
import {
  STUDENT_PORTAL_ATT_META,
  fetchStudentPushStatus,
  studentPortalErrorInfo,
  subscribeStudentPush,
  unsubscribeStudentPush,
  type StudentPortalBrand,
} from './api'
import { PortalPushToggle, type PortalPushAdapter } from '../../components/PortalPushToggle'
import { useStudentPortalOverview } from './hooks'

/**
 * بوابة الطالب العامة — Phase 3 خطوة 5 (migration ‏0011).
 *
 * صفحة عامة بلا جلسة مدرس وبلا AppShell: الرابط الموقّع هو الاعتماد
 * الوحيد — /student-portal?t=<rawToken>، والطالب يُعرَف من التوكن نفسه
 * فلا معرّف طالب في الرابط. التحقق والعرض كله عبر RPC واحدة قراءة فقط
 * ومقيدة الحقول (student_portal_overview_by_token) بالـ anon key؛ لا
 * قراءة مباشرة لأي جدول ولا أي عملية كتابة من هذه الصفحة إطلاقاً.
 *
 * الأقسام الأربعة كما في الخطة: حصص الطالب القادمة (ومواعيد مجموعاته)،
 * واجباته وحالتها، درجاته ونتائج امتحاناته الإلكترونية (بمصدرها)،
 * ومدفوعاته ورصيده — بيانات هذا الطالب فقط، بلا زملاء ولا بيانات ولي
 * أمر ولا مالية مدرس.
 */

function StudentPortalShell({
  children,
  brand,
}: {
  children: React.ReactNode
  brand?: StudentPortalBrand | null
}) {
  const accentVars = brand?.accent
    ? ({
        '--primary': brand.accent,
        '--primary-d': darken(brand.accent, 0.15),
      } as React.CSSProperties)
    : undefined
  return (
    <div className="min-h-screen bg-bg text-text" style={accentVars}>
      <header className="sticky top-0 z-20 h-[52px] bg-card border-b border-border">
        <div className="mx-auto max-w-[640px] h-full px-4 flex items-center gap-2">
          {brand?.logo_url ? (
            <img
              src={brand.logo_url}
              alt={brand.name ?? 'شعار السنتر'}
              className="w-9 h-9 rounded-full object-contain bg-soft p-0.5 shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded-full bg-soft text-primary flex items-center justify-center">
              <Users size={20} />
            </span>
          )}
          <div className="min-w-0">
            <div className="type-section leading-[1.4] truncate">
              {brand?.name ?? 'بوابة الطالب'}
            </div>
            {brand?.name && (
              <div className="text-muted text-[12px] leading-[1.4]">بوابة الطالب</div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pt-[14px] pb-10">{children}</main>
    </div>
  )
}

function PortalMessage({
  icon: Icon,
  title,
  hint,
}: {
  icon: IconComponent
  title: string
  hint: string
}) {
  return (
    <StudentPortalShell>
      <Card className="text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
    </StudentPortalShell>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: IconComponent; children: React.ReactNode }) {
  return (
    <h3 className="type-section mt-5 mb-2 first:mt-0 flex items-center gap-2">
      <Icon size={22} className="text-primary" />
      {children}
    </h3>
  )
}

/** تسمية شهر الفاتورة: '2026-11-01' → اسم الشهر والسنة بالعربية */
function periodLabel(periodMonth: string): string {
  const d = new Date(`${periodMonth.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return periodMonth.slice(0, 7)
  return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
}

export function StudentPortalPage() {
  const [searchParams] = useSearchParams()
  const rawToken = searchParams.get('t') ?? searchParams.get('token')

  const overviewQ = useStudentPortalOverview(rawToken)

  if (!rawToken) {
    return (
      <PortalMessage
        icon={Link2Off}
        title="الرابط غير مكتمل"
        hint="الرابط اللي فتحته ناقص. افتح الرابط زي ما وصلك من المدرس بالظبط على واتساب، أو اطلب منه يبعته تاني."
      />
    )
  }

  if (overviewQ.isPending) {
    return (
      <StudentPortalShell>
        <SkeletonCards cards={3} />
      </StudentPortalShell>
    )
  }

  if (overviewQ.isError || !overviewQ.data) {
    const info = studentPortalErrorInfo(overviewQ.error)
    return <PortalMessage icon={Clock} title={info.title} hint={info.hint} />
  }

  const o = overviewQ.data
  const rate = o.attendance_rate
  const hw = o.homework_summary

  // محوّل Push لبوابة الطالب (Phase 4 خطوة 2): الحفظ/الإيقاف/الحالة عبر
  // RPC بتوكن الطالب تربط الاشتراك بالطالب وبصف توكنه.
  const pushAdapter: PortalPushAdapter = {
    status: (endpoint) => fetchStudentPushStatus(rawToken, endpoint),
    subscribe: (keys) => subscribeStudentPush(rawToken, keys),
    unsubscribe: (endpoint) => unsubscribeStudentPush(rawToken, endpoint),
  }

  return (
    <StudentPortalShell brand={o.brand}>
      {/* البانر: الاسم + نسبة الحضور + الموقف المالي */}
      <Card>
        <div className="text-[19px] font-extrabold leading-[1.7] flex items-center gap-2">
          <GraduationCap size={24} className="text-primary shrink-0" />
          {o.student.name}
        </div>
        <div className="text-muted text-[13.5px] mt-0.5">
          الكود: <span dir="ltr">{o.student.code}</span>
          {o.student.grade ? ` · ${o.student.grade}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl border border-border bg-bg p-3 text-center">
            <div className="text-muted text-[12px] font-semibold mb-0.5">نسبة حضوري</div>
            {rate == null ? (
              <div className="text-[15px] font-bold text-muted">لسه مفيش حصص متسجلة</div>
            ) : (
              <div
                className={`text-[20px] font-extrabold ${rate >= 80 ? 'text-ok-text' : 'text-warn-text'}`}
              >
                {rate}%
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-bg p-3 text-center">
            <div className="text-muted text-[12px] font-semibold mb-0.5">المستحق عليّ</div>
            {o.balance > 0 ? (
              <div className="text-[20px] font-extrabold text-bad-text">{formatMoney(o.balance)}</div>
            ) : (
              <div className="text-[20px] font-extrabold text-ok-text flex items-center justify-center gap-1.5">
                مسدد <Check size={22} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* إشعارات Push الفورية — اشتراك اختياري من البوابة (Phase 4 خطوة 2) */}
      <PortalPushToggle adapter={pushAdapter} />

      {/* ١) حصصي القادمة */}
      <SectionTitle icon={CalendarDays}>حصصي القادمة</SectionTitle>
      {o.upcoming_sessions.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">
            مفيش حصص جاية متجدولة حالياً — ممكن جدول الشهر الجديد لسه ما اتعملش، اسأل المدرس.
          </p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.upcoming_sessions.map((s, i) => (
            <div
              key={`${s.date}-${s.start_time}-${s.group_name}-${i}`}
              className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.upcoming_sessions.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{s.group_name}</div>
                <div className="text-muted text-[12px]">
                  {formatDateLabel(s.date)} · الساعة {formatTime12(s.start_time)} · {s.duration_minutes} دقيقة
                  {s.room ? ` · ${s.room}` : ''}
                  {s.kind === 'extra' ? ' · حصة إضافية' : s.kind === 'moved' ? ' · حصة منقولة' : ''}
                </div>
              </div>
              <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2.5 py-1 whitespace-nowrap">
                {formatDayMonth(s.date)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* مواعيد مجموعاتي الثابتة وروابط الملازم */}
      {o.groups.length > 0 && (
        <>
          <SectionTitle icon={Users}>مجموعاتي ومواعيدها</SectionTitle>
          {o.groups.map((g) => (
            <Card key={g.name}>
              <div className="font-bold text-[15px]">{g.name}</div>
              <div className="text-muted text-[13.5px] mt-0.5">
                {daysLabel(g.days)} · الساعة {formatTime12(g.start_time)}
                {g.room ? ` · ${g.room}` : ''}
              </div>
              {g.links.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {g.links.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[48px] text-[13.5px] font-semibold bg-soft text-primary rounded-full px-3 no-underline max-w-full"
                      dir="ltr"
                    >
                      <Link2 size={16} className="shrink-0" />
                      <span className="truncate">{link}</span>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      {/* ٢) واجباتي */}
      <SectionTitle icon={BookOpenCheck}>واجباتي</SectionTitle>
      {hw.marked > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold">سلّمت الواجب في</span>
            <span
              className={`text-[15px] font-extrabold ${hw.submitted >= hw.marked / 2 ? 'text-ok-text' : 'text-warn-text'}`}
            >
              {hw.submitted} من {hw.marked} حصة
            </span>
          </div>
          <div className="h-2 rounded-full bg-soft overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${hw.marked > 0 ? Math.round((hw.submitted / hw.marked) * 100) : 0}%` }}
            />
          </div>
        </Card>
      )}
      {o.homework.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">لسه مفيش حصص متسجلة بواجبات.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.homework.map((h, i) => {
            const meta = STUDENT_PORTAL_ATT_META[h.status] ?? {
              label: h.status,
              badge: 'bg-soft text-muted border-border',
            }
            return (
              <div
                key={`${h.date}-${h.group_name}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.homework.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">{h.group_name}</div>
                  <div className="text-muted text-[12px]">{h.date}</div>
                </div>
                <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                  {meta.label}
                </span>
                {h.status === 'a' ? (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-soft text-muted border-border">
                    كنت غائب
                  </span>
                ) : h.homework_done ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold border rounded-full px-2.5 py-1 bg-ok/10 text-ok-text border-ok/30">
                    <Check size={14} /> الواجب اتسلّم
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold border rounded-full px-2.5 py-1 bg-bad/10 text-bad-text border-bad/30">
                    <X size={14} /> الواجب ناقص
                  </span>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {/* ٣) درجاتي ونتائج امتحاناتي الإلكترونية */}
      <SectionTitle icon={NotebookPen}>درجاتي</SectionTitle>
      {o.grades.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">لسه مفيش درجات مسجلة.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.grades.map((s, i) => {
            const pct = pctOf(s.score, s.max_score)
            return (
              <div
                key={`${s.title}-${s.date}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.grades.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">{s.title}</div>
                  <div className="text-muted text-[12px]">
                    {s.date} · {ASSESSMENT_TYPE_LABELS[s.type] ?? s.type}
                    {s.source === 'online_exam' ? ' · امتحان إلكتروني' : ''}
                  </div>
                </div>
                <div className="text-[13.5px] font-semibold whitespace-nowrap">
                  {fmtScore(s.score)} من {fmtScore(s.max_score)}
                </div>
                {pct != null && (
                  <span
                    className={`min-w-[48px] text-center text-[12px] font-extrabold rounded-full px-2 py-1 text-white ${pct >= 50 ? 'bg-ok' : 'bg-bad'}`}
                  >
                    {pct}%
                  </span>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {o.exam_results.length > 0 && (
        <>
          <SectionTitle icon={Trophy}>نتائج امتحاناتي الإلكترونية</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.exam_results.map((r, i) => (
              <div
                key={`${r.title}-${r.submitted_at}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.exam_results.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">{r.title}</div>
                  <div className="text-muted text-[12px]">
                    محاولة {r.attempt_no} · {r.submitted_at.slice(0, 10)}
                    {r.score_posted ? ' · دي الدرجة المحسوبة في ملفك' : ''}
                  </div>
                </div>
                <div className="text-[13.5px] font-semibold whitespace-nowrap">
                  {fmtScore(r.score)} من {fmtScore(r.max_score)}
                </div>
                <span
                  className={`min-w-[48px] text-center text-[12px] font-extrabold rounded-full px-2 py-1 text-white ${r.pct >= 50 ? 'bg-ok' : 'bg-bad'}`}
                >
                  {Math.round(r.pct)}%
                </span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* ٤) مدفوعاتي */}
      <SectionTitle icon={Wallet}>مدفوعاتي وحسابي</SectionTitle>
      {o.invoices.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">لسه مفيش فواتير صادرة باسمك.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.invoices.map((inv, i) => (
            <div
              key={`${inv.period_month}-${inv.group_name}-${i}`}
              className={`px-[14px] py-2.5 ${i < o.invoices.length - 1 ? 'border-b border-border' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">
                    {periodLabel(inv.period_month)} — {inv.group_name}
                  </div>
                  <div className="text-muted text-[12px]">
                    الإجمالي {formatMoney(inv.total)} · اتدفع {formatMoney(inv.paid)}
                  </div>
                </div>
                {inv.is_paid ? (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-ok/10 text-ok-text border-ok/30">
                    خالصة
                  </span>
                ) : (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-bad/10 text-bad-text border-bad/30">
                    باقي {formatMoney(inv.balance)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {o.recent_payments.length > 0 && (
        <>
          <SectionTitle icon={ReceiptText}>آخر دفعاتي</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.recent_payments.map((p, i) => (
              <div
                key={`${p.receipt_no}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.recent_payments.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">
                    {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                  </div>
                  <div className="text-muted text-[12px]">
                    {p.paid_on} · إيصال <span dir="ltr">{p.receipt_no}</span>
                  </div>
                </div>
                {p.amount < 0 && (
                  <span className="text-[12px] font-bold border rounded-full px-2.5 py-1 bg-warn/15 text-warn-text border-warn/40">
                    دفعة عكسية
                  </span>
                )}
              </div>
            ))}
          </Card>
        </>
      )}

      <p className="text-center text-muted text-[12px] mt-5 mb-0">
        بوابة الطالب — الرابط صالح لمدة 30 يوم من إنشائه، ودي بياناتك انت بس.
      </p>
    </StudentPortalShell>
  )
}
