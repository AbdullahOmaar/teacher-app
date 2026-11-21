import { CalendarX2, CheckCheck, MessageCircle, ReceiptText, ShieldCheck, UserRound } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { ActionTile, ActionTiles } from '../../components/ui/ActionTiles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { useAuth } from '../../lib/AuthProvider'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { atRiskWaUrl, type AtRiskStudent } from './api'
import { useAtRisk, useMarkAtRiskFollowedUp } from './hooks'
import { t } from '../../i18n'

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
        onSuccess: () => toast(t('atrisk.pageFollowedUpToast')),
        onError: () => toast(t('atrisk.pageFollowUpErrorToast')),
      },
    )
  }

  return (
    <div>
      <p className="text-muted text-[13.5px] leading-[1.8] mb-3 mt-0">
        {t('atrisk.pageIntroPre')}<b className="text-text">{t('atrisk.pageIntroAbsence')}</b>{t('atrisk.pageIntroMid')}{' '}
        <b className="text-text">{t('atrisk.pageIntroOverdue')}</b>{t('atrisk.pageIntroPost')}
        {!isOwner && t('atrisk.pageIntroAssistantNote')}
      </p>

      {atRiskQ.isPending ? (
        <LoadingState />
      ) : atRiskQ.error ? (
        <ErrorState
          message={atRiskQ.error instanceof Error ? atRiskQ.error.message : t('common.unknownError')}
          onRetry={() => void atRiskQ.refetch()}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            mascot
            mascotPose="inspector"
            icon={ShieldCheck}
            title={t('atrisk.pageEmptyTitle')}
            hint={t('atrisk.pageEmptyHint')}
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
                        <span className="text-muted font-normal">{t('atrisk.pageReasonGroup', { name: reason.groupName })}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* صف إجراءات واحد (ملاحظات المالك نقطة ١): ثلاث خلايا
                  متساوية تماماً من نمط ActionTiles الموحّد (أيقونة فوق
                  تسمية، 68px) — الصف الأفقي المدمج جُرّب أولاً وقُصّت
                  تسميتاه الطويلتان («متابعة واتساب»/«تمت المتابعة») عند
                  390px، والخلايا المكدّسة هي النمط الوحيد الذي تتسع فيه
                  التسميات كاملة بسطر واحد وبلا سطر ثانٍ للأزرار.
                  ترتيب الأهمية والسلوك كما هما، ولون الواتساب الأخضر
                  الدلالي محفوظ (W6 — R-3: ok-text مضمون التباين) */}
              <ActionTiles>
                {waUrl ? (
                  <ActionTile
                    variant="ok"
                    icon={MessageCircle}
                    label={t('atrisk.pageWhatsappBtn')}
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                  />
                ) : (
                  <div className="h-[68px] flex items-center justify-center text-center text-muted text-[11px] leading-snug px-1">
                    {t('atrisk.pageNoWhatsapp')}
                  </div>
                )}
                <ActionTile
                  variant="ghost"
                  icon={UserRound}
                  label={t('atrisk.pageStudentFileBtn')}
                  to={`/students/${item.student.id}`}
                />
                <ActionTile
                  icon={CheckCheck}
                  label={busy ? t('atrisk.pageFollowingUp') : t('atrisk.pageFollowedUpBtn')}
                  disabled={busy || !user}
                  onClick={() => onFollowedUp(item)}
                />
              </ActionTiles>
            </Card>
          )
        })
      )}
    </div>
  )
}
