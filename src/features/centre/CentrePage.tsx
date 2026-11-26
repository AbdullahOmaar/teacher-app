import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck2, Clock, GraduationCap, Link2Off, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { SkeletonCards } from '../../components/ui/states'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatTime12 } from '../../lib/format'
import { PublicPageShell } from '../../components/PublicPageShell'
import { t } from '../../i18n'
import { fetchEnrolPage, type EnrolBrand } from '../enrol/api'

/**
 * صفحة السنتر العامة — قناة اكتساب (مهمة 12 — ج10-4).
 *
 * صفحة تعريفية عامة بلا جلسة وبلا AppShell: ‎/centre?t=<rawToken>‎ —
 * نفس رمز رابط الحجز (0019) ونفس الـRPC المقيدة الحقول
 * (enrolment_page_by_token): الهوية البيضاء + المجموعات النشطة
 * بمواعيدها فقط، بلا أي سطح بيانات جديد وبلا مهاجرة. دورها في قمع
 * الاكتساب: صفحة يشاركها السنتر في أي مكان (فيسبوك/واتساب/QR) تعرّف
 * بالمكان ومجموعاته، وزرها الواحد ينقل الزائر لصفحة الحجز بنفس الرمز.
 * القراءة فقط — لا نموذج هنا؛ الحجز يبقى في /book وحده.
 */

function CentreShell({
  children,
  brand,
}: {
  children: React.ReactNode
  brand?: EnrolBrand | null
}) {
  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('centre.pageLogoAlt')}
      fallbackTitle={t('centre.pageShellFallbackTitle')}
      subtitle={brand?.name ? t('centre.pageShellSubtitle') : null}
      FallbackIcon={GraduationCap}
    >
      {children}
    </PublicPageShell>
  )
}

function CentreMessage({
  icon: Icon,
  title,
  hint,
  brand,
}: {
  icon: IconComponent
  title: string
  hint: string
  brand?: EnrolBrand | null
}) {
  return (
    <CentreShell brand={brand}>
      <Card className="text-center py-8 rise-in">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
    </CentreShell>
  )
}

export function CentrePage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? params.get('token') ?? ''

  const pageQ = useQuery({
    queryKey: ['centre-page', token],
    enabled: Boolean(token),
    queryFn: () => fetchEnrolPage(token),
    retry: false,
  })

  if (!token) {
    return (
      <CentreMessage
        icon={Link2Off}
        title={t('centre.pageInvalidLinkTitle')}
        hint={t('centre.pageInvalidLinkHint')}
      />
    )
  }

  if (pageQ.isPending) {
    return (
      <CentreShell>
        <SkeletonCards cards={2} />
      </CentreShell>
    )
  }

  if (pageQ.isError || !pageQ.data) {
    return (
      <CentreMessage
        icon={Link2Off}
        title={t('centre.pageInvalidLinkTitle')}
        hint={t('centre.pageInvalidLinkHint')}
      />
    )
  }

  const { brand, groups } = pageQ.data

  return (
    <CentreShell brand={brand}>
      <Card className="rise-in mb-3">
        <div className="type-title mb-1">
          {brand.name
            ? t('centre.heroTitle', { name: brand.name })
            : t('centre.heroTitleFallback')}
        </div>
        <p className="text-muted type-secondary mb-0">{t('centre.heroBody')}</p>
      </Card>

      <div className="type-section mb-2 flex items-center gap-2">
        <Users size={20} className="text-primary" />
        {t('centre.groupsTitle')}
      </div>

      {groups.length === 0 ? (
        <Card className="text-center py-6 rise-in mb-3">
          <div className="type-section mb-1">{t('enrol.pageNoGroupsTitle')}</div>
          <p className="text-muted type-secondary mb-0">{t('enrol.pageNoGroupsHint')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {groups.map((g) => (
            <Card key={g.id} className="rise-in">
              <div className="font-bold text-[15.5px] mb-0.5">{g.name}</div>
              <div className="text-muted text-[13.5px] flex items-center gap-1.5">
                <Clock size={15} className="shrink-0" />
                {t('enrol.pageGroupSchedule', {
                  days: daysLabel(g.days),
                  time: formatTime12(g.start_time),
                  duration: g.duration_minutes,
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="rise-in mb-3">
        <div className="type-section mb-1">{t('centre.ctaTitle')}</div>
        <p className="text-muted type-secondary mb-3">{t('centre.ctaBody')}</p>
        <Link
          to={`/book?t=${encodeURIComponent(token)}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-[48px] w-full text-[15px] font-semibold bg-primary text-on-primary hover:opacity-90"
        >
          <CalendarCheck2 size={19} />
          {t('centre.ctaAction')}
        </Link>
      </Card>

      <p className="text-muted text-[12.5px] text-center mb-0">{t('centre.footerNote')}</p>
    </CentreShell>
  )
}
