import { useParams, useSearchParams } from 'react-router-dom'
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock,
  Link2,
  Link2Off,
  NotebookPen,
  NotebookText,
  Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatMoney, shortTime } from '../../lib/format'
import { fmtScore, pctOf } from '../grades/api'
import { PORTAL_ATT_META, portalErrorInfo } from './api'
import { usePortalOverview } from './hooks'

/**
 * بوابة ولي الأمر العامة — الخطوة 9 (المواصفات §3.17).
 *
 * صفحة عامة بلا جلسة مدرس وبلا AppShell: الرابط الموقّع هو الاعتماد
 * الوحيد — /portal?student=<uuid>&t=<rawToken> (ويُقبل أيضاً
 * /portal/<uuid>?t=). التحقق والعرض كله عبر RPC واحدة مقيدة الحقول
 * (portal_overview_by_token) بالـ anon key؛ لا قراءة مباشرة لأي جدول.
 *
 * العرض محدود كما في §3.17 وكما يعيده الـ RPC حرفياً: اسم الطالب
 * وكوده وصفه، نسبة الحضور، الموقف المالي (مستحق/مسدد)، مواعيد
 * مجموعاته وروابط ملازمها، آخر الدرجات، ملاحظات المدرس، وآخر
 * 10 حصص حضور — لا شيء beyond ذلك.
 */

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-20 h-[52px] bg-card border-b border-border">
        <div className="mx-auto max-w-[640px] h-full px-4 flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-soft text-primary flex items-center justify-center">
            <Users size={20} />
          </span>
          <div className="type-section">بوابة ولي الأمر</div>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pt-[14px] pb-10">{children}</main>
    </div>
  )
}

function PortalMessage({ icon: Icon, title, hint }: { icon: IconComponent; title: string; hint: string }) {
  return (
    <PortalShell>
      <Card className="text-center py-8">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
    </PortalShell>
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

export function PortalPage() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const studentId = params.studentId ?? searchParams.get('student')
  const rawToken = searchParams.get('t') ?? searchParams.get('token')

  const overviewQ = usePortalOverview(studentId, rawToken)

  if (!studentId || !rawToken) {
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
      <PortalShell>
        <SkeletonCards cards={3} />
      </PortalShell>
    )
  }

  if (overviewQ.isError || !overviewQ.data) {
    const info = portalErrorInfo(overviewQ.error)
    return <PortalMessage icon={Clock} title={info.title} hint={info.hint} />
  }

  const o = overviewQ.data
  const rate = o.attendance_rate

  return (
    <PortalShell>
      {/* البانر: الاسم + KPI الحضور + KPI الموقف المالي (§3.17) */}
      <Card>
        <div className="text-[19px] font-extrabold leading-[1.7]">{o.student.name}</div>
        <div className="text-muted text-[13.5px] mt-0.5">
          الكود: <span dir="ltr">{o.student.code}</span>
          {o.student.grade ? ` · ${o.student.grade}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl border border-border bg-bg p-3 text-center">
            <div className="text-muted text-[12px] font-semibold mb-0.5">نسبة الحضور</div>
            {rate == null ? (
              <div className="text-[15px] font-bold text-muted">لسه مفيش حصص متسجلة</div>
            ) : (
              <div className={`text-[20px] font-extrabold ${rate >= 80 ? 'text-ok-text' : 'text-warn-text'}`}>
                {rate}%
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-bg p-3 text-center">
            <div className="text-muted text-[12px] font-semibold mb-0.5">الموقف المالي</div>
            {o.balance > 0 ? (
              <div className="text-[20px] font-extrabold text-bad-text">{formatMoney(o.balance)}</div>
            ) : (
              <div className="text-[20px] font-extrabold text-ok-text flex items-center justify-center gap-1.5">مسدد <Check size={22} /></div>
            )}
          </div>
        </div>
        {o.balance > 0 && (
          <p className="text-muted text-[12px] mt-2 mb-0">
            ده إجمالي المبلغ المستحق حالياً على الطالب. لأي استفسار تواصل مع المدرس.
          </p>
        )}
      </Card>

      {/* مواعيد الحصص */}
      <SectionTitle icon={CalendarDays}>مواعيد الحصص</SectionTitle>
      {o.groups.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">الطالب غير مسجل في أي مجموعة حالياً.</p>
        </Card>
      ) : (
        o.groups.map((g) => (
          <Card key={g.name}>
            <div className="font-bold text-[15px]">{g.name}</div>
            <div className="text-muted text-[13.5px] mt-0.5">
              {daysLabel(g.days)} · الساعة {shortTime(g.start_time)}
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
        ))
      )}

      {/* آخر الدرجات */}
      <SectionTitle icon={NotebookPen}>آخر الدرجات</SectionTitle>
      {o.latest_scores.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">لسه مفيش درجات مسجلة.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.latest_scores.map((s, i) => {
            const pct = pctOf(s.score, s.max_score)
            return (
              <div
                key={`${s.title}-${s.date}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.latest_scores.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">{s.title}</div>
                  <div className="text-muted text-[12px]">{s.date}</div>
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

      {/* ملاحظات المدرس */}
      {o.notes.length > 0 && (
        <>
          <SectionTitle icon={NotebookText}>ملاحظات المدرس</SectionTitle>
          <Card className="p-0 overflow-hidden">
            {o.notes.map((n, i) => (
              <div
                key={`${n.date}-${i}`}
                className={`px-[14px] py-2.5 ${i < o.notes.length - 1 ? 'border-b border-border' : ''}`}
              >
                <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                  {n.date}
                </span>
                <p className="text-[15px] mt-1 mb-0">{n.text}</p>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* سجل الحضور الأخير */}
      <SectionTitle icon={CalendarCheck2}>سجل الحضور الأخير</SectionTitle>
      {o.recent_attendance.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">لسه مفيش حضور متسجل.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {o.recent_attendance.map((a, i) => {
            const meta = PORTAL_ATT_META[a.status] ?? { label: a.status, badge: 'bg-soft text-muted border-border' }
            return (
              <div
                key={`${a.date}-${a.group_name}-${i}`}
                className={`flex items-center gap-3 px-[14px] py-2.5 ${i < o.recent_attendance.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">{a.group_name}</div>
                  <div className="text-muted text-[12px]">{a.date}</div>
                </div>
                <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                  {meta.label}
                </span>
              </div>
            )
          })}
        </Card>
      )}

      <p className="text-center text-muted text-[12px] mt-5 mb-0">
        صفحة قراءة فقط لولي الأمر — الرابط صالح لمدة 30 يوم من إنشائه.
      </p>
    </PortalShell>
  )
}
