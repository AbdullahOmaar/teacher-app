import { Link } from 'react-router-dom'
import { ArrowLeft, Crown, LayoutTemplate } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { t } from '../../i18n'
import { useEffectiveEntitlements } from '../platform-admin/hooks'

/**
 * بطاقة دخول «الصفحة الشخصية العامة» في الإعدادات (0074 — 3A-929):
 * ظاهرة للمالك دائماً — الفيتشر خطة «برو» فتُعرض بشارة القفل لمن لا
 * استحقاق له (التفعيل اليدوي من لوحة الأدمن عبر تجاوزات الحساب)،
 * والزر ينقل لشاشات الإدارة المستقلة (لا صفحة مجمّعة). تُخفى كلياً
 * للمساعدين (المالك فقط — نمط SubscriptionCard).
 */
export function ProfileSettingsCard() {
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const entQ = useEffectiveEntitlements(teacherId, isOwner)

  if (!isOwner || !teacherId || entQ.data == null) return null
  const entitled = entQ.data.features.personal_page === true

  return (
    <Card>
      <div className="flex items-start gap-2.5 mb-2">
        <span className="w-10 h-10 rounded-full bg-soft text-primary flex items-center justify-center shrink-0">
          <LayoutTemplate size={20} />
        </span>
        <div className="min-w-0">
          <div className="type-section flex items-center gap-2">
            {t('profile.cardTitle')}
            {!entitled ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold bg-warn/15 text-warn-text rounded-full px-2 py-0.5">
                <Crown size={13} />
                {t('profile.proBadge')}
              </span>
            ) : null}
          </div>
          <p className="text-muted type-secondary mb-0">
            {entitled ? t('profile.cardHint') : t('profile.cardLockedHint')}
          </p>
        </div>
      </div>
      <Link to="/profile-page">
        <Button variant="soft" full>
          {t('profile.manageTitle')}
          <ArrowLeft size={17} />
        </Button>
      </Link>
    </Card>
  )
}
