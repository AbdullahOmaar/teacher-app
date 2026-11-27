import { useRef, useState } from 'react'
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
import {
  Chip,
  ChipRow,
  Field,
  FormError,
  Select,
  TextArea,
  TextInput,
} from '../../components/ui/form'
import { ErrorState, LoadingState } from '../../components/ui/states'
import {
  useAddAllowlistEntry,
  useAdminReplyToTicket,
  useAdminTickets,
  useAdminTicketThread,
  useAllowlist,
  useAnnouncementsAdmin,
  useAuditLog,
  useCreateRoleTemplate,
  useDeleteAnnouncement,
  useInvalidatePanel,
  usePlatformIndicators,
  usePlatformOverview,
  usePlatformWorkspaces,
  usePublishAnnouncement,
  useRegistrationOpen,
  useRemoveAllowlistEntry,
  useRoleTemplates,
  useSetTicketStatus,
  useSetRegistrationOpen,
  useUpdateRoleTemplate,
} from './hooks'
import {
  autoMapAllowlistHeaders,
  downloadAllowlistTemplateXlsx,
  downloadWorkspacesXlsx,
  logExcelAudit,
  parseAllowlistFile,
  runAllowlistImport,
  type AllowlistImportSummary,
  type ParsedAllowlistFile,
} from './excel'
import {
  confirmationChannelLabel,
  featureKeyLabel,
  limitKeyLabel,
  overrideKeyLabel,
  planLabel,
} from './labels'
import {
  announcementKindLabel,
  ticketStatusLabel,
  ANNOUNCEMENT_KINDS,
  TICKET_STATUSES,
  type AnnouncementKind,
} from './announcements'
import {
  AUDIT_ACTIONS,
  panelSectionState,
  PLAN_SLUGS,
  whatsappSectionState,
  type AuditLogRow,
  type PlatformWorkspace,
} from './panel'
import type { TicketStatus } from '../support/api'
import { ComingSoonCard, PanelSection } from './PanelSection'
import { MfaSection } from './MfaScreens'
import {
  buildTemplateEntitlements,
  isTemplateEntitlementsEmpty,
  type RoleTemplate,
} from './templates'
import { WorkspaceManager } from './WorkspaceManager'
import {
  CONFIRMATION_CHANNELS,
  FEATURE_KEYS,
  LIMIT_KEYS,
  type ConfirmationChannel,
  type FeatureKey,
  type LimitKey,
} from './entitlements'

