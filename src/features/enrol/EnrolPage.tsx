import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  GraduationCap,
  Link2Off,
  Send,
  Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { SkeletonCards } from '../../components/ui/states'
import { Field, FormError, Select, TextArea, TextInput } from '../../components/ui/form'
import type { IconComponent } from '../../components/ui/EmptyState'
import { daysLabel, formatTime12 } from '../../lib/format'
import { PublicPageShell } from '../../components/PublicPageShell'
import { t } from '../../i18n'
import {
  EG_MOBILE_RE,
  enrolErrorInfo,
  fetchEnrolPage,
  normalizeEgPhone,
  submitBooking,
  type EnrolBrand,
} from './api'

/**
 * صفحة الحجز/التسجيل العامة — Phase 5 خطوة 2 (migration ‏0019).
 *
 * صفحة عامة بلا جلسة وبلا AppShell: /book?t=<rawToken> والسنتر يُعرَف
 * من التوكن وحده. كل القراءة والكتابة عبر دالتي RPC مقيدتي الحقول
 * بالـ anon key (enrolment_page_by_token / enrolment_submit_by_token) —
 * لا وصول مباشر لأي جدول. الصفحة تعرض هوية السنتر البيضاء ومجموعاته
 * النشطة فقط، والإرسال يهبط طلباً في قائمة انتظار المجموعة بمصدر
 * «صفحة الحجز» ليراجعه المدرس ويقبله من واجهة المجموعة.
 */

function EnrolShell({
  children,
  brand,
}: {
  children: React.ReactNode
  brand?: EnrolBrand | null
}) {
  // (COD-5: الصدفة نفسها مشتركة في PublicPageShell — الفروق المحفوظة
  // هنا: أيقونة السقوط GraduationCap وعنوان/Subtitle التسجيل، بلا دُفّي.)
  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('enrol.pageLogoAlt')}
      fallbackTitle={t('enrol.pageShellFallbackTitle')}
      subtitle={brand?.name ? t('enrol.pageShellSubtitle') : null}
      FallbackIcon={GraduationCap}
    >
      {children}
    </PublicPageShell>
  )
}

function EnrolMessage({
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
    <EnrolShell brand={brand}>
      <Card className="text-center py-8 rise-in">
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
          <Icon size={28} />
        </div>
        <div className="type-section mb-1">{title}</div>
        <p className="text-muted type-secondary mb-0">{hint}</p>
      </Card>
    </EnrolShell>
  )
}

