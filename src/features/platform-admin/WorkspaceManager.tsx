import { useState } from 'react'
import { t } from '../../i18n'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import {
  Field,
  FormError,
  Select,
  TextInput,
} from '../../components/ui/form'
import { LoadingState } from '../../components/ui/states'
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  type FeatureKey,
  type LimitKey,
} from './entitlements'
import {
  useAccountOverrides,
  useEffectiveEntitlements,
  useRevokeAccountOverride,
  useSetAccountActivated,
  useSetAccountOverride,
  useSetSubscriptionPlan,
} from './hooks'
import { featureKeyLabel, limitKeyLabel, overrideKeyLabel, planLabel } from './labels'
import {
  isOverrideActive,
  PLAN_SLUGS,
  type PlatformWorkspace,
  type PlanSlug,
} from './panel'

/**
 * إدارة مساحة عمل واحدة من لوحة الأدمن (مهمة 17 — الخطوة 7):
 * تفعيل/إيقاف الحساب (0061)، تعيين الباقة (0061)، الاستحقاقات
 * الفعّالة (0059)، والتجاوزات الفردية قراءةً وإعداداً وإلغاءً
 * (0059). كل فعل خادمي بحارس أدمن + سطر تدقيق — الواجهة هنا مجرد
 * سطح؛ وأي فشل فعل يظهر برسالة مصممة (actionError) لا خطأ خام.
 */

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ar-EG')
}

/** تاريخ من حقل date إلى ISO بنهاية يومه المحلي */
function dateInputToIso(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString()
}

function formatLimit(limit: number | null): string {
  return limit === null
    ? t('platformAdmin.limitUnlimited')
    : limit.toLocaleString('ar-EG')
}