/**
 * لوحة أدمن المنصة (مهمة 17 — الأساس 0055 + اللوحة الكاملة 0061،
 * الخطوة 7 + سجل التدقيق 0066، الخطوة 6 + الإعلانات والتذاكر
 * 0065، الخطوة 8): نظرة عامة ومؤشرات تجميعية + مساحات عمل
 * بإجراءات إدارة (تفعيل/باقة/تجاوزات) + قائمة سماح وقلب قفل
 * التسجيل + سجل تدقيق المنصة + إعلانات المنصة وتذاكر الدعم +
 * قسم واتساب نائم بحالة «قريباً» مصممة. الصفحة لا تُرسم إلا
 * خلف RequirePlatformAdmin، وكل RPC بحارس أدمن خادمي — الدفاع
 * مزدوج (بوابة + قاعدة).
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
        <MfaSection />
        <IndicatorsSection />
        <WorkspacesSection />
        <TemplatesSection />
        <AllowlistSection />
        <AnnouncementsSection />
        <TicketsSection />
        <AuditLogSection />
        <ExcelSection />
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
// قوالب الأدوار الجاهزة (0063) — قائمة + إنشاء/تعديل + تفعيل/تعطيل.
// التطبيق على حساب بعينه من داخل WorkspaceManager (قسم «تطبيق قالب
// جاهز»)، لا من هنا — القالب هنا يُعرَّف فقط.
// ---------------------------------------------------------------------------

function TemplatesSection() {
  const templatesQ = useRoleTemplates(true)
  const updateM = useUpdateRoleTemplate()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const state = panelSectionState({
    pending: templatesQ.isPending,
    failed: templatesQ.isError,
    missing: templatesQ.data === null,
  })
  const templates = templatesQ.data ?? []
  const editing = templates.find((tpl) => tpl.id === editingId) ?? null

  function toggleActive(tpl: RoleTemplate) {
    updateM.mutate({
      templateId: tpl.id,
      name: tpl.name,
      description: tpl.description,
      entitlements: tpl.entitlements,
      isActive: !tpl.isActive,
    })
  }

  return (
    <PanelSection
      title={t('platformAdmin.templatesTitle')}
      state={state}
      onRetry={() => void templatesQ.refetch()}
    >
      <div className="space-y-3">
        {templates.length === 0 && !creating && !editing ? (
          <Card>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.templatesEmpty')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="text-[14px]">
                  <span className="font-bold">{tpl.name}</span>{' '}
                  <span className="text-muted">({tpl.slug})</span>{' '}
                  <span className="font-semibold">
                    {tpl.isActive
                      ? t('platformAdmin.templateActive')
                      : t('platformAdmin.templateInactive')}
                  </span>
                  <div className="text-muted text-[12.5px] mt-0.5">
                    {templateEntriesSummary(tpl)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false)
                      setEditingId(
                        editingId === tpl.id ? null : tpl.id,
                      )
                    }}
                  >
                    {t('platformAdmin.templateEdit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateM.isPending}
                    onClick={() => toggleActive(tpl)}
                  >
                    {tpl.isActive
                      ? t('platformAdmin.templateDeactivate')
                      : t('platformAdmin.templateActivate')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        {updateM.isError && (
          <FormError message={t('platformAdmin.actionError')} />
        )}

        {creating || editing ? (
          <TemplateForm
            initial={editing}
            onDone={() => {
              setCreating(false)
              setEditingId(null)
            }}
            onCancel={() => {
              setCreating(false)
              setEditingId(null)
            }}
          />
        ) : (
          <Button size="sm" onClick={() => setCreating(true)}>
            {t('platformAdmin.templateCreate')}
          </Button>
        )}
      </div>
    </PanelSection>
  )
}

/** ملخص إدخالات القالب: أسماء المفاتيح مفصولة بفاصلة عربية */
function templateEntriesSummary(tpl: RoleTemplate): string {
  const parts: string[] = []
  for (const key of Object.keys(tpl.entitlements.features)) {
    parts.push(overrideKeyLabel('feature', key))
  }
  for (const key of Object.keys(tpl.entitlements.limits)) {
    parts.push(overrideKeyLabel('limit', key))
  }
  for (const key of Object.keys(tpl.entitlements.settings)) {
    parts.push(overrideKeyLabel('setting', key))
  }
  return parts.join(t('format.daysSeparator'))
}

function TemplateForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: RoleTemplate | null
  onDone: () => void
  onCancel: () => void
}) {
  const createM = useCreateRoleTemplate()
  const updateM = useUpdateRoleTemplate()
  const editing = initial !== null

  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [features, setFeatures] = useState<Partial<Record<FeatureKey, boolean>>>(
    initial?.entitlements.features ?? {},
  )
  const [limitInputs, setLimitInputs] = useState<
    Partial<Record<LimitKey, string>>
  >(() => {
    const out: Partial<Record<LimitKey, string>> = {}
    if (initial) {
      for (const k of LIMIT_KEYS) {
        const v = initial.entitlements.limits[k]
        if (typeof v === 'number') out[k] = String(v)
      }
    }
    return out
  })
  const [unlimited, setUnlimited] = useState<
    Partial<Record<LimitKey, boolean>>
  >(() => {
    const out: Partial<Record<LimitKey, boolean>> = {}
    if (initial) {
      for (const k of LIMIT_KEYS) {
        if (initial.entitlements.limits[k] === null) out[k] = true
      }
    }
    return out
  })
  const [channel, setChannel] = useState<'' | ConfirmationChannel>(() => {
    const raw = initial?.entitlements.settings.confirmation_channel
    return raw !== undefined &&
      (CONFIRMATION_CHANNELS as readonly string[]).includes(raw)
      ? (raw as ConfirmationChannel)
      : ''
  })
  const [formError, setFormError] = useState<string | null>(null)

  function submit() {
    setFormError(null)
    if (!editing && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) {
      setFormError(t('platformAdmin.templateSlugInvalid'))
      return
    }
    if (name.trim() === '') {
      setFormError(t('platformAdmin.templateNameRequired'))
      return
    }
    for (const k of LIMIT_KEYS) {
      const raw = limitInputs[k]
      if (raw !== undefined && raw !== '' && !unlimited[k]) {
        const parsed = Number(raw)
        if (!Number.isInteger(parsed) || parsed < 0) {
          setFormError(t('platformAdmin.overrideValueInvalid'))
          return
        }
      }
    }
    const limits: Partial<Record<string, number | null>> = {}
    for (const k of LIMIT_KEYS) {
      if (unlimited[k]) {
        limits[k] = null
      } else if (
        limitInputs[k] !== undefined &&
        limitInputs[k] !== ''
      ) {
        limits[k] = Number(limitInputs[k])
      }
    }
    const entitlements = buildTemplateEntitlements({
      features,
      limits,
      settings:
        channel === '' ? {} : { confirmation_channel: channel },
    })
    if (isTemplateEntitlementsEmpty(entitlements)) {
      setFormError(t('platformAdmin.templateEmptyEntitlements'))
      return
    }
    if (editing && initial) {
      updateM.mutate(
        {
          templateId: initial.id,
          name: name.trim(),
          description: description.trim(),
          entitlements,
          isActive: initial.isActive,
        },
        { onSuccess: onDone },
      )
    } else {
      createM.mutate(
        {
          slug: slug.trim(),
          name: name.trim(),
          description: description.trim(),
          entitlements,
        },
        { onSuccess: onDone },
      )
    }
  }

  const pending = createM.isPending || updateM.isPending
  const failed = createM.isError || updateM.isError

  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!editing && (
          <Field label={t('platformAdmin.templateSlugLabel')}>
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
        )}
        <Field label={t('platformAdmin.templateNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('platformAdmin.templateDescriptionLabel')}>
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>

      <div>
        <div className="text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
          {t('platformAdmin.templateFeaturesLabel')}
        </div>
        <ChipRow>
          {FEATURE_KEYS.map((k) => (
            <Chip
              key={k}
              active={features[k] === true}
              onClick={() =>
                setFeatures((prev) => ({ ...prev, [k]: !(prev[k] === true) }))
              }
            >
              {featureKeyLabel(k)}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div>
        <div className="text-[13.5px] leading-[1.7] text-muted font-semibold mb-1">
          {t('platformAdmin.templateLimitsLabel')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LIMIT_KEYS.map((k) => (
            <Field key={k} label={limitKeyLabel(k)}>
              <div className="flex gap-2 items-center">
                <TextInput
                  type="number"
                  min={0}
                  disabled={unlimited[k] === true}
                  value={unlimited[k] === true ? '' : (limitInputs[k] ?? '')}
                  onChange={(e) =>
                    setLimitInputs((prev) => ({ ...prev, [k]: e.target.value }))
                  }
                />
                <label className="flex items-center gap-1.5 text-[13.5px] font-semibold whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlimited[k] === true}
                    onChange={(e) =>
                      setUnlimited((prev) => ({
                        ...prev,
                        [k]: e.target.checked,
                      }))
                    }
                  />
                  {t('platformAdmin.templateUnlimitedLabel')}
                </label>
              </div>
            </Field>
          ))}
        </div>
      </div>

      <Field label={t('platformAdmin.templateChannelLabel')}>
        <Select
          value={channel}
          onChange={(e) =>
            setChannel(e.target.value as '' | ConfirmationChannel)
          }
        >
          <option value="">{t('platformAdmin.templateChannelNone')}</option>
          {CONFIRMATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {confirmationChannelLabel(c)}
            </option>
          ))}
        </Select>
      </Field>

      {formError && <FormError message={formError} />}
      {failed && <FormError message={t('platformAdmin.actionError')} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {editing
            ? t('platformAdmin.templateSave')
            : t('platformAdmin.templateCreate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('platformAdmin.cancel')}
        </Button>
      </div>
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
  const toggleM = useSetRegistrationOpen()
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
          {registrationQ.data !== null &&
            registrationQ.data !== undefined && (
              <div className="mt-3">
                <Button
                  size="sm"
                  disabled={toggleM.isPending}
                  onClick={() =>
                    toggleM.mutate(!registrationQ.data)
                  }
                >
                  {registrationQ.data
                    ? t('platformAdmin.registrationCloseAction')
                    : t('platformAdmin.registrationOpenAction')}
                </Button>
                {toggleM.isError && (
                  <FormError message={t('platformAdmin.actionError')} />
                )}
              </div>
            )}
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
// استيراد/تصدير Excel (مهمة 23 — بلا مهاجرة جديدة): تصدير مساحات العمل
// .xlsx + استيراد جماعي لقائمة السماح من .xlsx/.csv. القسم «قريباً»
// عندما تغيب 0061 أو 0057 (بياناته null) — لا خطأ خام أبداً.
// ---------------------------------------------------------------------------

function excelReasonText(
  reason: AllowlistImportSummary['details'][number]['reason'],
): string {
  switch (reason) {
    case 'no-contact':
      return t('platformAdmin.excelReasonNoContact')
    case 'bad-email':
      return t('platformAdmin.excelReasonBadEmail')
    case 'bad-phone':
      return t('platformAdmin.excelReasonBadPhone')
    case 'duplicate':
      return t('platformAdmin.excelReasonDuplicate')
    case 'failed':
      return t('platformAdmin.excelReasonFailed')
    default:
      return t('platformAdmin.excelReasonFailed')
  }
}

function ExcelSection() {
  const workspacesQ = usePlatformWorkspaces(true)
  const allowlistQ = useAllowlist(true)
  const invalidate = useInvalidatePanel()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [parsed, setParsed] = useState<ParsedAllowlistFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<AllowlistImportSummary | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const state = panelSectionState({
    pending: workspacesQ.isPending || allowlistQ.isPending,
    failed: workspacesQ.isError || allowlistQ.isError,
    missing: workspacesQ.data === null || allowlistQ.data === null,
  })
  const workspaces = workspacesQ.data ?? []
  const entries = allowlistQ.data ?? []

  async function exportWorkspaces() {
    setExportError(null)
    setExporting(true)
    try {
      await downloadWorkspacesXlsx(workspaces)
      await logExcelAudit('workspaces_exported', { rows: workspaces.length })
    } catch {
      setExportError(t('platformAdmin.excelExportError'))
    } finally {
      setExporting(false)
    }
  }

  async function downloadTemplate() {
    setFileError(null)
    try {
      await downloadAllowlistTemplateXlsx()
    } catch {
      setFileError(t('platformAdmin.excelFileUnreadable'))
    }
  }

  async function onFileChosen(file: File | undefined) {
    setFileError(null)
    setSummary(null)
    setParsed(null)
    if (!file) return
    try {
      const parsedFile = await parseAllowlistFile(file)
      const mapping = autoMapAllowlistHeaders(parsedFile.headers)
      if (!mapping.includes('email') && !mapping.includes('phone')) {
        setFileError(t('platformAdmin.excelNoColumns'))
        return
      }
      setParsed(parsedFile)
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : t('platformAdmin.excelFileUnreadable'),
      )
    }
  }

  async function runImport() {
    if (!parsed || importing) return
    setImporting(true)
    try {
      const result = await runAllowlistImport(parsed, entries)
      setSummary(result)
      await logExcelAudit('allowlist_imported', {
        file: parsed.fileName,
        added: result.added,
        duplicates: result.duplicates,
        invalid: result.invalid,
        failed: result.failed,
      })
      invalidate()
    } finally {
      setImporting(false)
    }
  }

  return (
    <PanelSection
      title={t('platformAdmin.excelTitle')}
      state={state}
      onRetry={() => {
        void workspacesQ.refetch()
        void allowlistQ.refetch()
      }}
    >
      <div className="space-y-3">
        <p className="text-muted type-secondary mb-0">
          {t('platformAdmin.excelIntro')}
        </p>

        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-semibold text-[15px]">
              {t('platformAdmin.excelExportTitle')}
            </span>
            <Button
              size="sm"
              disabled={workspaces.length === 0 || exporting}
              onClick={() => void exportWorkspaces()}
            >
              {t('platformAdmin.excelExportButton')}
            </Button>
          </div>
          {workspaces.length === 0 && (
            <p className="text-muted type-secondary mb-0 mt-1">
              {t('platformAdmin.excelExportEmpty')}
            </p>
          )}
          {exportError && <FormError message={exportError} />}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-semibold text-[15px]">
              {t('platformAdmin.excelImportTitle')}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void downloadTemplate()}
              >
                {t('platformAdmin.excelTemplateButton')}
              </Button>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('platformAdmin.excelChooseFile')}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void onFileChosen(file)
            }}
          />
          {parsed && (
            <p className="text-muted type-secondary mt-2 mb-0">
              {t('platformAdmin.excelFileChosen', {
                name: parsed.fileName,
                rows: parsed.rawRows.length,
              })}
            </p>
          )}
          {fileError && <FormError message={fileError} />}
          {parsed && !summary && (
            <Button
              size="sm"
              disabled={importing}
              onClick={() => void runImport()}
            >
              {importing
                ? t('platformAdmin.excelImporting')
                : t('platformAdmin.excelImportRun')}
            </Button>
          )}
          {summary && (
            <div className="mt-3 space-y-2">
              <p className="font-semibold text-[14px] mb-0">
                {t('platformAdmin.excelSummaryTitle')}
              </p>
              <p className="text-muted type-secondary mb-0">
                {t('platformAdmin.excelSummaryAdded', { count: summary.added })}
                {' · '}
                {t('platformAdmin.excelSummaryDuplicates', {
                  count: summary.duplicates,
                })}
                {' · '}
                {t('platformAdmin.excelSummaryInvalid', { count: summary.invalid })}
                {' · '}
                {t('platformAdmin.excelSummaryFailed', { count: summary.failed })}
              </p>
              {summary.details.length > 0 && (
                <div className="space-y-1">
                  {summary.details.map((d) => (
                    <p key={d.row} className="text-muted type-secondary mb-0">
                      {t('platformAdmin.excelRowLabel', { row: d.row })}: {excelReasonText(d.reason)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------
// سجل تدقيق المنصة (0066 — الخطوة 6): كل فعل أدمن بفاعله وهدفه ووقته،
// بمرشّحي حساب وفعل. غياب 0066 يعرض «قريباً» المصممة كأي قسم.
// ---------------------------------------------------------------------------

/** تسمية فعل التدقيق — الفعل المجهول يظهر كما هو بلا اختراع */
function auditActionLabel(action: string): string {
  switch (action) {
    case 'override_set':
      return t('platformAdmin.auditActionOverrideSet')
    case 'override_revoked':
      return t('platformAdmin.auditActionOverrideRevoked')
    case 'account_activated':
      return t('platformAdmin.auditActionAccountActivated')
    case 'account_deactivated':
      return t('platformAdmin.auditActionAccountDeactivated')
    case 'subscription_plan_changed':
      return t('platformAdmin.auditActionSubscriptionPlanChanged')
    case 'allowlist_added':
      return t('platformAdmin.auditActionAllowlistAdded')
    case 'allowlist_removed':
      return t('platformAdmin.auditActionAllowlistRemoved')
    case 'registration_open_changed':
      return t('platformAdmin.auditActionRegistrationOpenChanged')
    default:
      return action
  }
}

function AuditLogSection() {
  const [teacherId, setTeacherId] = useState('')
  const [action, setAction] = useState('')
  const [limit, setLimit] = useState(20)
  const workspacesQ = usePlatformWorkspaces(true)
  const auditQ = useAuditLog(
    {
      limit,
      offset: 0,
      teacherId: teacherId === '' ? null : teacherId,
      action: action === '' ? null : action,
    },
    true,
  )

  const state = panelSectionState({
    pending: auditQ.isPending,
    failed: auditQ.isError,
    missing: auditQ.data === null,
  })
  const rows = auditQ.data?.rows ?? []
  const total = auditQ.data?.total ?? 0
  const workspaces = workspacesQ.data ?? []

  return (
    <PanelSection
      title={t('platformAdmin.auditTitle')}
      state={state}
      onRetry={() => void auditQ.refetch()}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] text-muted">
              {t('platformAdmin.auditTeacherFilter')}
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px]"
              value={teacherId}
              onChange={(e) => {
                setTeacherId(e.target.value)
                setLimit(20)
              }}
            >
              <option value="">{t('platformAdmin.auditAllTeachers')}</option>
              {workspaces.map((w) => (
                <option key={w.teacherId} value={w.teacherId}>
                  {w.displayName || w.ownerEmail}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] text-muted">
              {t('platformAdmin.auditActionFilter')}
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px]"
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setLimit(20)
              }}
            >
              <option value="">{t('platformAdmin.auditAllActions')}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabel(a)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <Card>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.auditEmpty')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row: AuditLogRow) => (
              <Card key={row.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-semibold text-[14px]">
                    {auditActionLabel(row.action)}
                  </span>
                  <span className="text-muted text-[12.5px]">
                    {new Date(row.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
                <div className="text-[13.5px] text-muted mt-1">
                  {row.adminLabel ?? t('platformAdmin.auditUnknownAdmin')}
                  {row.targetLabel ? (
                    <span> → {row.targetLabel}</span>
                  ) : row.targetTeacherId ? (
                    <span> → {t('platformAdmin.auditUnknownTeacher')}</span>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}

        {total > rows.length && (
          <Button
            size="sm"
            variant="ghost"
            disabled={auditQ.isFetching}
            onClick={() => setLimit((l) => l + 20)}
          >
            {t('platformAdmin.auditShowMore')}
          </Button>
        )}
      </div>
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------
// إعلانات المنصة (0065 — النشر والحذف من اللوحة)
// ---------------------------------------------------------------------------

function AnnouncementsSection() {
  const listQ = useAnnouncementsAdmin(true)
  const publishM = usePublishAnnouncement()
  const deleteM = useDeleteAnnouncement()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<AnnouncementKind>('general')
  const [scheduledAt, setScheduledAt] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)

  const state = panelSectionState({
    pending: listQ.isPending,
    failed: listQ.isError,
    missing: listQ.data === null,
  })
  const items = listQ.data ?? []

  function submit() {
    const trimmedTitle = title.trim()
    const b = body.trim()
    setTitleError(
      trimmedTitle === ''
        ? t('platformAdmin.announcementTitleRequired')
        : null,
    )
    setBodyError(b === '' ? t('platformAdmin.announcementBodyRequired') : null)
    if (trimmedTitle === '' || b === '') return
    publishM.mutate(
      {
        title: trimmedTitle,
        body: b,
        kind,
        scheduledAt: scheduledAt === '' ? null : scheduledAt,
      },
      {
        onSuccess: () => {
          setTitle('')
          setBody('')
          setScheduledAt('')
        },
      },
    )
  }

  return (
    <PanelSection
      title={t('platformAdmin.announcementsTitle')}
      state={state}
      onRetry={() => void listQ.refetch()}
    >
      <div className="space-y-3">
        {items.length === 0 ? (
          <Card>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.announcementsEmpty')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <Card key={a.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-semibold text-[15px]">{a.title}</span>
                  <span className="text-[12.5px] font-bold bg-soft text-text rounded-full px-2.5 py-0.5">
                    {announcementKindLabel(a.kind)}
                  </span>
                </div>
                <p className="text-[14px] leading-[1.8] mb-0 whitespace-pre-wrap">
                  {a.body}
                </p>
                <div className="text-muted text-[12.5px]">
                  {t('platformAdmin.announcementPublishedAt')}:{' '}
                  {new Date(a.publishedAt).toLocaleDateString('ar-EG')}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteM.isPending}
                  onClick={() => deleteM.mutate(a.id)}
                >
                  {t('platformAdmin.announcementDelete')}
                </Button>
              </Card>
            ))}
          </div>
        )}
        {deleteM.isError && (
          <FormError message={t('platformAdmin.actionError')} />
        )}

        <Card>
          <div className="space-y-3">
            <Field
              label={t('platformAdmin.announcementTitleLabel')}
              error={titleError}
            >
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field
              label={t('platformAdmin.announcementBodyLabel')}
              error={bodyError}
            >
              <TextArea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                rows={4}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t('platformAdmin.announcementKindLabel')}>
                <Select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as AnnouncementKind)
                  }
                >
                  {ANNOUNCEMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {announcementKindLabel(k)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('platformAdmin.announcementScheduledLabel')}>
                <TextInput
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </Field>
            </div>
          </div>
          {publishM.isError && (
            <FormError message={t('platformAdmin.actionError')} />
          )}
          <Button
            size="sm"
            disabled={publishM.isPending}
            onClick={submit}
          >
            {t('platformAdmin.announcementPublish')}
          </Button>
        </Card>
      </div>
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------
// تذاكر الدعم (0065 — القائمة والرد وتغيير الحالة من اللوحة)
// ---------------------------------------------------------------------------

function TicketsSection() {
  const [filter, setFilter] = useState<TicketStatus | null>(null)
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)

  const listQ = useAdminTickets(filter, true)
  const threadQ = useAdminTicketThread(
    openTicketId ?? undefined,
    openTicketId !== null,
  )
  const replyM = useAdminReplyToTicket()
  const statusM = useSetTicketStatus()

  const state = panelSectionState({
    pending: listQ.isPending,
    failed: listQ.isError,
    missing: listQ.data === null,
  })
  const items = listQ.data ?? []
  const thread = threadQ.data

  function onReply() {
    if (!openTicketId) return
    const text = reply.trim()
    if (text === '') {
      setReplyError(t('platformAdmin.ticketReplyRequired'))
      return
    }
    setReplyError(null)
    replyM.mutate(
      { ticketId: openTicketId, body: text },
      { onSuccess: () => setReply('') },
    )
  }

  return (
    <PanelSection
      title={t('platformAdmin.ticketsTitle')}
      state={state}
      onRetry={() => void listQ.refetch()}
    >
      <div className="space-y-3">
        <Card>
          <Field label={t('platformAdmin.ticketFilterLabel')}>
            <Select
              value={filter ?? 'all'}
              onChange={(e) =>
                setFilter(
                  e.target.value === 'all'
                    ? null
                    : (e.target.value as TicketStatus),
                )
              }
            >
              <option value="all">{t('platformAdmin.ticketFilterAll')}</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ticketStatusLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        {items.length === 0 ? (
          <Card>
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.ticketsEmpty')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((row) => {
              const open = openTicketId === row.id
              return (
                <Card key={row.id} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOpenTicketId(open ? null : row.id)}
                    className="w-full bg-transparent border-0 cursor-pointer text-start p-0 text-text"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-[15px] flex-1">
                        {row.subject}
                      </span>
                      <span className="text-[12.5px] font-bold bg-soft text-text rounded-full px-2.5 py-0.5">
                        {ticketStatusLabel(row.status)}
                      </span>
                    </div>
                    <div className="text-muted text-[12.5px]">
                      {t('platformAdmin.ticketTeacherLabel')}:{' '}
                      {row.teacherName ??
                        t('platformAdmin.ticketUnknownTeacher')}{' '}
                      — {new Date(row.createdAt).toLocaleDateString('ar-EG')}
                    </div>
                  </button>

                  {open && (
                    <div className="pt-3 border-t border-border space-y-3">
                      {threadQ.isPending ? (
                        <LoadingState />
                      ) : threadQ.isError || !thread ? (
                        <ErrorState
                          message={t('platformAdmin.sectionLoadError')}
                          onRetry={() => void threadQ.refetch()}
                        />
                      ) : (
                        <>
                          {thread.messages.length === 0 ? (
                            <p className="text-muted type-secondary mb-0">
                              {t('platformAdmin.ticketNoMessages')}
                            </p>
                          ) : (
                            thread.messages.map((m) => (
                              <div
                                key={m.id}
                                className={`rounded-xl px-3 py-2 text-[14px] leading-[1.8] ${
                                  m.authorKind === 'admin'
                                    ? 'bg-soft'
                                    : 'bg-ok-soft'
                                }`}
                              >
                                <div className="text-[12.5px] font-bold mb-1">
                                  {m.authorKind === 'admin'
                                    ? t('platformAdmin.ticketAuthorAdmin')
                                    : t('platformAdmin.ticketAuthorTeacher')}{' '}
                                  <span className="text-muted font-normal">
                                    —{' '}
                                    {new Date(m.createdAt).toLocaleDateString(
                                      'ar-EG',
                                    )}
                                  </span>
                                </div>
                                <div className="whitespace-pre-wrap">
                                  {m.body}
                                </div>
                              </div>
                            ))
                          )}
                          {thread.status === 'closed' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={statusM.isPending}
                              onClick={() =>
                                statusM.mutate({
                                  ticketId: thread.id,
                                  status: 'in_progress',
                                })
                              }
                            >
                              {t('platformAdmin.ticketReopen')}
                            </Button>
                          ) : (
                            <>
                              <Field
                                label={t('platformAdmin.ticketReplyLabel')}
                                error={replyError}
                              >
                                <TextArea
                                  value={reply}
                                  onChange={(e) => setReply(e.target.value)}
                                  maxLength={4000}
                                  rows={3}
                                />
                              </Field>
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  onClick={onReply}
                                  disabled={replyM.isPending}
                                >
                                  {t('platformAdmin.ticketReplySend')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={statusM.isPending}
                                  onClick={() =>
                                    statusM.mutate({
                                      ticketId: thread.id,
                                      status: 'closed',
                                    })
                                  }
                                >
                                  {t('platformAdmin.ticketClose')}
                                </Button>
                              </div>
                            </>
                          )}
                          {(replyM.isError || statusM.isError) && (
                            <FormError
                              message={t('platformAdmin.actionError')}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
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
