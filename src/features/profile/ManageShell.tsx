import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Crown, Eye, FileText, LayoutTemplate, Star } from 'lucide-react'
import { OwnerOnlyCard } from '../../components/OwnerOnlyCard'
import { Card } from '../../components/ui/Card'
import {
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
} from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { t } from '../../i18n'
import { useEffectiveEntitlements } from '../platform-admin/hooks'

/**
 * قشرة شاشات إدارة الصفحة الشخصية الأربع (0074): تحلّ الهوية (مالك
 * فقط)، وتقرأ الاستحقاق الفعّال، وتميّز غياب مهاجرة 0074 (حالة
 * «قريباً» المصممة — لا خطأ خام أبداً)، وترسم تنقّل الأقسام. كل
 * شاشة قسم مستقلة بمسارها (لا صفحة مجمّعة طويلة — قاعدة واجهة ثابتة).
 */

export interface ProfileManageContext {
  teacherId: string
  /** مستحق برو فعلياً (باقة ⊕ تجاوز) — الظهور العام يشتغل خادمياً به */
  entitled: boolean
}

const SECTIONS: { path: string; label: string; Icon: typeof Eye }[] = [
  { path: '/profile-page', label: t('profile.sectionProfile'), Icon: LayoutTemplate },
  { path: '/profile-page/posts', label: t('profile.sectionPosts'), Icon: FileText },
  { path: '/profile-page/content', label: t('profile.sectionContent'), Icon: FileText },
  { path: '/profile-page/ratings', label: t('profile.sectionRatings'), Icon: Star },
]

export function ProfileManageShell({
  children,
}: {
  children: (ctx: ProfileManageContext) => ReactNode
}) {
  const teacher = useCurrentTeacher()
  const location = useLocation()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'
  const entQ = useEffectiveEntitlements(teacherId, isOwner)

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (!isOwner || !teacherId) {
    return (
      <OwnerOnlyCard
        title={t('profile.ownerOnlyTitle')}
        body={t('profile.ownerOnlyBody')}
      />
    )
  }

  const entitled = entQ.data?.features.personal_page === true

  return (
    <div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {SECTIONS.map(({ path, label, Icon }) => {
          const active = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-[13.5px] font-semibold whitespace-nowrap border transition-colors ${
                active
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-card text-muted border-border hover:bg-soft'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </div>

      {!entitled && !entQ.isPending ? (
        <Card className="border-warn/40 bg-warn/5">
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-full bg-warn/15 text-warn-text flex items-center justify-center shrink-0">
              <Crown size={18} />
            </span>
            <div>
              <div className="type-section mb-0.5">{t('profile.lockedTitle')}</div>
              <p className="text-muted type-secondary mb-0">{t('profile.lockedHint')}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {children({ teacherId, entitled })}
    </div>
  )
}

/** حالة «قريباً» المصممة عند غياب مخطط 0074 — لا خطأ خام أبداً */
export function ProfileComingSoon() {
  return (
    <Card className="text-center py-8">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
        <Eye size={28} />
      </div>
      <div className="type-section mb-1">{t('profile.comingSoonTitle')}</div>
      <p className="text-muted type-secondary mb-0">{t('profile.comingSoonHint')}</p>
    </Card>
  )
}