export function WorkspaceManager({ workspace }: { workspace: PlatformWorkspace }) {
  return (
    <Card className="space-y-5">
      <div>
        <h3 className="type-section mb-1">{t('platformAdmin.manageWorkspace')}</h3>
        <p className="text-muted type-secondary mb-0">
          {workspace.displayName} — {workspace.ownerEmail}
        </p>
      </div>
      <ActivationBlock workspace={workspace} />
      <PlanBlock workspace={workspace} />
      <EntitlementsBlock teacherId={workspace.teacherId} />
      <OverridesBlock teacherId={workspace.teacherId} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// تفعيل/إيقاف الحساب — مفتاح البايلوت (0061)
// ---------------------------------------------------------------------------

function ActivationBlock({ workspace }: { workspace: PlatformWorkspace }) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const mutation = useSetAccountActivated()
  const target = !workspace.accountActivated

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-semibold text-[15px]">
          {t('platformAdmin.colStatus')}:{' '}
          {workspace.accountActivated
            ? t('platformAdmin.statusActivated')
            : t('platformAdmin.statusDeactivated')}
        </span>
        {!confirming && (
          <Button
            size="sm"
            variant={target ? 'primary' : 'danger'}
            onClick={() => {
              mutation.reset()
              setConfirming(true)
            }}
          >
            {target
              ? t('platformAdmin.activate')
              : t('platformAdmin.deactivate')}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-3">
          <Field
            label={
              target
                ? t('platformAdmin.reasonActivateLabel')
                : t('platformAdmin.reasonDeactivateLabel')
            }
          >
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {mutation.isError && (
            <FormError message={t('platformAdmin.actionError')} />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={target ? 'primary' : 'danger'}
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate(
                  {
                    teacherId: workspace.teacherId,
                    activated: target,
                    reason,
                  },
                  {
                    onSuccess: () => {
                      setConfirming(false)
                      setReason('')
                    },
                  },
                )
              }
            >
              {t('platformAdmin.confirm')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {t('platformAdmin.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// تعيين الباقة (0061)
// ---------------------------------------------------------------------------

function PlanBlock({ workspace }: { workspace: PlatformWorkspace }) {
  const [planSlug, setPlanSlug] = useState<PlanSlug>(
    (PLAN_SLUGS as readonly string[]).includes(workspace.planSlug ?? '')
      ? (workspace.planSlug as PlanSlug)
      : 'trial',
  )
  const [trialDate, setTrialDate] = useState(
    workspace.trialEndsAt ? workspace.trialEndsAt.slice(0, 10) : '',
  )
  const mutation = useSetSubscriptionPlan()

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold text-[15px] mb-3">
        {t('platformAdmin.assignPlan')}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('platformAdmin.planSelectLabel')}>
          <Select
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value as PlanSlug)}
          >
            {PLAN_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {planLabel(slug)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('platformAdmin.trialEndsAtLabel')}>
          <TextInput
            type="date"
            value={trialDate}
            onChange={(e) => setTrialDate(e.target.value)}
          />
        </Field>
      </div>
      {mutation.isError && (
        <FormError message={t('platformAdmin.actionError')} />
      )}
      <Button
        size="sm"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            teacherId: workspace.teacherId,
            planSlug,
            trialEndsAt: trialDate === '' ? null : dateInputToIso(trialDate),
          })
        }
      >
        {t('platformAdmin.save')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// الاستحقاقات الفعّالة (0059) — قراءة فقط
// ---------------------------------------------------------------------------

function EntitlementsBlock({ teacherId }: { teacherId: string }) {
  const entQ = useEffectiveEntitlements(teacherId, true)
  const ent = entQ.data

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold text-[15px] mb-3">
        {t('platformAdmin.entitlements')}
      </h4>
      {entQ.isPending ? (
        <LoadingState />
      ) : entQ.isError ? (
        <p className="text-muted type-secondary mb-0">
          {t('platformAdmin.sectionLoadError')}
        </p>
      ) : !ent ? (
        <p className="text-muted type-secondary mb-0">
          {t('platformAdmin.comingSoonHint')}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-muted text-[12.5px] mb-1">
              {t('platformAdmin.entitlementsLimits')}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mb-0">
              {(
                [
                  ['maxStudents', 'max_students'],
                  ['maxMessagesMonth', 'max_messages_month'],
                  ['maxStorageMb', 'max_storage_mb'],
                  ['maxTeamMembers', 'max_team_members'],
                  ['maxAiMessagesMonth', 'max_ai_messages_month'],
                ] as const
              ).map(([field, key]) => (
                <div key={key} className="flex flex-col">
                  <dt className="text-muted text-[12.5px]">
                    {limitKeyLabel(key as LimitKey)}
                  </dt>
                  <dd className="text-[15px] font-semibold mb-0">
                    {formatLimit(ent.limits[field])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="text-muted text-[12.5px] mb-1">
              {t('platformAdmin.entitlementsFeatures')}
            </div>
            {FEATURE_KEYS.filter((k) => ent.features[k] === true).length ===
            0 ? (
              <p className="text-muted type-secondary mb-0">
                {t('platformAdmin.noFeatures')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {FEATURE_KEYS.filter((k) => ent.features[k] === true).map(
                  (k) => (
                    <span
                      key={k}
                      className="text-[12px] font-semibold text-primary-d bg-soft rounded-full px-2 py-0.5"
                    >
                      {featureKeyLabel(k as FeatureKey)}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>
          {ent.overridesApplied.length > 0 && (
            <p className="text-muted type-secondary mb-0">
              {t('platformAdmin.overridesAppliedLabel')}:{' '}
              {ent.overridesApplied
                .map((entry) => {
                  const [kind, key] = entry.split(':')
                  return overrideKeyLabel(
                    kind === 'limit' ? 'limit' : 'feature',
                    key ?? '',
                  )
                })
                .join(t('format.daysSeparator'))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// التجاوزات الفردية (0059) — قائمة + إعداد + إلغاء
// ---------------------------------------------------------------------------

function OverridesBlock({ teacherId }: { teacherId: string }) {
  const overridesQ = useAccountOverrides(teacherId, true)
  const revokeM = useRevokeAccountOverride()
  const setM = useSetAccountOverride()

  const [kind, setKind] = useState<'feature' | 'limit'>('feature')
  const [key, setKey] = useState<string>(FEATURE_KEYS[0])
  const [featureValue, setFeatureValue] = useState<'on' | 'off'>('on')
  const [limitValue, setLimitValue] = useState('')
  const [reason, setReason] = useState('')
  const [expiresDate, setExpiresDate] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [valueError, setValueError] = useState<string | null>(null)

  const keyOptions = kind === 'feature' ? FEATURE_KEYS : LIMIT_KEYS

  function submit() {
    setReasonError(null)
    setValueError(null)
    if (reason.trim() === '') {
      setReasonError(t('platformAdmin.overrideReasonRequired'))
      return
    }
    let value: boolean | number | null
    if (kind === 'feature') {
      value = featureValue === 'on'
    } else if (limitValue.trim() === '') {
      value = null
    } else {
      const parsed = Number(limitValue)
      if (!Number.isInteger(parsed) || parsed < 0) {
        setValueError(t('platformAdmin.overrideValueInvalid'))
        return
      }
      value = parsed
    }
    setM.mutate(
      {
        teacherId,
        kind,
        key,
        value,
        reason: reason.trim(),
        expiresAt: expiresDate === '' ? null : dateInputToIso(expiresDate),
      },
      {
        onSuccess: () => {
          setReason('')
          setLimitValue('')
          setExpiresDate('')
        },
      },
    )
  }

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold text-[15px] mb-3">
        {t('platformAdmin.overridesTitle')}
      </h4>

      {overridesQ.isPending ? (
        <LoadingState />
      ) : overridesQ.isError ? (
        <p className="text-muted type-secondary">
          {t('platformAdmin.sectionLoadError')}
        </p>
      ) : !overridesQ.data ? (
        <p className="text-muted type-secondary">
          {t('platformAdmin.comingSoonHint')}
        </p>
      ) : overridesQ.data.length === 0 ? (
        <p className="text-muted type-secondary">
          {t('platformAdmin.overridesEmpty')}
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {overridesQ.data.map((row) => {
            const active = isOverrideActive(row)
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 flex-wrap bg-soft rounded-xl px-3 py-2"
              >
                <div className="text-[13.5px]">
                  <span className="font-semibold">
                    {overrideKeyLabel(row.kind, row.key)}
                  </span>{' '}
                  —{' '}
                  {row.kind === 'feature'
                    ? row.value === true
                      ? t('platformAdmin.overrideValueOn')
                      : t('platformAdmin.overrideValueOff')
                    : formatLimit(
                        typeof row.value === 'number' ? row.value : null,
                      )}{' '}
                  <span className="text-muted">
                    ({row.reason}
                    {row.expiresAt
                      ? ` — ${formatDate(row.expiresAt)}`
                      : ''}
                    )
                  </span>{' '}
                  <span className="font-semibold">
                    {active
                      ? t('platformAdmin.overrideActive')
                      : t('platformAdmin.overrideExpired')}
                  </span>
                </div>
                {active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revokeM.isPending}
                    onClick={() => revokeM.mutate(row.id)}
                  >
                    {t('platformAdmin.overrideRevoke')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {revokeM.isError && (
        <FormError message={t('platformAdmin.actionError')} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('platformAdmin.overrideKindLabel')}>
          <Select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as 'feature' | 'limit'
              setKind(next)
              setKey(next === 'feature' ? FEATURE_KEYS[0] : LIMIT_KEYS[0])
            }}
          >
            <option value="feature">
              {t('platformAdmin.overrideKindFeature')}
            </option>
            <option value="limit">
              {t('platformAdmin.overrideKindLimit')}
            </option>
          </Select>
        </Field>
        <Field label={t('platformAdmin.overrideKeyLabel')}>
          <Select value={key} onChange={(e) => setKey(e.target.value)}>
            {keyOptions.map((k) => (
              <option key={k} value={k}>
                {overrideKeyLabel(kind, k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('platformAdmin.overrideValueLabel')}
          error={valueError}
        >
          {kind === 'feature' ? (
            <Select
              value={featureValue}
              onChange={(e) =>
                setFeatureValue(e.target.value as 'on' | 'off')
              }
            >
              <option value="on">{t('platformAdmin.overrideValueOn')}</option>
              <option value="off">{t('platformAdmin.overrideValueOff')}</option>
            </Select>
          ) : (
            <TextInput
              type="number"
              min={0}
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('platformAdmin.overrideExpiresLabel')}>
          <TextInput
            type="date"
            value={expiresDate}
            onChange={(e) => setExpiresDate(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={t('platformAdmin.overrideReasonLabel')}
        error={reasonError}
      >
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {setM.isError && <FormError message={t('platformAdmin.actionError')} />}
      <Button size="sm" disabled={setM.isPending} onClick={submit}>
        {t('platformAdmin.overrideAdd')}
      </Button>
    </div>
  )
}
