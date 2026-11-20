import { Link } from 'react-router-dom'
import { CalendarX2, CheckCheck, ReceiptText, ShieldCheck, UserRound } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { useAuth } from '../../lib/AuthProvider'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { atRiskWaUrl, type AtRiskStudent } from './api'
import { useAtRisk, useMarkAtRiskFollowedUp } from './hooks'

/**
 * صفحة «معرّضون للفقد» (Phase 5 / خطوة 1): القائمة الكاملة مرتبة
 * بالخطورة (أسباب أكثر ← غياب أطول ← متأخرات أكبر)، ولكل طالب إجراءات
 * فورية: متابعة واتساب لولي الأمر بنص جاهز باسم السنتر يناسب سببه،
 * فتح ملفه، و«تمت المتابعة» التي تُخفيه حتى حدث خطر جديد (0018).
 * التعريف معروض للمدرس نفسه أعلى الصفحة بجملة واحدة — لا صندوق أسود.
 */
export function AtRiskPage() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const { user } = useAuth()
  const toast = useToast()
  const { brand } = useBrandIdentity(teacherId, isOwner)

  const atRiskQ = useAtRisk(teacherId, isOwner)
  const followUp = useMarkAtRiskFollowedUp(teacherId)

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const items = atRiskQ.data ?? []

  const onFollowedUp = (item: AtRiskStudent) => {
    if (!user) return
    followUp.mutate(
      {
        studentId: item.student.id,
        userId: user.id,
        reasonsSummary: item.reasons.map((r) => r.text).join(' · '),
      },
      {
        onSuccess: () => toast('تمت المتابعة — هيظهر تاني بس لو حصل سبب خطر جديد'),
        onError: () => toast('معلش، تسجيل المتابعة فشل — حاول تاني'),
      },
    )
  }

  return (
    <div>
      <p className="text-muted text-[13.5px] leading-[1.8] mb-3 mt-0">
        طالب نشط غاب <b className="text-text">3 حصص متتالية</b> أو عليه اشتراك{' '}
        <b className="text-text">متأخر من شهرين أو أكتر</b> — القائمة بتتبني لوحدها من
        الحضور والفواتير، ومتابعة واحدة بدري ممكن تنقذ اشتراكه.
        {!isOwner && ' (أسباب المتأخرات بتظهر لمالك الحساب بس.)'}
      </p>

      {atRiskQ.isPending ? (
        <LoadingState />
      ) : atRiskQ.error ? (
        <ErrorState
          message={atRiskQ.error instanceof Error ? atRiskQ.error.message : 'خطأ غير معروف'}
          onRetry={() => void atRiskQ.refetch()}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="مفيش طلاب معرّضين للفقد"
            hint="كل الطلاب النشطين حضورهم منتظم ومفيش متأخرات قديمة — القائمة هتظهر هنا لوحدها أول ما حد يستحق المتابعة."
          />
        </Card>
      ) : (
        items.map((item) => {
          const waUrl = atRiskWaUrl(item, brand.name)
          const busy =
            followUp.isPending && followUp.variables?.studentId === item.student.id
          return (
            <Card key={item.student.id}>
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={item.student.name} />
                <div className="min-w-0">
                  <div className="font-bold text-[15px] leading-[1.6]">{item.student.name}</div>
                  <div className="text-muted text-[12px]" dir="ltr">
                    {item.student.public_code}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mb-3">
                {item.reasons.map((reason) => (
                  <div
                    key={reason.kind}
                    className="flex items-center gap-2 text-[13.5px] font-semibold"
                  >
                    {reason.kind === 'absence' ? (
                      <CalendarX2 size={17} className="text-warn-text shrink-0" />
                    ) : (
                      <ReceiptText size={17} className="text-warn-text shrink-0" />
                    )}
                    <span>
                      {reason.text}
                      {reason.kind === 'absence' && (
                        <span className="text-muted font-normal"> — {reason.groupName}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* زر الواتساب موحّد اللون مع زر الإشعارات (W6 — R-3):
                  أخضر ناعم بنص ok-text المضمون التباين في الثيمين، بدل
                  الحشوة الخضراء الكاملة بنص أبيض (3.39:1 فقط) */}
              <div className="flex flex-wrap gap-2">
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold bg-ok/10 text-ok-text border border-ok/30 no-underline hover:bg-ok/15"
                  >
                    متابعة واتساب
                  </a>
                ) : (
                  <span className="inline-flex items-center text-muted text-[13px]">
                    مفيش رقم ولي أمر صالح للواتساب
                  </span>
                )}
                <Link
                  to={`/students/${item.student.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] text-[15px] font-semibold bg-transparent border border-border text-text no-underline hover:bg-soft"
                >
                  <UserRound size={18} />
                  ملف الطالب
                </Link>
                <Button
                  variant="soft"
                  disabled={busy || !user}
                  onClick={() => onFollowedUp(item)}
                >
                  <CheckCheck size={18} />
                  {busy ? 'بيتسجل…' : 'تمت المتابعة'}
                </Button>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
