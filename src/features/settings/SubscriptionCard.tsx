import { Crown } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { useEffectiveEntitlements, useSubscription } from '../platform-admin/hooks'
import { t } from '../../i18n'

/**
 * بطاقة «باقتك الحالية» في الإعدادات (مهمة 19 — 0058): عرض قراءة
 * فقط لباقة مساحة العمل وحدودها وحالتها — بلا زر ترقية ولا إنفاذ
 * حدود (الخطوة 5) ولا دفع. مالك فقط.
 * حتى تُطبَّق 0058 عند بوابة تجميد فيز 2 ترجع الدالة null فتُخفى
 * البطاقة بأدب — لا باقة افتراضية مخترعة ولا رسالة خطأ مزعجة.
 */
export function SubscriptionCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const subQ = useSubscription(teacherId || undefined, isOwner)
  // الاستحقاقات الفعّالة (0059): سطر واحد «تفعيل خاص» عند وجود تجاوز
  // نشط — تُخفى تماماً قبل تطبيق المهاجرة (الدالة غائبة → null).
  const entQ = useEffectiveEntitlements(teacherId || undefined, isOwner)

  if (!isOwner) return null
  const sub = subQ.data
  if (!sub) return null
  const hasOverride =
    (entQ.data?.overridesApplied.length ?? 0) > 0
  // الحدود المعروضة هي الفعّالة (باقة ⊕ تجاوز) عند توفرها — وإلا
  // حدود الباقة نفسها؛ فلا تُعرض أرقام تجاوزها التجاوز.
  const limits = entQ.data?.limits ?? sub.limits

  const statusLabel =
    sub.status === 'active'
      ? t('settings.planStatusActive')
      : sub.status === 'past_due'
        ? t('settings.planStatusPastDue')
        : sub.status === 'cancelled'
          ? t('settings.planStatusCancelled')
          : t('settings.planStatusTrial')

  const rows: Array<{ label: string; limit: number | null; unit?: string }> =
    [
      { label: t('settings.planLimitStudents'), limit: limits.maxStudents },
      {
        label: t('settings.planLimitMessages'),
        limit: limits.maxMessagesMonth,
      },
      {
        label: t('settings.planLimitStorage'),
        limit: limits.maxStorageMb,
        unit: t('settings.planUnitMb'),
      },
      { label: t('settings.planLimitTeam'), limit: limits.maxTeamMembers },
      {
        label: t('settings.planLimitAi'),
        limit: limits.maxAiMessagesMonth,
      },
    ]

  const formatLimit = (limit: number | null, unit?: string): string => {
    if (limit === null) return t('settings.planUnlimited')
    return unit ? `${limit.toLocaleString('ar-EG')} ${unit}` : limit.toLocaleString('ar-EG')
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Crown size={20} className="text-primary" />
        <span className="type-section">{t('settings.planCardTitle')}</span>
      </div>
      <p className="text-muted text-[13.5px] mb-3">{t('settings.planCardIntro')}</p>

      <div className="flex items-center gap-2 mb-3">
        <span className="font-bold text-[15px]">{sub.planName}</span>
        <span className="text-muted text-[13.5px]">({statusLabel})</span>
        {sub.isPilot && (
          <span className="text-[12px] font-semibold text-primary-d bg-soft rounded-full px-2 py-0.5">
            {t('settings.planPilotBadge')}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mb-0">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <dt className="text-muted text-[12.5px]">{row.label}</dt>
            <dd className="text-[15px] font-semibold mb-0">
              {formatLimit(row.limit, row.unit)}
            </dd>
          </div>
        ))}
      </dl>

      {sub.trialEndsAt && (
        <p className="text-muted text-[13.5px] mt-3 mb-0">
          {t('settings.planTrialEnds')}:{' '}
          {new Date(sub.trialEndsAt).toLocaleDateString('ar-EG')}
        </p>
      )}

      {hasOverride && (
        <p className="text-primary text-[13.5px] font-semibold mt-3 mb-0">
          {t('settings.planOverrideNote')}
        </p>
      )}
    </Card>
  )
}