export function EnrolPage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? params.get('token') ?? ''

  const pageQ = useQuery({
    queryKey: ['enrol-page', token],
    enabled: Boolean(token),
    queryFn: () => fetchEnrolPage(token),
    retry: false,
  })

  const [studentName, setStudentName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [groupId, setGroupId] = useState('')
  const [wantsTrial, setWantsTrial] = useState(false)
  const [note, setNote] = useState('')
  const [website, setWebsite] = useState('') // honeypot — يبقى فارغاً من البشر
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <EnrolMessage
        icon={Link2Off}
        title={t('enrol.pageInvalidLinkTitle')}
        hint={t('enrol.pageInvalidLinkHint')}
      />
    )
  }

  if (pageQ.isPending) {
    return (
      <EnrolShell>
        <SkeletonCards cards={2} />
      </EnrolShell>
    )
  }

  if (pageQ.isError || !pageQ.data) {
    const info = enrolErrorInfo(pageQ.error)
    return <EnrolMessage icon={Link2Off} title={info.title} hint={info.hint} />
  }

  const { brand, groups } = pageQ.data

  if (done) {
    return (
      <EnrolShell brand={brand}>
        <Card className="text-center py-8 rise-in">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-ok/10 text-ok flex items-center justify-center">
            <CheckCircle2 size={28} />
          </div>
          <div className="type-section mb-1">{t('enrol.pageDoneTitle')}</div>
          <p className="text-muted type-secondary mb-0">
            {t('enrol.pageDoneThanks')}{brand.name ? t('enrol.pageDoneArrived', { name: brand.name }) : ''}{t('enrol.pageDoneBody')}
          </p>
        </Card>
      </EnrolShell>
    )
  }

  if (groups.length === 0) {
    return (
      <EnrolMessage
        icon={Users}
        brand={brand}
        title={t('enrol.pageNoGroupsTitle')}
        hint={t('enrol.pageNoGroupsHint')}
      />
    )
  }

  const onSubmit = async () => {
    setFormError(null)
    const name = studentName.trim()
    if (name.length < 3) return setFormError(t('enrol.pageNameError'))
    const phone = normalizeEgPhone(guardianPhone)
    if (!EG_MOBILE_RE.test(phone)) {
      return setFormError(t('enrol.pagePhoneError'))
    }
    if (!groupId) return setFormError(t('enrol.pageGroupError'))
    setSubmitting(true)
    try {
      await submitBooking(token, {
        studentName: name,
        guardianPhone: phone,
        groupId,
        wantsTrial,
        note: note.trim() === '' ? null : note.trim(),
        honeypot: website,
      })
      setDone(true)
    } catch (e) {
      const info = enrolErrorInfo(e)
      setFormError(`${info.title} — ${info.hint}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <EnrolShell brand={brand}>
      <Card className="rise-in">
        <div className="flex items-center gap-2 mb-1">
          <CalendarCheck2 size={22} className="text-primary" />
          <h1 className="type-section mt-0 mb-0">{t('enrol.pageFormTitle')}</h1>
        </div>
        <p className="text-muted type-secondary mt-0">
          {t('enrol.pageFormIntro')}
        </p>

        <Field label={t('enrol.pageStudentNameLabel')}>
          <TextInput
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder={t('enrol.pageStudentNamePlaceholder')}
            autoComplete="name"
          />
        </Field>

        <Field label={t('enrol.pageGuardianPhoneLabel')}>
          <TextInput
            type="tel"
            dir="ltr"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            autoComplete="tel"
          />
        </Field>

        <Field label={t('enrol.pageGroupLabel')}>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('enrol.pageGroupPlaceholder')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {t('enrol.pageGroupOption', { name: g.name, days: daysLabel(g.days), time: formatTime12(g.start_time) })}
              </option>
            ))}
          </Select>
        </Field>

        {groupId && (
          <p className="text-muted text-[13.5px] -mt-1 mb-3 flex items-center gap-1.5">
            <Clock size={15} className="shrink-0" />
            {(() => {
              const g = groups.find((x) => x.id === groupId)
              return g
                ? t('enrol.pageGroupSchedule', { days: daysLabel(g.days), time: formatTime12(g.start_time), duration: g.duration_minutes })
                : ''
            })()}
          </p>
        )}

        <label className="flex items-center gap-2.5 mb-3 cursor-pointer min-h-[48px]">
          <input
            type="checkbox"
            checked={wantsTrial}
            onChange={(e) => setWantsTrial(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
          <span className="text-[15px] font-semibold">{t('enrol.pageTrialLabel')}</span>
        </label>

        <Field label={t('enrol.pageNoteLabel')}>
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('enrol.pageNotePlaceholder')}
            maxLength={500}
          />
        </Field>

        {/* honeypot: حقل مخفي بصرياً بنمط visually-hidden (بلا إزاحات سالبة —
            الإزاحة خارج الشاشة توسّع عرض الصفحة أفقياً خصوصاً في RTL).
            تعبئته تعني بوت، والخادم يسقطه صامتاً */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          <label>
            {t('enrol.pageHoneypotLabel')}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        {formError && <FormError message={formError} />}
        <Button full onClick={() => void onSubmit()} disabled={submitting}>
          <Send size={18} />
          {submitting ? t('enrol.pageSubmitting') : t('enrol.pageSubmitAction')}
        </Button>
        <p className="text-muted text-[12.5px] text-center mb-0 mt-3">
          {t('enrol.pagePrivacyNote')}
        </p>
      </Card>
    </EnrolShell>
  )
}
