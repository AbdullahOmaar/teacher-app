import { useState } from 'react'
import {
  Building2,
  CheckCircle2,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import { t } from '../../i18n'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { ErrorState, LoadingState } from '../../components/ui/states'
import {
  useAddAllowlistEntry,
  useAllowlist,
  usePlatformIndicators,
  usePlatformOverview,
  usePlatformWorkspaces,
  useRegistrationOpen,
  useRemoveAllowlistEntry,
} from './hooks'
import { planLabel } from './labels'
import {
  panelSectionState,
  PLAN_SLUGS,
  whatsappSectionState,
  type PlatformWorkspace,
} from './panel'
import { ComingSoonCard, PanelSection } from './PanelSection'
import { WorkspaceManager } from './WorkspaceManager'

/**
 * لوحة أدمن المنصة (مهمة 17 — الأساس 0055 + اللوحة الكاملة 0061،
 * الخطوة 7): نظرة عامة ومؤشرات تجميعية + مساحات عمل بإجراءات إدارة
 * (تفعيل/باقة/تجاوزات) + قائمة سماح + قسم واتساب نائم بحالة «قريباً»
 * مصممة. الصفحة لا تُرسم إلا خلف RequirePlatformAdmin، وكل RPC
 * بحارس أدمن خادمي — الدفاع مزدوج (بوابة + قاعدة).
 * قاعدة مالك 2026-11-26: أي قسم مهاجراته غير مطبّقة بعد يعرض
 * «قريباً» مصممة — لا خطأ خام أبداً؛ والإيراد المتوقع «—» حتى
 * اعتماد الأسعار (قرار مالك م1) — لا رقم مخترع.
 */
export function PlatformAdminPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <header className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-card shadow-card flex items-center justify-center text-primary">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="type-title">{t('platformAdmin.pageTitle')}</h1>
            <p className="text-muted type-secondary">{t('platformAdmin.intro')}</p>
          </div>
        </header>

        <OverviewSection />
        <IndicatorsSection />
        <WorkspacesSection />
        <AllowlistSection />
        <WhatsappSection />

        <Card>
          <p className="text-muted type-secondary">{t('platformAdmin.foundationNote')}</p>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// النظرة العامة الأولية (0055) — كما هي من الخطوة 1
// ---------------------------------------------------------------------------

function OverviewSection() {
  const overviewQ = usePlatformOverview(true)

  return (
    <section className="space-y-3">
      <h2 className="type-section">{t('platformAdmin.overviewTitle')}</h2>
      {overviewQ.isPending ? (
        <LoadingState />
      ) : overviewQ.isError ? (
        <ErrorState
          message={t('platformAdmin.loadError')}
          onRetry={() => void overviewQ.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="text-center py-5">
            <Building2 size={22} className="mx-auto mb-2 text-primary" />
            <div className="type-title">{overviewQ.data.teachersTotal}</div>
            <div className="text-muted type-secondary">
              {t('platformAdmin.teachersTotal')}
            </div>
          </Card>
          <Card className="text-center py-5">
            <CheckCircle2 size={22} className="mx-auto mb-2 text-primary" />
            <div className="type-title">{overviewQ.data.teachersActivated}</div>
            <div className="text-muted type-secondary">
              {t('platformAdmin.teachersActivated')}
            </div>
          </Card>
          <Card className="text-center py-5">
            <GraduationCap size={22} className="mx-auto mb-2 text-primary" />
            <div className="type-title">{overviewQ.data.studentsTotal}</div>
            <div className="text-muted type-secondary">
              {t('platformAdmin.studentsTotal')}
            </div>
          </Card>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// مؤشرات المنصة (0061) — نمو + توزيع باقات + إيراد «—» بلا أسعار
// ---------------------------------------------------------------------------

function IndicatorsSection() {
  const indicatorsQ = usePlatformIndicators(true)
  const state = panelSectionState({
    pending: indicatorsQ.isPending,
    failed: indicatorsQ.isError,
    missing: indicatorsQ.data === null,
  })
  const data = indicatorsQ.data

  return (
    <PanelSection
      title={t('platformAdmin.indicatorsTitle')}
      state={state}
      onRetry={() => void indicatorsQ.refetch()}
    >
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="text-center py-5">
              <UserPlus size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">{data.teachersNew7d}</div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.teachersNew7d')}
              </div>
            </Card>
            <Card className="text-center py-5">
              <TrendingUp size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">{data.teachersNew30d}</div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.teachersNew30d')}
              </div>
            </Card>
            <Card className="text-center py-5">
              <Sparkles size={22} className="mx-auto mb-2 text-primary" />
              <div className="type-title">
                {t('platformAdmin.revenueUnknown')}
              </div>
              <div className="text-muted type-secondary">
                {t('platformAdmin.expectedRevenue')}
              </div>
              <div className="text-muted text-[12px] mt-1">
                {t('platformAdmin.revenueNote')}
              </div>
            </Card>
          </div>
          <Card>
            <div className="font-semibold text-[15px] mb-2">
              {t('platformAdmin.subscriptionsByPlan')}
            </div>
            <div className="flex flex-wrap gap-2">
              {PLAN_SLUGS.map((slug) => (
                <span
                  key={slug}
                  className="text-[13px] font-semibold bg-soft rounded-full px-3 py-1"
                >
                  {planLabel(slug)}: {data.subscriptionsByPlan[slug]}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------
// مساحات العمل (0061) — قائمة + إدارة مساحة مختارة
// ---------------------------------------------------------------------------

function WorkspacesSection() {
  const workspacesQ = usePlatformWorkspaces(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const state = panelSectionState({
    pending: workspacesQ.isPending,
    failed: workspacesQ.isError,
    missing: workspacesQ.data === null,
  })
  const workspaces = workspacesQ.data ?? []
  const selected =
    workspaces.find((w) => w.teacherId === selectedId) ?? null

  return (
    <PanelSection
      title={t('platformAdmin.workspacesTitle')}
      state={state}
      onRetry={() => void workspacesQ.refetch()}
    >
      {workspaces.length === 0 ? (
        <Card>
          <p className="text-muted type-secondary mb-0">
            {t('platformAdmin.workspacesEmpty')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {workspaces.map((w) => (
              <WorkspaceRow
                key={w.teacherId}
                workspace={w}
                selected={w.teacherId === selectedId}
                onSelect={() =>
                  setSelectedId(
                    w.teacherId === selectedId ? null : w.teacherId,
                  )
                }
              />
            ))}
          </div>
          {selected && (
            <WorkspaceManager key={selected.teacherId} workspace={selected} />
          )}
        </div>
      )}
    </PanelSection>
  )
}

function WorkspaceRow({
  workspace: w,
  selected,
  onSelect,
}: {
  workspace: PlatformWorkspace
  selected: boolean
  onSelect: () => void
}) {
  const trialPart = w.trialEndsAt
    ? ' · ' +
      t('platformAdmin.trialEndsLabel') +
      ': ' +
      new Date(w.trialEndsAt).toLocaleDateString('ar-EG')
    : ''
  return (
    <Card className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-[14px]">
        <span className="font-bold">{w.displayName}</span>{' '}
        <span className="text-muted">{w.ownerEmail}</span>
        <div className="text-muted text-[12.5px] mt-0.5">
          {t('platformAdmin.colPlan')}: {planLabel(w.planSlug)}
          {' · '}
          {w.accountActivated
            ? t('platformAdmin.statusActivated')
            : t('platformAdmin.statusDeactivated')}
          {' · '}
          {t('platformAdmin.colStudents')}: {w.studentsCount}
          {' · '}
          {t('platformAdmin.colLastActivity')}:{' '}
          {w.lastActivityAt
            ? new Date(w.lastActivityAt).toLocaleDateString('ar-EG')
            : t('platformAdmin.noActivity')}
          {trialPart}
        </div>
      </div>
      <Button size="sm" variant={selected ? 'soft' : 'ghost'} onClick={onSelect}>
        {t('platformAdmin.manage')}
      </Button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// قائمة السماح والتسجيل (0057) — إدارة الصفوف + عرض حالة القفل فقط
// ---------------------------------------------------------------------------

function AllowlistSection() {
  const allowlistQ = useAllowlist(true)
  const registrationQ = useRegistrationOpen(true)
  const addM = useAddAllowlistEntry()
  const removeM = useRemoveAllowlistEntry()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [contactError, setContactError] = useState<string | null>(null)

  const state = panelSectionState({
    pending: allowlistQ.isPending,
    failed: allowlistQ.isError,
    missing: allowlistQ.data === null,
  })
  const entries = allowlistQ.data ?? []

  function submit() {
    setContactError(null)
    if (email.trim() === '' && phone.trim() === '') {
      setContactError(t('platformAdmin.allowlistContactRequired'))
      return
    }
    addM.mutate(
      { email, phone, note },
      {
        onSuccess: () => {
          setEmail('')
          setPhone('')
          setNote('')
        },
      },
    )
  }

  return (
    <PanelSection
      title={t('platformAdmin.allowlistTitle')}
      state={state}
      onRetry={() => void allowlistQ.refetch()}
    >
      <div className="space-y-3">
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-semibold text-[15px]">
              {t('platformAdmin.registrationOpenLabel')}
            </span>
            <span className="text-[14px] font-semibold">
              {registrationQ.data === null || registrationQ.data === undefined
                ? t('platformAdmin.revenueUnknown')
                : registrationQ.data
                  ? t('platformAdmin.registrationOpen')
                  : t('platformAdmin.registrationClosed')}
            </span>
          </div>
          <p className="text-muted type-secondary mb-0 mt-1">
            {t('platformAdmin.registrationToggleNote')}
          </p>
        </Card>

        {entries.length === 0 ? (
          <Card>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.allowlistEmpty')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <Card
                key={entry.id}
                className="flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="text-[14px]">
                  <span className="font-semibold">
                    {entry.email ?? entry.phone ?? ''}
                  </span>
                  {entry.email && entry.phone && (
                    <span className="text-muted"> — {entry.phone}</span>
                  )}
                  {entry.note && (
                    <span className="text-muted"> ({entry.note})</span>
                  )}
                  <div className="text-muted text-[12.5px]">
                    {t('platformAdmin.allowlistAddedAt')}:{' '}
                    {new Date(entry.createdAt).toLocaleDateString('ar-EG')}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeM.isPending}
                  onClick={() => removeM.mutate(entry.id)}
                >
                  {t('platformAdmin.allowlistRemove')}
                </Button>
              </Card>
            ))}
          </div>
        )}
        {removeM.isError && (
          <FormError message={t('platformAdmin.actionError')} />
        )}

        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('platformAdmin.allowlistEmailLabel')}>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t('platformAdmin.allowlistPhoneLabel')}>
              <TextInput
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field
              label={t('platformAdmin.allowlistNoteLabel')}
              error={contactError}
            >
              <TextInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          {addM.isError && (
            <FormError message={t('platformAdmin.actionError')} />
          )}
          <Button size="sm" disabled={addM.isPending} onClick={submit}>
            {t('platformAdmin.allowlistAdd')}
          </Button>
        </Card>
      </div>
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------
// إعدادات واتساب المنصة — نائمة بحالة «قريباً» (لا رقم منصة بعد)
// ---------------------------------------------------------------------------

function WhatsappSection() {
  // لا رقم واتساب للمنصة مسجّلاً بعد ولا عدّادات استهلاك (الرقم قرار
  // مالك ق4 والعدّادات مع الخطوة 5/T24) — فالقسم «قريباً» دائماً في
  // هذه الخطوة، بقرار whatsappSectionState النقي.
  const state = whatsappSectionState({ platformNumberRegistered: false })
  const hint =
    t('platformAdmin.whatsappComingSoon') +
    ' — ' +
    t('platformAdmin.whatsappComingSoonHint')

  return (
    <section className="space-y-3">
      <h2 className="type-section flex items-center gap-2">
        <MessageCircle size={20} className="text-primary" />
        {t('platformAdmin.whatsappTitle')}
      </h2>
      {state === 'coming-soon' && <ComingSoonCard hint={hint} />}
    </section>
  )
}
