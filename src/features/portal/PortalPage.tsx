import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ImagePlus,
  Link2,
  Link2Off,
  NotebookPen,
  NotebookText,
  Send,
  Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Chip, ChipRow, Field, FormError, TextInput } from '../../components/ui/form'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatMoney, shortTime } from '../../lib/format'
import type { PaymentMethod } from '../../types/database'
import { fmtScore, pctOf } from '../grades/api'
import { PAYMENT_METHOD_LABELS } from '../invoices/api'
import {
  PORTAL_ATT_META,
  PORTAL_NOTIF_META,
  PROOF_METHODS,
  PROOF_STATUS_META,
  fetchGuardianPushStatus,
  portalErrorInfo,
  subscribeGuardianPush,
  unsubscribeGuardianPush,
  type PortalBrand,
} from './api'
import { PortalPushToggle, type PortalPushAdapter } from '../../components/PortalPushToggle'
import { darken } from '../../lib/brand'
import {
  useMarkPortalNotificationsRead,
  usePortalNotifications,
  usePortalOverview,
  usePortalProofs,
  useSubmitPortalProof,
} from './hooks'

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

function PortalShell({
  children,
  brand,
}: {
  children: React.ReactNode
  /** الهوية البيضاء (0008) — تُمرَّر بعد تحميل العرض فقط؛ غيابها = الشكل الافتراضي */
  brand?: PortalBrand | null
}) {
  // لون اللهجة يلوّن عناصر الأساسي في البوابة كلها عبر متغيرات الثيم —
  // بلا لهجة تبقى نيلي الثقة كما هي.
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
              {brand?.name ?? 'بوابة ولي الأمر'}
            </div>
            {brand?.name && (
              <div className="text-muted text-[12px] leading-[1.4]">بوابة ولي الأمر</div>
            )}
          </div>
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

/**
 * قسم «إثبات دفع» (Phase 2 خطوة 7): ولي الأمر يرفع لقطة التحويل من نفس
 * جلسة توكن البوابة — الصفحة مرتبطة بطالب واحد (طالب الرابط) فالإثبات
 * له حصراً. الإرسال عبر submitPaymentProof (RPC إنشاء بالتوكن ← رفع
 * لStorage خاص ← RPC تأكيد)، وتحت النموذج تظهر إثباتاته السابقة
 * بحالاتها: قيد مراجعة المدرس / معتمد / مرفوض مع السبب.
 */
function PaymentProofSection({
  studentId,
  rawToken,
  balance,
}: {
  studentId: string
  rawToken: string
  balance: number
}) {
  const proofsQ = usePortalProofs(studentId, rawToken)
  const submit = useSubmitPortalProof(studentId, rawToken)

  const [amount, setAmount] = useState(() => (balance > 0 ? String(balance) : ''))
  const [method, setMethod] = useState<PaymentMethod>('vodafone_cash')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const amt = parseFloat(amount) || 0
  const proofs = proofsQ.data ?? []

  return (
    <>
      <SectionTitle icon={Send}>إثبات دفع</SectionTitle>
      <Card>
        <p className="text-muted text-[13.5px] mt-0">
          حوّلت بالمحفظة أو إنستاباي؟ ابعت لقطة التحويل هنا والمدرس هيعتمدها فتتسجل دفعة
          رسمية بإيصال — هتلاقي حالتها هنا «قيد مراجعة المدرس» لحد ما يراجعها.
        </p>

        {sent && (
          <p className="flex items-start gap-2 bg-ok-soft text-ok-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0" role="status">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>وصل الإثبات للمدرس وهو دلوقتي قيد مراجعته. الاعتماد هيظهر هنا وهيتخصم من المستحق.</span>
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!file) return
            submit.mutate(
              { amount: amt, method, file },
              {
                onSuccess: () => {
                  setSent(true)
                  setFile(null)
                  setPreviewUrl(null)
                },
              },
            )
          }}
        >
          <Field label="مبلغ التحويل (ج) — زي ما هو في اللقطة بالظبط">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 400"
            />
          </Field>

          <div className="block mb-3">
            <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
              طريقة التحويل
            </span>
            <ChipRow>
              {PROOF_METHODS.map((m) => (
                <Chip key={m.code} active={method === m.code} onClick={() => setMethod(m.code)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <div className="block mb-3">
            <span className="block text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
              لقطة التحويل (صورة JPG أو PNG أو WebP — لحد 5 ميجا)
            </span>
            <label className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border border-dashed border-border bg-bg px-3 cursor-pointer text-[15px] font-semibold text-primary">
              <ImagePlus size={20} />
              {file ? file.name : 'اختار صورة التحويل'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setSent(false)
                  setPreviewUrl(f ? URL.createObjectURL(f) : null)
                }}
              />
            </label>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="معاينة لقطة التحويل"
                className="w-full max-h-[260px] object-contain rounded-xl border border-border bg-bg mt-2"
              />
            )}
          </div>

          {submit.isError && (
            <FormError message={submit.error instanceof Error ? submit.error.message : 'حصل خطأ غير متوقع'} />
          )}

          <Button full type="submit" disabled={submit.isPending || !file || !(amt > 0)}>
            {submit.isPending ? 'بنبعت الإثبات…' : 'إرسال الإثبات للمدرس'}
          </Button>
        </form>
      </Card>

      {proofs.length > 0 && (
        <Card className="p-0 overflow-hidden mt-3">
          {proofs.map((p, i) => {
            const meta = PROOF_STATUS_META[p.status]
            return (
              <div
                key={p.id}
                className={`px-[14px] py-2.5 ${i < proofs.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px]">
                      {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                    </div>
                    <div className="text-muted text-[12px]">{p.created_at.slice(0, 10)}</div>
                  </div>
                  <span className={`text-[12px] font-bold border rounded-full px-2.5 py-1 ${meta.badge}`}>
                    {meta.label}
                  </span>
                </div>
                {p.status === 'rejected' && p.rejection_reason && (
                  <p className="text-bad-text text-[13.5px] mt-1 mb-0">سبب الرفض: {p.rejection_reason}</p>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </>
  )
}

/** وقت حدث التنبيه (ISO) بصيغة ساعة مقروءة — التاريخ يأتي من الحصة نفسها */
function fmtEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

/**
 * قسم «تنبيهات الوصول والمغادرة» (Phase 3 خطوة 6): صندوق ولي الأمر
 * داخل البوابة نفسها — تنبيه «وصل» يتولد عند أول تسجيل حضور للطالب في
 * الحصة و«غادر» عند تسجيل انصرافه، ويُقرأ عبر RPC بالتوكن مقيداً بهذا
 * الطالب فقط، مع عدّاد غير مقروء وزر تعليم الكل كمقروء (RPC كتابة
 * مقيدة بالتوكن تضبط read_at فقط). ومن Phase 4 خطوة 2 يصل نفس الحدث
 * أيضاً كـ Push فوري لاشتراكات البوابة النشطة (مشغّل خادمي على توليد
 * التنبيه نفسه في 0014) — الصندوق هنا يبقى سجل القراءة الدائم.
 */
function NotificationsSection({
  studentId,
  rawToken,
}: {
  studentId: string
  rawToken: string
}) {
  const notifQ = usePortalNotifications(studentId, rawToken)
  const markRead = useMarkPortalNotificationsRead(studentId, rawToken)
  const notifications = notifQ.data?.notifications ?? []
  const unread = notifQ.data?.unread_count ?? 0

  return (
    <>
      <SectionTitle icon={Bell}>
        تنبيهات الوصول والمغادرة
        {unread > 0 && (
          <span className="text-[12px] font-extrabold bg-bad text-white rounded-full px-2 py-0.5">
            {unread} جديد
          </span>
        )}
      </SectionTitle>
      {notifQ.isPending ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">بنحمّل التنبيهات…</p>
        </Card>
      ) : notifQ.isError ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">
            ماقدرناش نحمّل التنبيهات دلوقتي — حدّث الصفحة وحاول تاني.
          </p>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <p className="text-muted text-[13.5px] mb-0">
            لسه مفيش تنبيهات — أول ما المدرس يسجّل وصول الطالب أو انصرافه من حصة هيظهر هنا.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            {notifications.map((n, i) => {
              const meta = PORTAL_NOTIF_META[n.kind]
              const isUnread = !n.read_at
              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 px-[14px] py-2.5 ${
                    i < notifications.length - 1 ? 'border-b border-border' : ''
                  } ${isUnread ? 'bg-soft/60' : ''}`}
                >
                  <span
                    className={`text-[12px] font-bold border rounded-full px-2.5 py-1 shrink-0 ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] truncate">{n.group_name}</div>
                    <div className="text-muted text-[12px]">
                      {n.session_date} · الساعة {fmtEventTime(n.event_at)}
                    </div>
                  </div>
                  {isUnread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-bad shrink-0" aria-label="غير مقروء" />
                  )}
                </div>
              )
            })}
          </Card>
          {unread > 0 && (
            <Button
              variant="soft"
              className="mt-2 min-h-[48px] text-[13.5px] px-3"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              <Check size={18} />
              {markRead.isPending ? 'بنعلّم…' : 'تعليم الكل كمقروء'}
            </Button>
          )}
        </>
      )}
    </>
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

  // محوّل Push لبوابة ولي الأمر (Phase 4 خطوة 2): الحفظ/الإيقاف/الحالة
  // عبر RPC بالتوكن تربط الاشتراك بهذا الطالب وبوليّ أمره — يُبنى من
  // معالم الرابط مباشرة فلا يدخل أي كاش استعلامات.
  const pushAdapter: PortalPushAdapter = {
    status: (endpoint) => fetchGuardianPushStatus(rawToken, studentId, endpoint),
    subscribe: (keys) => subscribeGuardianPush(rawToken, studentId, keys),
    unsubscribe: (endpoint) => unsubscribeGuardianPush(rawToken, studentId, endpoint),
  }

  return (
    <PortalShell brand={o.brand}>
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

      {/* إشعارات Push الفورية — اشتراك اختياري من البوابة (Phase 4 خطوة 2) */}
      <PortalPushToggle adapter={pushAdapter} />

      {/* تنبيهات الوصول والمغادرة — صندوق ولي الأمر (خطوة 6، Phase 3) */}
      <NotificationsSection studentId={studentId} rawToken={rawToken} />

      {/* إثبات دفع — رفع لقطة تحويل ومراجعة المدرس (خطوة 7) */}
      <PaymentProofSection studentId={studentId} rawToken={rawToken} balance={o.balance} />

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
        بوابة ولي الأمر — الرابط صالح لمدة 30 يوم من إنشائه.
      </p>
    </PortalShell>
  )
}
